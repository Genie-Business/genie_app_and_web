import type { Config } from 'tailwindcss';
import {
  brand,
  semantic,
  typography,
  radius,
  elevation,
  breakpoints,
} from './design-tokens';

/**
 * Shared Tailwind preset for every web surface (landing, admin).
 * Role colours (bg-canvas, text-primary, …) are exposed as CSS variables by
 * each app's globals.css so light/dark theming is a runtime concern; the raw
 * brand ramps are available directly for one-off use.
 */
const preset: Partial<Config> = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    screens: breakpoints,
    extend: {
      colors: {
        brand: brand.primary,
        accent: brand.accent,
        neutral: brand.neutral,
        success: semantic.success,
        warning: semantic.warning,
        error: semantic.error,
        info: semantic.info,
        // Role tokens — resolved from CSS vars set per-theme in globals.css
        canvas: 'var(--genie-bg-canvas)',
        surface: 'var(--genie-bg-surface)',
        subtle: 'var(--genie-bg-subtle)',
        ink: {
          DEFAULT: 'var(--genie-text-primary)',
          secondary: 'var(--genie-text-secondary)',
          muted: 'var(--genie-text-muted)',
          inverse: 'var(--genie-text-inverse)',
        },
        line: {
          DEFAULT: 'var(--genie-border)',
          strong: 'var(--genie-border-strong)',
        },
        primary: {
          DEFAULT: 'var(--genie-primary-solid)',
          hover: 'var(--genie-primary-solid-hover)',
          soft: 'var(--genie-primary-soft)',
        },
      },
      fontFamily: {
        display: typography.fontDisplay.split(', '),
        sans: typography.fontBody.split(', '),
        mono: typography.fontMono.split(', '),
      },
      fontSize: typography.scale as unknown as Record<string, [string, string]>,
      borderRadius: radius,
      boxShadow: elevation,
      ringColor: { DEFAULT: 'var(--genie-ring)' },
      container: {
        center: true,
        padding: { DEFAULT: '1.25rem', lg: '2rem' },
        screens: { '2xl': '1200px' },
      },
    },
  },
};

export default preset;
