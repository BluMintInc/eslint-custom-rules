import { arrayMethodsThisContext } from './rules/array-methods-this-context';
import { classMethodsReadTopToBottom } from './rules/class-methods-read-top-to-bottom';
import { dynamicHttpsErrors } from './rules/dynamic-https-errors';
import { exportIfInDoubt } from './rules/export-if-in-doubt';
import { extractGlobalConstants } from './rules/extract-global-constants';
import { genericStartsWithT } from './rules/generic-starts-with-t';
import { noAsyncArrayFilter } from './rules/no-async-array-filter';
import { noAsyncForEach } from './rules/no-async-foreach';
import { noConditionalLiteralsInJsx } from './rules/no-conditional-literals-in-jsx';
import { noFilterWithoutReturn } from './rules/no-filter-without-return';
import { noMisusedSwitchCase } from './rules/no-misused-switch-case';
import { noUnpinnedDependencies } from './rules/no-unpinned-dependencies';
import { noUselessFragment } from './rules/no-useless-fragment';
import { preferFragmentShorthand } from './rules/prefer-fragment-shorthand';
import { preferTypeOverInterface } from './rules/prefer-type-over-interface';
import { requireMemo } from './rules/require-memo';

module.exports = {
  meta: {
    name: '@blumintinc/eslint-plugin-blumint',
    version: '0.1.22',
  },
  parseOptions: {
    ecmaVersion: 2020,
  },
  configs: {
    recommended: {
      plugins: ['@blumintinc/blumint'],
      rules: {
        '@blumintinc/blumint/array-methods-this-context': 'warn',
        '@blumintinc/blumint/class-methods-read-top-to-bottom': 'warn',
        '@blumintinc/blumint/dynamic-https-errors': 'warn',
        // '@blumintinc/blumint/export-if-in-doubt': 'warn',
        // '@blumintinc/blumint/extract-global-constants': 'warn',
        '@blumintinc/blumint/generic-starts-with-t': 'warn',
        '@blumintinc/blumint/no-async-array-filter': 'error',
        '@blumintinc/blumint/no-async-foreach': 'error',
        '@blumintinc/blumint/no-conditional-literals-in-jsx': 'error',
        '@blumintinc/blumint/no-filter-without-return': 'error',
        '@blumintinc/blumint/no-misused-switch-case': 'error',
        '@blumintinc/blumint/no-unpinned-dependencies': 'error',
        '@blumintinc/blumint/no-useless-fragment': 'warn',
        '@blumintinc/blumint/prefer-fragment-shorthand': 'warn',
        '@blumintinc/blumint/prefer-type-over-interface': 'warn',
        '@blumintinc/blumint/require-memo': 'error',
      },
    },
  },
  rules: {
    'array-methods-this-context': arrayMethodsThisContext,
    'class-methods-read-top-to-bottom': classMethodsReadTopToBottom,
    'dynamic-https-errors': dynamicHttpsErrors,
    'export-if-in-doubt': exportIfInDoubt,
    'extract-global-constants': extractGlobalConstants,
    'generic-starts-with-t': genericStartsWithT,
    'no-async-array-filter': noAsyncArrayFilter,
    'no-async-foreach': noAsyncForEach,
    'no-conditional-literals-in-jsx': noConditionalLiteralsInJsx,
    'no-filter-without-return': noFilterWithoutReturn,
    'no-misused-switch-case': noMisusedSwitchCase,
    'no-unpinned-dependencies': noUnpinnedDependencies,
    'no-useless-fragment': noUselessFragment,
    'prefer-fragment-shorthand': preferFragmentShorthand,
    'prefer-type-over-interface': preferTypeOverInterface,
    'require-memo': requireMemo,
  },
};
