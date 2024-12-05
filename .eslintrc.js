module.exports = {
  root: true,
  env: {
    node: true,
    es6: true,
    jest: true
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'eslint-plugin-eslint-plugin',
    'import'
  ],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:eslint-plugin/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended'
  ],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true
    }
  },
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    '@typescript-eslint/no-unused-vars': 'error',
    'prefer-const': 'warn',
    '@typescript-eslint/no-namespace': 0,
    'lines-between-class-members': [
      'error',
      'always',
      { exceptAfterSingleLine: true }
    ]
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      env: { jest: true }
    },
    {
      files: ['package.json'],
      parser: 'jsonc-eslint-parser'
    }
  ]
};
