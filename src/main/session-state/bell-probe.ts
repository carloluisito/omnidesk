// BEL (\x07) probe scanner — EXPERIMENT instrumentation, enabled only via the
// OMNIDESK_DEBUG_BELL env flag (see SessionManager.wireCliManager).
//
// Hypothesis under test: agent CLIs (Claude Code) ring the terminal bell at
// "needs the user" moments (permission prompt, turn finish), giving the
// attention-router a byte-cheap signal that sidesteps the alt-screen repaint
// problem that blocks tail classification. This scanner only OBSERVES: it
// reports every BEL with ~40 chars of surrounding context so a real session
// can be recorded byte-for-byte. No classification, no state changes.

/** Context window kept on each side of a BEL (chars). */
const CONTEXT = 40;

export interface BellEvent {
  /** 1-based ordinal of this BEL within the session. */
  seq: number;
  /** Escaped, one-line context: ≤40 chars before + '⟬BEL⟭' + ≤40 chars after. */
  context: string;
}

/** Render control bytes as printable escapes so log lines stay single-line. */
function escapeControl(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]/g, ch => {
    if (ch === '\r') return '\\r';
    if (ch === '\n') return '\\n';
    if (ch === '\t') return '\\t';
    return `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}

/**
 * Stateful per-session scanner. Feed it every flushed PTY chunk; it returns a
 * BellEvent per \x07 found. Keeps the previous chunk's tail so a BEL landing
 * right after a 16ms flush boundary still gets leading context.
 */
export class BellScanner {
  private tail = '';
  private seq = 0;

  feed(data: string): BellEvent[] {
    if (!data.includes('\x07')) {
      this.tail = (this.tail + data).slice(-CONTEXT);
      return [];
    }
    const buf = this.tail + data;
    const offset = this.tail.length;
    const events: BellEvent[] = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== '\x07') continue;
      const pos = offset + i;
      const before = escapeControl(buf.slice(Math.max(0, pos - CONTEXT), pos));
      const after = escapeControl(buf.slice(pos + 1, pos + 1 + CONTEXT));
      events.push({ seq: ++this.seq, context: `${before}⟬BEL⟭${after}` });
    }
    this.tail = buf.slice(-CONTEXT);
    return events;
  }
}
