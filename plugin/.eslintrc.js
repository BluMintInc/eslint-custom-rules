'use strict';

module.exports = {
  plugins: ['security', 'import', 'blumintinc'],
  extends: [
    // Enfore all basic, error-prevention, and recommended Typescript rules
    // (https://eslint.vuejs.org/rules/)
    'plugin:@typescript-eslint/recommended',
    // Enforces Prettier opinionated style (https://prettier.io/) ruleset on TypeScript files
    // and Prettier's recommended ruleset
    'plugin:prettier/recommended',
    // Ennforces NextJS opinionated styling (https://nextjs.org/docs/basic-features/eslint#core-web-vitals)
    'plugin:security/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  env: {
    node: true,
    es6: true,
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: { jest: true },
    },
    {
      files: ['*.json'],
      parser: 'jsonc-eslint-parser',
    },
  ],
};
