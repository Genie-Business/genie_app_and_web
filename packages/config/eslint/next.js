import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import base from './base.js';

/** Flat ESLint config for the Next.js surfaces (landing, admin). */
export default [
  ...base,
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
];
