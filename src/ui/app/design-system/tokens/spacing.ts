/**
 * Spacing scale for ClaudeDesk
 * Based on 4px base unit with semantic names
 */

export const spacing = {
  // Base scale (in pixels, use with template literals)
  0: '0',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
} as const;

// Semantic spacing
export const layoutSpacing = {
  // Page layout
  pageX: spacing[6], // 24px horizontal page padding
  pageY: spacing[6], // 24px vertical page padding

  // Card/Panel spacing
  cardPadding: spacing[4], // 16px
  cardGap: spacing[4], // 16px between cards

  // Section spacing
  sectionGap: spacing[6], // 24px between sections

  // Inline element spacing
  inlineGap: spacing[2], // 8px between inline elements
  stackGap: spacing[3], // 12px between stacked elements

  // Component-specific
  inputPadding: spacing[3], // 12px
  buttonPadding: spacing[4], // 16px horizontal
  buttonPaddingY: spacing[2.5], // 10px vertical
} as const;

// Border radius scale
export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
} as const;

// Semantic radius
export const componentRadius = {
  button: radius['2xl'],
  input: radius['2xl'],
  card: radius['3xl'],
  modal: radius['3xl'],
  badge: radius.full,
  chip: radius.full,
} as const;

export type SpacingToken = typeof spacing;
export type RadiusToken = typeof radius;
