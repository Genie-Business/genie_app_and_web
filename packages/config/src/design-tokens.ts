/**
 * genie design tokens — the single source of truth for colour, type, spacing,
 * radius and elevation across the landing site, the admin portal and (mirrored
 * in Dart) the Flutter app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BRAND COLOUR — genie deep violet. Primary #6D28D9 (HSL ≈ 262° 70% 50%); the
 * rest of the ramp is a tint/shade series around it. The neutral scale carries
 * a faint violet tint so greys read as the same family. The official logo
 * (`packages/config/brand/`) is recoloured to this same #6D28D9. If the brand
 * colour ever changes, regenerate the ramp + the mirrored values in each app's
 * globals.css and apps/mobile/lib/theme/genie_theme.dart, and re-run the logo
 * recolour step (see brand/README.md).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const brand = {
  /** Primary deep violet — the logo colour and its tint/shade ramp. */
  primary: {
    50: '#F4F1FE',
    100: '#EAE3FC',
    200: '#D6C7FA',
    300: '#B99DF4',
    400: '#9670EC',
    500: '#6D28D9', // ← genie deep violet
    600: '#5A20B0',
    700: '#491B8B',
    800: '#39166C',
    900: '#2B1153',
    950: '#1B0A38',
  },
  /**
   * Warm celebration accent — NOT from the logo. Used sparingly for primary
   * CTAs and "magic moment" highlights (a gift revealed, an event completed).
   * The warm amber plays off the deep violet; the system also reads fine
   * monochrome-violet if the accent is dropped.
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
  /** Neutral scale — faintly violet-tinted so greys read as the same family. */
  neutral: {
    0: '#FFFFFF',
    50: '#FCFBFE',
    100: '#F3F1F8',
    200: '#E6E2EE',
    300: '#CFC9DA',
    400: '#A29BB2',
    500: '#716A81',
    600: '#544D63',
    700: '#3F394E',
    800: '#292537',
    900: '#181425',
    950: '#0E0B16',
  },
} as const;

export const semantic = {
  success: { fg: '#0F7B4F', bg: '#E7F6EF', solid: '#16A46B' },
  warning: { fg: '#8A5A00', bg: '#FEF3DA', solid: '#E0930B' },
  error: { fg: '#B42318', bg: '#FDECEA', solid: '#E5484D' },
  info: { fg: '#4A1C90', bg: '#EEE8FC', solid: '#7C3AED' },
} as const;

/** Role tokens for the light theme (default). */
export const lightTheme = {
  'bg-canvas': brand.neutral[50],
  'bg-surface': brand.neutral[0],
  'bg-subtle': brand.neutral[100],
  'bg-inverse': brand.neutral[900],
  'text-primary': '#1B1330',
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
  'bg-canvas': '#0E0B18',
  'bg-surface': '#171224',
  'bg-subtle': '#1E1730',
  'bg-inverse': brand.neutral[50],
  'text-primary': '#EFEBF8',
  'text-secondary': brand.neutral[300],
  'text-muted': brand.neutral[400],
  'text-inverse': brand.neutral[900],
  'text-brand': brand.primary[300],
  border: '#2C2440',
  'border-strong': '#3B3154',
  ring: brand.primary[500],
  'primary-solid': brand.primary[400],
  'primary-solid-hover': brand.primary[300],
  'primary-soft': '#241A3D',
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
  sm: '0 1px 2px 0 rgb(27 19 48 / 0.05)',
  md: '0 4px 12px -2px rgb(27 19 48 / 0.10), 0 2px 4px -2px rgb(27 19 48 / 0.06)',
  lg: '0 12px 32px -8px rgb(27 19 48 / 0.16), 0 4px 8px -4px rgb(27 19 48 / 0.08)',
  glow: '0 0 0 4px rgb(109 40 217 / 0.18)',
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
