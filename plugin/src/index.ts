import { arrayMethodsThisContext } from './rules/array-methods-this-context';
import { exportIfInDoubt } from './rules/export-if-in-doubt';
import { extractGlobalConstants } from './rules/extract-global-constants';
import { genericStartsWithT } from './rules/generic-starts-with-t';
import { noAsyncArrayFilter } from './rules/no-async-array-filter';
import { noAsyncForEach } from './rules/no-async-foreach';
import { noFilterWithoutReturn } from './rules/no-filter-without-return';
import { noMisusedSwitchCase } from './rules/no-misused-switch-case';
import { noUnpinnedDependencies } from './rules/no-unpinned-dependencies';
import { noUselessFragment } from './rules/no-useless-fragment';
import { preferFragmentShorthand } from './rules/prefer-fragment-shorthand';
import { preferTypeOverInterface } from './rules/prefer-type-over-interface';

module.exports = {
  meta: {
    name: '@blumintinc/eslint-plugin-blumint',
    version: '0.1.11',
  },
  parseOptions: {
    ecmaVersion: 2020,
  },
  configs: {
    recommended: {
      plugins: ['@blumintinc/blumint'],
      rules: {
        '@blumintinc/blumint/array-methods-this-context': 'warn',
        '@blumintinc/blumint/export-if-in-doubt': 'warn',
        '@blumintinc/blumint/extract-global-constants': 'warn',
        '@blumintinc/blumint/generic-starts-with-t': 'warn',
        '@blumintinc/blumint/no-async-array-filter': 'error',
        '@blumintinc/blumint/no-async-foreach': 'error',
        '@blumintinc/blumint/no-filter-without-return': 'error',
        '@blumintinc/blumint/no-misused-switch-case': 'error',
        '@blumintinc/blumint/no-unpinned-dependencies': 'error',
        '@blumintinc/blumint/no-useless-fragment': 'warn',
        '@blumintinc/blumint/prefer-fragment-shorthand': 'warn',
        '@blumintinc/blumint/prefer-type-over-interface': 'warn',
      },
    },
  },
  rules: {
    'array-methods-this-context': arrayMethodsThisContext,
    'export-if-in-doubt': exportIfInDoubt,
    'extract-global-constants': extractGlobalConstants,
    'generic-starts-with-t': genericStartsWithT,
    'no-async-array-filter': noAsyncArrayFilter,
    'no-async-foreach': noAsyncForEach,
    'no-filter-without-return': noFilterWithoutReturn,
    'no-misused-switch-case': noMisusedSwitchCase,
    'no-unpinned-dependencies': noUnpinnedDependencies,
    'no-useless-fragment': noUselessFragment,
    'prefer-fragment-shorthand': preferFragmentShorthand,
    'prefer-type-over-interface': preferTypeOverInterface,
  },
};
