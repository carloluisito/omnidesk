export const KITTY_DISAMBIGUATE = 1;
export const KITTY_REPORT_EVENTS = 2;
export const KITTY_REPORT_ALTERNATE = 4;
export const KITTY_REPORT_ALL_KEYS = 8;
export const KITTY_REPORT_TEXT = 16;

const MAX_STACK = 16; // cap stack size (spec: cap to avoid DoS)
const MAX_CARRY = 4096; // drop a pathologically long unterminated CSI to bound memory

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
    this.carry = partial ? partial[0] : '';
    // A real protocol sequence is short; a multi-KB unterminated CSI is garbage —
    // drop it so a hostile/garbled stream can't grow carry without bound.
    if (this.carry.length > MAX_CARRY) this.carry = '';
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

const NAMED_CODEPOINTS: Record<string, number> = {
  Escape: 27, Enter: 13, Tab: 9, Backspace: 127,
};

// Keys xterm.js already emits as correct legacy CSI sequences in every mode.
const XTERM_NATIVE_KEYS = new Set<string>([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

const BARE_MODIFIER_KEYS = new Set<string>([
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock',
]);

// US-layout map from physical key code to its UNSHIFTED character codepoint,
// for punctuation whose .key changes with Shift. Letters/digits derived from .code.
const CODE_TO_UNSHIFTED: Record<string, number> = {
  Backquote: 96, Minus: 45, Equal: 61, BracketLeft: 91, BracketRight: 93,
  Backslash: 92, Semicolon: 59, Quote: 39, Comma: 44, Period: 46, Slash: 47,
  Space: 32,
};

function unshiftedCodepoint(e: KeyboardEvent): number | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3) + 32; // KeyA -> 'a'
  if (/^Digit[0-9]$/.test(e.code)) return e.code.charCodeAt(5);    // Digit5 -> '5'
  if (e.code in CODE_TO_UNSHIFTED) return CODE_TO_UNSHIFTED[e.code];
  if (e.key.length === 1) return e.key.toLowerCase().codePointAt(0) ?? null; // fallback
  return null;
}

function kittyModifierBits(e: KeyboardEvent): number {
  let m = 0;
  if (e.shiftKey) m |= 1;
  if (e.altKey) m |= 2;
  if (e.ctrlKey) m |= 4;
  if (e.metaKey) m |= 8;
  return m;
}

function buildCsiU(cp: number, modBits: number, isRelease: boolean, reportEvents: boolean): string {
  const modField = modBits + 1;
  const needEvent = reportEvents && isRelease;
  let seq = `\x1b[${cp}`;
  if (modField !== 1 || needEvent) {
    seq += `;${modField}`;
    if (needEvent) seq += ':3';
  }
  return seq + 'u';
}

/** Returns CSI-u bytes to send to the PTY, or null to let xterm emit its normal output. */
export function encodeKittyKey(e: KeyboardEvent, flags: number): string | null {
  if (flags === 0) return null;
  const reportEvents = (flags & KITTY_REPORT_EVENTS) !== 0;
  const reportAll = (flags & KITTY_REPORT_ALL_KEYS) !== 0;

  const isRelease = e.type === 'keyup';
  if (isRelease && !reportEvents) return null; // releases only when requested

  if (BARE_MODIFIER_KEYS.has(e.key)) return null; // v1: don't encode modifier-only keys
  if (XTERM_NATIVE_KEYS.has(e.key)) return null;  // xterm legacy CSI is already correct

  const named = e.key in NAMED_CODEPOINTS;
  const cp = named ? NAMED_CODEPOINTS[e.key] : unshiftedCodepoint(e);
  if (cp === null) return null; // unknown special key — let xterm handle it

  const modBits = kittyModifierBits(e);
  const hasCtrlAltSuper = (modBits & (2 | 4 | 8)) !== 0;

  if (!reportAll) {
    // Escape is always disambiguated to CSI 27 u.
    if (e.key === 'Escape') return buildCsiU(cp, modBits, isRelease, reportEvents);
    // Enter/Tab/Backspace keep legacy bytes unless modified.
    if (named && !hasCtrlAltSuper) return null;
    // Plain/Shifted text keys keep legacy text; only Ctrl/Alt/Super combos are encoded.
    if (!hasCtrlAltSuper) return null;
  }

  return buildCsiU(cp, modBits, isRelease, reportEvents);
}
