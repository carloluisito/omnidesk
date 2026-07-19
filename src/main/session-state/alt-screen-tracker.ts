// Tracks whether the terminal is currently in the alternate screen buffer
// (i.e. a full-screen TUI, editor, or pager is currently open) by scanning
// raw PTY output chunks for DEC private mode set/reset sequences.
//
// Recognized modes (all treated as "alt screen" for our purposes):
//   - 1049 (alt screen buffer + cursor save/restore — used by vim, less, htop, …)
//   - 1047 (alt screen buffer, no cursor save/restore — legacy)
//   - 47   (alt screen buffer — very old legacy)
//
// ENTER: CSI ? <params> h   where <params> contains one of 1049/1047/47
// EXIT:  CSI ? <params> l   where <params> contains one of 1049/1047/47
//
// A single DECSET/DECRST can set multiple modes in one sequence, e.g.
// `CSI ?1049;2004h` enables both the alt screen (1049) and bracketed paste
// (2004) in one go. The params must be split on ';' and each checked for
// membership in the alt-screen mode set — testing the whole param string for
// equality would miss this (and any other) multi-param case.
//
// Chunk boundary caveat (intentional, not a bug): if a single escape
// sequence is split across two `process()` calls (e.g. the PTY write
// boundary lands mid-sequence, like "...\x1b[?10" | "49h..."), this
// tail-heuristic will miss that transition. In practice PTYs very rarely
// split escape sequences this way, and reassembling a cross-chunk carry
// buffer is not worth the complexity for a heuristic used only to gate UI
// state — so we deliberately do not handle it here.

const ALT_SCREEN_MODES = new Set(['1049', '1047', '47']);

// Matches CSI ? <params> <h|l> where params is digits/semicolons.
// e.g. \x1b[?1049h  \x1b[?1049;2004h  \x1b[?47l
const CSI_DECSET_DECRST = /\x1b\[\?([0-9;]+)([hl])/g;

export class AltScreenTracker {
  private active = false;

  /** Scan a chunk of raw terminal output, applying any alt-screen transitions in order. */
  process(chunk: string): void {
    CSI_DECSET_DECRST.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSI_DECSET_DECRST.exec(chunk)) !== null) {
      const params = match[1].split(';');
      const action = match[2]; // 'h' = set, 'l' = reset
      const touchesAltScreen = params.some((p) => ALT_SCREEN_MODES.has(p));
      if (!touchesAltScreen) continue;
      this.active = action === 'h';
    }
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
  }
}
