// OscTitleParser — extracts terminal-title updates from the raw PTY stream.
//
// CLIs announce what they're doing via OSC 0 (icon+title) and OSC 2 (title):
//   ESC ] 0 ; <title> BEL      or      ESC ] 0 ; <title> ESC \
// OmniDesk taps every PTY byte in SessionManager.wireCliManager, so parsing
// these gives unnamed sessions a live "what is this agent working on" label.
// Chunk-boundary safe (CLIManager batches output every 16ms) — state persists
// across feed() calls, same pattern as BareBellDetector.

const enum ParseState {
  Normal,
  Esc, // saw ESC
  OscCode, // inside "ESC ]", accumulating the numeric code
  OscPayload, // past the ';' of a title OSC — accumulating the title
  OscSkip, // a non-title OSC — consume until terminator
  OscPayloadEsc, // ESC inside payload (ST pending)
  OscSkipEsc, // ESC inside skipped OSC (ST pending)
}

const ESC = '\x1b';
const BEL = '\x07';
/** Titles longer than this are truncated — no CLI emits sane titles this long. */
const TITLE_MAX = 512;

export class OscTitleParser {
  private state: ParseState = ParseState.Normal;
  private code = '';
  private payload = '';

  /** Feed a flushed PTY chunk; returns any complete titles it contained. */
  feed(data: string): string[] {
    const titles: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      switch (this.state) {
        case ParseState.Normal:
          if (ch === ESC) this.state = ParseState.Esc;
          break;
        case ParseState.Esc:
          if (ch === ']') {
            this.state = ParseState.OscCode;
            this.code = '';
          } else if (ch !== ESC) {
            this.state = ParseState.Normal;
          }
          break;
        case ParseState.OscCode:
          if (ch === ';') {
            const isTitle = this.code === '0' || this.code === '2';
            this.state = isTitle ? ParseState.OscPayload : ParseState.OscSkip;
            this.payload = '';
          } else if (ch === BEL) {
            this.state = ParseState.Normal; // e.g. "ESC]133A" variants — done
          } else if (ch === ESC) {
            this.state = ParseState.OscSkipEsc;
          } else if (/[0-9]/.test(ch) && this.code.length < 8) {
            this.code += ch;
          } else {
            // Non-numeric code (rare) — not a title, skip to terminator.
            this.state = ParseState.OscSkip;
          }
          break;
        case ParseState.OscPayload:
          if (ch === BEL) {
            titles.push(this.payload);
            this.state = ParseState.Normal;
          } else if (ch === ESC) {
            this.state = ParseState.OscPayloadEsc;
          } else if (this.payload.length < TITLE_MAX) {
            this.payload += ch;
          }
          break;
        case ParseState.OscPayloadEsc:
          if (ch === '\\') {
            titles.push(this.payload);
            this.state = ParseState.Normal;
          } else if (ch === BEL) {
            titles.push(this.payload);
            this.state = ParseState.Normal;
          } else {
            // Stray ESC was payload data; keep going.
            this.state = ParseState.OscPayload;
          }
          break;
        case ParseState.OscSkip:
          if (ch === BEL) this.state = ParseState.Normal;
          else if (ch === ESC) this.state = ParseState.OscSkipEsc;
          break;
        case ParseState.OscSkipEsc:
          if (ch === '\\' || ch === BEL) this.state = ParseState.Normal;
          else this.state = ParseState.OscSkip;
          break;
      }
    }
    return titles;
  }
}

/** Leading status glyphs Claude Code prefixes titles with: braille spinner
 *  frames while working, ✳-family dingbats when settled. */
const LEADING_GLYPHS = /^[⠀-⣿✀-➿─-◿·∗*+~\s]+/u;
/** Placeholder titles that carry no task information. */
const GENERIC_TITLES = new Set(['claude', 'claude code']);

/**
 * Turn a raw terminal title into a session-name candidate, or null if the
 * title carries no task information. Observed Claude Code format (2026-07-19):
 * "<glyph> <task summary>" — e.g. "⠂ Fix login bug" / "✳ Fix login bug".
 * The payload is untrusted PTY output: control chars are stripped, whitespace
 * collapsed, and the result capped at 50 chars (the session:rename limit).
 */
export function extractTaskTitle(raw: string): string | null {
  if (/\.exe\b/i.test(raw)) return null; // shell/launcher spawn junk
  let text = raw.replace(LEADING_GLYPHS, '');
  text = text.replace(/[\x00-\x1f\x7f]/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (GENERIC_TITLES.has(text.toLowerCase())) return null;
  if (text.length > 50) text = text.slice(0, 50).trimEnd();
  return text;
}
