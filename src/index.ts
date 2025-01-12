import { arrayMethodsThisContext } from './rules/array-methods-this-context';
import { classMethodsReadTopToBottom } from './rules/class-methods-read-top-to-bottom';
import { default as consistentCallbackNaming } from './rules/consistent-callback-naming';
import { dynamicHttpsErrors } from './rules/dynamic-https-errors';
import { enforceIdentifiableFirestoreType } from './rules/enforce-identifiable-firestore-type';
import { default as enforceCallbackMemo } from './rules/enforce-callback-memo';
import { enforceCallableTypes } from './rules/enforce-callable-types';
import { enforceFirebaseImports } from './rules/enforce-dynamic-firebase-imports';
import { exportIfInDoubt } from './rules/export-if-in-doubt';
import { extractGlobalConstants } from './rules/extract-global-constants';
import { genericStartsWithT } from './rules/generic-starts-with-t';
import { default as globalConstStyle } from './rules/global-const-style';
import { noAsyncArrayFilter } from './rules/no-async-array-filter';
import { noAsyncForEach } from './rules/no-async-foreach';
import { noConditionalLiteralsInJsx } from './rules/no-conditional-literals-in-jsx';
import { noFilterWithoutReturn } from './rules/no-filter-without-return';
import { noMisusedSwitchCase } from './rules/no-misused-switch-case';
import { noUnpinnedDependencies } from './rules/no-unpinned-dependencies';
import { noUnusedProps } from './rules/no-unused-props';
import { noUselessFragment } from './rules/no-useless-fragment';
import { preferFragmentShorthand } from './rules/prefer-fragment-shorthand';
import { preferTypeOverInterface } from './rules/prefer-type-over-interface';
import { requireMemo } from './rules/require-memo';
import { noJsxWhitespaceLiteral } from './rules/no-jsx-whitespace-literal';
import { default as requireDynamicFirebaseImports } from './rules/require-dynamic-firebase-imports';
import { default as requireHttpsError } from './rules/require-https-error';
import { useCustomRouter } from './rules/use-custom-router';
import { default as requireImageOverlayed } from './rules/require-image-overlayed';
import { requireUseMemoObjectLiterals } from './rules/require-usememo-object-literals';
import { enforceStableStringify } from './rules/enforce-safe-stringify';

module.exports = {
  meta: {
    name: '@blumintinc/eslint-plugin-blumint',
    version: '1.0.5',
  },
  parseOptions: {
    ecmaVersion: 2020,
  },
  configs: {
    recommended: {
      plugins: ['@blumintinc/blumint'],
      rules: {
        '@blumintinc/blumint/no-jsx-whitespace-literal': 'error',
        '@blumintinc/blumint/array-methods-this-context': 'warn',
        '@blumintinc/blumint/class-methods-read-top-to-bottom': 'warn',
        '@blumintinc/blumint/consistent-callback-naming': 'error',
        '@blumintinc/blumint/dynamic-https-errors': 'warn',
        '@blumintinc/blumint/enforce-identifiable-firestore-type': 'error',
        '@blumintinc/blumint/enforce-callback-memo': 'error',
        '@blumintinc/blumint/enforce-callable-types': 'error',
        '@blumintinc/blumint/enforce-dynamic-firebase-imports': 'error',
        // '@blumintinc/blumint/export-if-in-doubt': 'warn',
        '@blumintinc/blumint/extract-global-constants': 'warn',
        '@blumintinc/blumint/generic-starts-with-t': 'warn',
        '@blumintinc/blumint/global-const-style': 'error',
        '@blumintinc/blumint/no-async-array-filter': 'error',
        '@blumintinc/blumint/no-async-foreach': 'error',
        '@blumintinc/blumint/no-conditional-literals-in-jsx': 'error',
        '@blumintinc/blumint/no-filter-without-return': 'error',
        '@blumintinc/blumint/no-misused-switch-case': 'error',
        '@blumintinc/blumint/no-unpinned-dependencies': 'error',
        '@blumintinc/blumint/no-unused-props': 'error',
        '@blumintinc/blumint/no-useless-fragment': 'warn',
        '@blumintinc/blumint/prefer-fragment-shorthand': 'warn',
        '@blumintinc/blumint/prefer-type-over-interface': 'warn',
        '@blumintinc/blumint/require-memo': 'error',
        '@blumintinc/blumint/require-dynamic-firebase-imports': 'error',
        '@blumintinc/blumint/require-https-error': 'error',
        '@blumintinc/blumint/use-custom-router': 'error',
        '@blumintinc/blumint/require-image-overlayed': 'error',
        '@blumintinc/blumint/require-usememo-object-literals': 'error',
        '@blumintinc/blumint/enforce-safe-stringify': 'error',
      },
    },
  },
  rules: {
    'array-methods-this-context': arrayMethodsThisContext,
    'class-methods-read-top-to-bottom': classMethodsReadTopToBottom,
    'consistent-callback-naming': consistentCallbackNaming,
    'dynamic-https-errors': dynamicHttpsErrors,
    'enforce-identifiable-firestore-type': enforceIdentifiableFirestoreType,
    'enforce-callback-memo': enforceCallbackMemo,
    'enforce-callable-types': enforceCallableTypes,
    'enforce-dynamic-firebase-imports': enforceFirebaseImports,
    'export-if-in-doubt': exportIfInDoubt,
    'extract-global-constants': extractGlobalConstants,
    'generic-starts-with-t': genericStartsWithT,
    'global-const-style': globalConstStyle,
    'no-async-array-filter': noAsyncArrayFilter,
    'no-async-foreach': noAsyncForEach,
    'no-conditional-literals-in-jsx': noConditionalLiteralsInJsx,
    'no-filter-without-return': noFilterWithoutReturn,
    'no-misused-switch-case': noMisusedSwitchCase,
    'no-unpinned-dependencies': noUnpinnedDependencies,
    'no-unused-props': noUnusedProps,
    'no-useless-fragment': noUselessFragment,
    'prefer-fragment-shorthand': preferFragmentShorthand,
    'prefer-type-over-interface': preferTypeOverInterface,
    'require-memo': requireMemo,
    'no-jsx-whitespace-literal': noJsxWhitespaceLiteral,
    'require-dynamic-firebase-imports': requireDynamicFirebaseImports,
    'require-https-error': requireHttpsError,
    'use-custom-router': useCustomRouter,
    'require-image-overlayed': requireImageOverlayed,
    'require-usememo-object-literals': requireUseMemoObjectLiterals,
    'enforce-safe-stringify': enforceStableStringify,
  },
};
