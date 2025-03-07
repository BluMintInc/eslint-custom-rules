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
    ],
    'no-restricted-globals': [
      'warn',
      {
        name: 'setInterval',
        message: 'setInterval continues to run when a tab is not in focus, though potentially at a reduced frequency. This is appropriate for background tasks that need to continue regardless of UI visibility. If you need animations that pause when a tab is not visible, consider requestAnimationFrame instead.'
      }
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
