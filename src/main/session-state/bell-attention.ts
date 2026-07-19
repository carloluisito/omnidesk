// BareBellDetector — turns a PTY byte stream into "the CLI rang its bell"
// events for the attention router.
//
// Claude Code (with preferredNotifChannel="terminal_bell") rings BEL (\x07)
// exactly when it needs the user: turn finished, or an interactive question/
// permission prompt is on screen — and stays silent while working. Verified
// byte-for-byte in docs/experiments/2026-07-19-bell-attention-probe.md.
//
// The one trap (observed live): BEL doubles as the terminator of OSC strings
// (window titles, OSC 52 clipboard writes), so a naive \x07 counter misfires.
// This detector tracks the ANSI string-sequence state and counts only BARE
// BELs. State persists across feed() calls because CLIManager's 16ms batching
// can split a sequence across chunks.

const enum ParseState {
  /** Ordinary output — a BEL here is a real bell. */
  Normal,
  /** Just saw ESC; the next byte decides. */
  Esc,
  /** Inside an OSC/DCS/APC/PM/SOS string — BEL or ST ends it, never counts. */
  InString,
  /** Saw ESC inside a string — '\' completes the ST terminator. */
  InStringEsc,
}

const ESC = '\x1b';
const BEL = '\x07';
/** String-sequence introducers following ESC: OSC ] DCS P APC _ PM ^ SOS X */
const STRING_INTRODUCERS = new Set([']', 'P', '_', '^', 'X']);

export class BareBellDetector {
  private state: ParseState = ParseState.Normal;

  /** Feed a flushed PTY chunk; returns how many BARE bells it contained. */
  feed(data: string): number {
    let bells = 0;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      switch (this.state) {
        case ParseState.Normal:
          if (ch === ESC) this.state = ParseState.Esc;
          else if (ch === BEL) bells++;
          break;
        case ParseState.Esc:
          if (STRING_INTRODUCERS.has(ch)) this.state = ParseState.InString;
          else if (ch !== ESC) this.state = ParseState.Normal;
          // (ESC ESC: stay in Esc — the last ESC is still pending)
          break;
        case ParseState.InString:
          if (ch === BEL) this.state = ParseState.Normal; // OSC BEL terminator
          else if (ch === ESC) this.state = ParseState.InStringEsc;
          break;
        case ParseState.InStringEsc:
          if (ch === '\\') this.state = ParseState.Normal; // ST (ESC \)
          else if (ch === BEL) this.state = ParseState.Normal; // string ended anyway
          else this.state = ParseState.InString; // stray ESC was string data
          break;
      }
    }
    return bells;
  }
}
