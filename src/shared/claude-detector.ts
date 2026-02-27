/**
 * Centralized Claude-ready detection.
 *
 * Detects whether Claude Code's welcome screen has appeared in terminal output.
 * Used by: Terminal.tsx (renderer), MultiTerminal (renderer), HistoryManager (main).
 *
 * Keep this as the SINGLE SOURCE OF TRUTH for detection patterns.
 * When Claude Code updates its welcome screen, update ONLY this file.
 */

/** Patterns that indicate Claude Code has finished loading and is ready. */
export const CLAUDE_READY_PATTERNS = [
  'Claude Code',
  'Welcome back',
  'Sonnet',
  'Opus',
  'Haiku',
  'Tips for getting started',
  'Recent activity',
] as const;

/**
 * Check if a string contains any Claude-ready pattern.
 */
export function isClaudeReady(output: string): boolean {
  return CLAUDE_READY_PATTERNS.some(pattern => output.includes(pattern));
}

/**
 * Find the earliest index in the buffer where Claude's output begins.
 * Returns the index of the first matching pattern, or -1 if none found.
 */
export function findClaudeOutputStart(buffer: string): number {
  let earliest = -1;
  for (const pattern of CLAUDE_READY_PATTERNS) {
    const index = buffer.indexOf(pattern);
    if (index !== -1 && (earliest === -1 || index < earliest)) {
      earliest = index;
    }
  }
  return earliest;
}

/**
 * Generic provider-ready check using caller-supplied patterns.
 * Complements the Claude-specific `isClaudeReady` for any provider.
 */
export function isProviderReady(output: string, patterns: string[]): boolean {
  return patterns.some(pattern => output.includes(pattern));
}

/**
 * Find the earliest index in the buffer where any provider pattern appears.
 * Returns -1 if none of the patterns are found.
 */
export function findProviderOutputStart(buffer: string, patterns: string[]): number {
  let earliest = -1;
  for (const pattern of patterns) {
    const index = buffer.indexOf(pattern);
    if (index !== -1 && (earliest === -1 || index < earliest)) {
      earliest = index;
    }
  }
  return earliest;
}
