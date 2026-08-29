/**
 * genie design tokens — the single source of truth for colour, type, spacing,
 * radius and elevation across the landing site, the admin portal and (mirrored
 * in Dart) the Flutter app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BRAND COLOUR — provisional. The genie logo is a single cyan wordmark. The
 * exact hex has NOT yet been sampled from a source file. Drop the official
 * logo (SVG preferred) into `packages/config/brand/genie-logo.svg` and update
 * `brand.primary[500]` below; the rest of the ramp is derived from it.
 * Current working value: #33B6CE  (HSL ≈ 189° 61% 50%)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const brand = {
  /** Primary cyan — the logo colour and its tint/shade ramp. */
  primary: {
    50: '#ECF8FB',
    100: '#CFEFF5',
    200: '#A3E1EC',
    300: '#6FCEDE',
    400: '#48BFD3',
    500: '#33B6CE', // ← logo cyan (provisional — resample from official asset)
    600: '#2A93A8',
    700: '#227585',
    800: '#195763',
    900: '#123E47',
    950: '#0B272D',
  },
  /**
   * Warm celebration accent — NOT from the logo. Used sparingly for primary
   * CTAs and "magic moment" highlights (a gift revealed, an event completed).
   * Flagged for confirmation; the system reads fine monochrome-cyan if dropped.
   */
  accent: {
    50: '#FEF6E7',
    100: '#FDE9C2',
    200: '#FBD489',
    300: '#F8BE50',
    400: '#F6AC2E',
    500: '#EE9B12',
    600: '#D07E0C',
    700: '#A65E0F',
    800: '#894C14',
    900: '#743F15',
    950: '#431F06',
  },
  /** Neutral scale — very slightly cyan-tinted so greys read as the same family. */
  neutral: {
    0: '#FFFFFF',
    50: '#FBFDFE',
    100: '#F1F5F7',
    200: '#E2E9EC',
    300: '#CBD6DB',
    400: '#9DAEB4',
    500: '#6E7F86',
    600: '#526168',
    700: '#3D4A50',
    800: '#283237',
    900: '#172025',
    950: '#0D1316',
  },
} as const;

export const semantic = {
  success: { fg: '#0F7B4F', bg: '#E7F6EF', solid: '#16A46B' },
  warning: { fg: '#8A5A00', bg: '#FEF3DA', solid: '#E0930B' },
  error: { fg: '#B42318', bg: '#FDECEA', solid: '#E5484D' },
  info: { fg: '#1F6F86', bg: '#E7F5F9', solid: '#33B6CE' },
} as const;

/** Role tokens for the light theme (default). */
export const lightTheme = {
  'bg-canvas': brand.neutral[50],
  'bg-surface': brand.neutral[0],
  'bg-subtle': brand.neutral[100],
  'bg-inverse': brand.neutral[900],
  'text-primary': '#0F2E36',
  'text-secondary': brand.neutral[600],
  'text-muted': brand.neutral[500],
  'text-inverse': brand.neutral[50],
  'text-brand': brand.primary[700],
  border: brand.neutral[200],
  'border-strong': brand.neutral[300],
  ring: brand.primary[400],
  'primary-solid': brand.primary[500],
  'primary-solid-hover': brand.primary[600],
  'primary-soft': brand.primary[50],
  'accent-solid': brand.accent[500],
  'accent-soft': brand.accent[50],
} as const;

/** Role tokens for the dark theme. */
export const darkTheme = {
  'bg-canvas': '#0B1417',
  'bg-surface': '#111E22',
  'bg-subtle': '#16262B',
  'bg-inverse': brand.neutral[50],
  'text-primary': '#EAF2F4',
  'text-secondary': brand.neutral[300],
  'text-muted': brand.neutral[400],
  'text-inverse': brand.neutral[900],
  'text-brand': brand.primary[300],
  border: '#24363C',
  'border-strong': '#31474E',
  ring: brand.primary[500],
  'primary-solid': brand.primary[400],
  'primary-solid-hover': brand.primary[300],
  'primary-soft': '#12333B',
  'accent-solid': brand.accent[400],
  'accent-soft': '#3A2A0C',
} as const;

export const typography = {
  fontDisplay: "'Unbounded', 'Inter', ui-sans-serif, system-ui, sans-serif",
  fontBody: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  /** [fontSize, lineHeight] in rem. */
  scale: {
    xs: ['0.75rem', '1rem'],
    sm: ['0.875rem', '1.25rem'],
    base: ['1rem', '1.5rem'],
    lg: ['1.125rem', '1.75rem'],
    xl: ['1.25rem', '1.75rem'],
    '2xl': ['1.5rem', '2rem'],
    '3xl': ['1.875rem', '2.25rem'],
    '4xl': ['2.25rem', '2.5rem'],
    '5xl': ['3rem', '1.1'],
    '6xl': ['3.75rem', '1.05'],
  },
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  32: '8rem',
} as const;

export const radius = {
  none: '0px',
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.75rem',
  full: '9999px',
} as const;

export const elevation = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(15 46 54 / 0.05)',
  md: '0 4px 12px -2px rgb(15 46 54 / 0.10), 0 2px 4px -2px rgb(15 46 54 / 0.06)',
  lg: '0 12px 32px -8px rgb(15 46 54 / 0.16), 0 4px 8px -4px rgb(15 46 54 / 0.08)',
  glow: '0 0 0 4px rgb(51 182 206 / 0.18)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1300,
  modal: 1400,
  toast: 1600,
} as const;

/** Flatten a theme role map into `--genie-<role>: <value>` CSS declarations. */
export function themeToCssVars(theme: Record<string, string>, prefix = 'genie'): string {
  return Object.entries(theme)
    .map(([key, value]) => `--${prefix}-${key}: ${value};`)
    .join('\n');
}

export const tokens = {
  brand,
  semantic,
  lightTheme,
  darkTheme,
  typography,
  spacing,
  radius,
  elevation,
  breakpoints,
  zIndex,
} as const;

export type GenieTokens = typeof tokens;
