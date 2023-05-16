'use strict';

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:eslint-plugin/recommended',
    'plugin:node/recommended',
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
