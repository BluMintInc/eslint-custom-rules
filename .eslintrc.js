/**
ESLint file-relative configuration (also known as configuration cascading) that can be overriden in subdirectories 
via another .eslintrc.* in that directory
*/
module.exports = {
  // Specifies that this is the highest ESLint file-relative configuration in the project
  root: true,
  // Specifies that the code uses the following environments (predefined global variables)
  env: {
    // Enables Node.js global variables & Node.js scoping
    node: true,
    es6: true,
  },
  plugins: ['security', 'blumint'],
  extends: [
    // Enfore all basic, error-prevention, and recommended Typescript rules
    // (https://eslint.vuejs.org/rules/)
    'plugin:@typescript-eslint/recommended',
    // Enforces Prettier opinionated style (https://prettier.io/) ruleset on TypeScript files
    // and Prettier's recommended ruleset
    'plugin:prettier/recommended',
    // Ennforces NextJS opinionated styling (https://nextjs.org/docs/basic-features/eslint#core-web-vitals)
    'plugin:security/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  // Specifies fine-configuration of individual linting rules
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    // Disallows use of console.log() in production
    // (https://eslint.org/docs/rules/no-console)
    'no-console':
      process.env.NODE_ENV === 'production'
        ? ['error', { allow: ['warn', 'error'] }]
        : 'off',
    // Disallows use of debugger statements in production
    // (https://eslint.org/docs/rules/no-debugger)
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    // Allows for async-await
    // (https://eslint.org/docs/rules/generator-star-spacing)
    'generator-star-spacing': 0,
    // Enables non-null ! postfix operator
    '@typescript-eslint/no-non-null-assertion': 0,
    // Modules keyword enforced over namespace keyword
    '@typescript-eslint/prefer-namespace-keyword': 0,
    '@typescript-eslint/no-namespace': 0,
    // Do not warn about namespaces overlapping with class names
    'no-redeclare': 0,
    // Do not warn about specified interfaces whose names begin with 'I'
    '@typescript-eslint/interface-name-prefix': 0,
    '@typescript-eslint/no-unused-vars': 'error',
    'prefer-const': 'warn',
    //'import/no-unused-modules': [1, { unusedExports: true }],
    'lines-between-class-members': [
      'error',
      'always',
      { exceptAfterSingleLine: true },
    ],
    'blumint/no-async-array-filter': 'error',
    'blumint/no-unpinned-dependencies': 'error',
  },
  overrides: [
    {
      files: ['*.json'],
      parser: 'jsonc-eslint-parser',
    },
    {
      // Allows ESLint to support TypeScript instead of just JavaScript
      // (https://github.com/typescript-eslint/typescript-eslint)
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
    },
  ],
};
