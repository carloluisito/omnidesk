/**
 * Semantic color palette for ClaudeDesk
 * Maintains glassmorphism aesthetic with clear semantic meaning
 */

export const colors = {
  // Base backgrounds
  bg: {
    primary: '#05070c',
    secondary: '#0d1117',
    tertiary: '#161b22',
    elevated: 'rgba(255, 255, 255, 0.05)',
    glass: 'rgba(255, 255, 255, 0.03)',
  },

  // Surface colors (for glassmorphism)
  surface: {
    default: 'rgba(255, 255, 255, 0.05)',
    hover: 'rgba(255, 255, 255, 0.08)',
    active: 'rgba(255, 255, 255, 0.12)',
    ring: 'rgba(255, 255, 255, 0.10)',
    ringHover: 'rgba(255, 255, 255, 0.15)',
  },

  // Text colors
  text: {
    primary: 'rgba(255, 255, 255, 1)',
    secondary: 'rgba(255, 255, 255, 0.70)',
    tertiary: 'rgba(255, 255, 255, 0.50)',
    muted: 'rgba(255, 255, 255, 0.35)',
    disabled: 'rgba(255, 255, 255, 0.25)',
  },

  // Semantic colors
  accent: {
    blue: {
      50: 'rgba(59, 130, 246, 0.10)',
      100: 'rgba(59, 130, 246, 0.20)',
      500: '#3b82f6',
      600: '#2563eb',
    },
    green: {
      50: 'rgba(16, 185, 129, 0.10)',
      100: 'rgba(16, 185, 129, 0.20)',
      500: '#10b981',
      600: '#059669',
    },
    amber: {
      50: 'rgba(245, 158, 11, 0.10)',
      100: 'rgba(245, 158, 11, 0.20)',
      500: '#f59e0b',
      600: '#d97706',
    },
    red: {
      50: 'rgba(239, 68, 68, 0.10)',
      100: 'rgba(239, 68, 68, 0.20)',
      500: '#ef4444',
      600: '#dc2626',
    },
    purple: {
      50: 'rgba(139, 92, 246, 0.10)',
      100: 'rgba(139, 92, 246, 0.20)',
      500: '#8b5cf6',
      600: '#7c3aed',
    },
    cyan: {
      50: 'rgba(6, 182, 212, 0.10)',
      100: 'rgba(6, 182, 212, 0.20)',
      500: '#06b6d4',
      600: '#0891b2',
    },
  },

  // Status colors
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    running: '#06b6d4',
  },

  // Phase colors (Mission Control)
  phase: {
    prompt: {
      bg: 'rgba(59, 130, 246, 0.10)',
      bgActive: 'rgba(59, 130, 246, 0.20)',
      accent: '#3b82f6',
      glow: 'rgba(59, 130, 246, 0.40)',
    },
    review: {
      bg: 'rgba(245, 158, 11, 0.10)',
      bgActive: 'rgba(245, 158, 11, 0.20)',
      accent: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.40)',
    },
    ship: {
      bg: 'rgba(16, 185, 129, 0.10)',
      bgActive: 'rgba(16, 185, 129, 0.20)',
      accent: '#10b981',
      glow: 'rgba(16, 185, 129, 0.40)',
    },
  },

  // Diff colors
  diff: {
    added: {
      bg: 'rgba(16, 185, 129, 0.15)',
      text: '#6ee7b7',
      line: 'rgba(16, 185, 129, 0.30)',
    },
    removed: {
      bg: 'rgba(239, 68, 68, 0.15)',
      text: '#fca5a5',
      line: 'rgba(239, 68, 68, 0.30)',
    },
    modified: {
      bg: 'rgba(245, 158, 11, 0.10)',
      text: '#fcd34d',
    },
  },
} as const;

// CSS custom properties for runtime theming
export const cssVars = {
  '--bg-primary': colors.bg.primary,
  '--bg-secondary': colors.bg.secondary,
  '--surface-default': colors.surface.default,
  '--text-primary': colors.text.primary,
  '--text-secondary': colors.text.secondary,
  '--accent-blue': colors.accent.blue[500],
  '--accent-green': colors.accent.green[500],
} as const;

export type ColorToken = typeof colors;
