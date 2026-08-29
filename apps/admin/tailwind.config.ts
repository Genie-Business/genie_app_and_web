import type { Config } from 'tailwindcss';
import preset from '@genie/config/tailwind-preset';

export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  presets: [preset as Config],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-unbounded)', 'var(--font-inter)', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
