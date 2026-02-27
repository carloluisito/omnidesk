/**
 * Model Detector — Parse terminal output to detect active Claude model
 *
 * Detects model switches from Claude Code CLI output in two phases:
 * 1. Initial detection: Parse welcome screen for starting model
 * 2. Switch detection: Parse /model command confirmations
 */

export type ClaudeModel = 'sonnet' | 'opus' | 'haiku' | 'auto';

export interface ModelDetectionResult {
  model: ClaudeModel | null;
  confidence: 'high' | 'medium' | 'low';
}

// Patterns for detecting model switches via /model command
export const SWITCH_PATTERNS = [
  /Set model to (?:Default )?\(?(Opus|Sonnet|Haiku)/i,  // "Set model to Default (Opus 4.6..."
  /Set model to (\w+)/i,                                 // "Set model to opus (claude-opus-4-6)"
  /Kept model as (?:Default )?\(?(Opus|Sonnet|Haiku)/i, // "Kept model as Default (recommended)"
  /Kept model as (\w+)/i,                                // "Kept model as haiku"
  /Switched to (?:claude[- ])?(\w+)/i,
  /Now using (?:model: )?(\w+)/i,
  /Model changed to (\w+)/i,
  /Using model (\w+)/i,
];

// Patterns for detecting initial model from welcome screen
// IMPORTANT: Pattern 0 requires "·" immediately after version to exclude promo text
// like "Opus 4.6 is here · $50 free extra usage" (which has "is here" before "·")
export const WELCOME_PATTERNS = [
  /(Opus|Sonnet|Haiku)\s+\d+\.\d+\s*·/i,          // "Haiku 4.5 · Claude Max" (v2.1+ format, requires ·)
  /Claude (?:3\.5 |4\.\d+ )?(Sonnet|Opus|Haiku)/i,
  /\((Opus|Sonnet|Haiku)\s+\d+\.\d+/i,            // "(Opus 4.6 · Most capable..."
  /Using model[: ]+(\w+)/i,
  /Model[: ]+(\w+)/i,
  /\((\w+)\s+\d+\.\d+\)/i, // e.g., "(Sonnet 4.5)"
];

/**
 * Strip ANSI escape sequences from terminal output.
 * Handles CSI sequences (\x1b[...X), OSC sequences (\x1b]...\x07), and single-char escapes.
 */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')   // CSI sequences (colors, cursor, etc.)
    .replace(/\x1b\][^\x07]*\x07/g, '')        // OSC sequences (title, etc.)
    .replace(/\x1b[()][A-Z0-9]/g, '')          // Character set selection
    .replace(/\x1b[=>]/g, '');                  // Keypad mode
}

/**
 * Detect model from terminal output.
 *
 * @param text - Terminal output to parse (raw PTY output with ANSI codes is OK)
 * @param isInitial - True for welcome screen detection, false for switch detection
 * @param customPatterns - Optional provider-specific patterns; overrides built-in ones when provided
 * @param customNormalizer - Optional provider-specific normalizer; overrides built-in one when provided
 * @returns Detection result with confidence level
 */
export function detectModelFromOutput(
  text: string,
  isInitial: boolean = false,
  customPatterns?: { welcome?: RegExp[]; switch?: RegExp[] },
  customNormalizer?: (raw: string) => string | null
): ModelDetectionResult {
  const clean = stripAnsi(text);

  let patterns: RegExp[];
  if (customPatterns) {
    patterns = isInitial
      ? (customPatterns.welcome ?? [])
      : (customPatterns.switch ?? []);
  } else {
    patterns = isInitial ? WELCOME_PATTERNS : SWITCH_PATTERNS;
  }

  const normalizer = customNormalizer ?? normalizeModelName;

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      const raw = match[1].toLowerCase();
      const normalized = normalizer(raw);
      if (normalized) {
        return { model: normalized as ClaudeModel, confidence: 'high' };
      }
    }
  }

  return { model: null, confidence: 'low' };
}

/**
 * Normalize raw model name to canonical ClaudeModel type.
 */
function normalizeModelName(raw: string): ClaudeModel | null {
  const map: Record<string, ClaudeModel> = {
    'sonnet': 'sonnet',
    '3.5-sonnet': 'sonnet',
    '4-sonnet': 'sonnet',
    'opus': 'opus',
    '3-opus': 'opus',
    '4-opus': 'opus',
    'haiku': 'haiku',
    '3-haiku': 'haiku',
    '4-haiku': 'haiku',
    'auto': 'auto',
  };
  return map[raw] || null;
}
