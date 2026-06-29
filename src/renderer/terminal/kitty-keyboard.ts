export const KITTY_DISAMBIGUATE = 1;
export const KITTY_REPORT_EVENTS = 2;
export const KITTY_REPORT_ALTERNATE = 4;
export const KITTY_REPORT_ALL_KEYS = 8;
export const KITTY_REPORT_TEXT = 16;

const MAX_STACK = 16; // cap stack size (spec: cap to avoid DoS)

// Matches a complete CSI sequence: ESC [ <private> <params> <final>.
// Private marker is one of < > = ? (optional); params are digits ; :; final is a letter or ~.
const CSI_RE = /\x1b\[([<>=?]?)([0-9;:]*)([A-Za-z~])/g;

export class KittyKeyboardState {
  private mainStack: number[] = [];
  private altStack: number[] = [];
  private onAltScreen = false;
  private carry = ''; // trailing partial escape sequence held across chunks

  get flags(): number {
    const stack = this.onAltScreen ? this.altStack : this.mainStack;
    return stack.length ? stack[stack.length - 1] : 0;
  }

  reset(): void {
    this.mainStack = [];
    this.altStack = [];
    this.onAltScreen = false;
    this.carry = '';
  }

  /** Consume one PTY output chunk; return bytes to send back to the PTY (query reply) or ''. */
  processOutput(data: string): string {
    const buf = this.carry + data;
    let response = '';
    let lastEnd = 0;

    CSI_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSI_RE.exec(buf)) !== null) {
      const [seq, priv, params, final] = m;
      lastEnd = m.index + seq.length;
      response += this.dispatch(priv, params, final);
    }

    // Hold any trailing incomplete escape (ESC, ESC[, or ESC[<params> with no final byte).
    const tail = buf.slice(lastEnd);
    const partial = /\x1b\[?[<>=?]?[0-9;:]*$/.exec(tail);
    this.carry = partial ? partial[0] : (tail.endsWith('\x1b') ? '\x1b' : '');
    return response;
  }

  private dispatch(priv: string, params: string, final: string): string {
    const stack = this.onAltScreen ? this.altStack : this.mainStack;

    // Alt-screen enter/leave: CSI ? 1049 h / l
    if (priv === '?' && (final === 'h' || final === 'l') && params === '1049') {
      this.onAltScreen = final === 'h';
      return '';
    }

    if (final !== 'u') return ''; // not a keyboard-protocol sequence

    const nums = params.split(/[;:]/).filter((p) => p !== '').map(Number);

    if (priv === '>') {
      // push: CSI > flags u (flags default 0)
      const flags = nums.length ? nums[0] : 0;
      stack.push(flags & 31);
      if (stack.length > MAX_STACK) stack.shift();
      return '';
    }
    if (priv === '<') {
      // pop: CSI < number u (default 1)
      const count = nums.length ? nums[0] : 1;
      for (let i = 0; i < count && stack.length; i++) stack.pop();
      return '';
    }
    if (priv === '=') {
      // set: CSI = flags ; mode u (mode default 1)
      const flags = (nums.length ? nums[0] : 0) & 31;
      const mode = nums.length > 1 ? nums[1] : 1;
      const cur = stack.length ? stack[stack.length - 1] : 0;
      let next = cur;
      if (mode === 1) next = flags;              // set given, reset others
      else if (mode === 2) next = cur | flags;   // OR
      else if (mode === 3) next = cur & ~flags;  // clear
      if (stack.length) stack[stack.length - 1] = next;
      else stack.push(next);
      return '';
    }
    if (priv === '?') {
      // query: CSI ? u -> reply CSI ? <flags> u
      return `\x1b[?${this.flags}u`;
    }
    return '';
  }
}
