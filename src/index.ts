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
import { noHungarian } from './rules/no-hungarian';
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
import { default as requireImageOptimized } from './rules/require-image-optimized';
import { requireUseMemoObjectLiterals } from './rules/require-usememo-object-literals';
import { enforceStableStringify } from './rules/enforce-safe-stringify';
import { avoidUtilsDirectory } from './rules/avoid-utils-directory';
import { noEntireObjectHookDeps } from './rules/no-entire-object-hook-deps';
import { enforceFirestorePathUtils } from './rules/enforce-firestore-path-utils';
import { noCompositingLayerProps } from './rules/no-compositing-layer-props';
import { enforceFirestoreDocRefGeneric } from './rules/enforce-firestore-doc-ref-generic';
import { semanticFunctionPrefixes } from './rules/semantic-function-prefixes';
import { enforceFirestoreMock } from './rules/enforce-mock-firestore';
import { preferSettingsObject } from './rules/prefer-settings-object';
import { enforceFirestoreSetMerge } from './rules/enforce-firestore-set-merge';
import { enforceVerbNounNaming } from './rules/enforce-verb-noun-naming';
import { noExplicitReturnType } from './rules/no-explicit-return-type';
import { useCustomMemo } from './rules/use-custom-memo';
import { useCustomLink } from './rules/use-custom-link';
import { default as enforceSerializableParams } from './rules/enforce-serializable-params';
import { enforceRealtimedbPathUtils } from './rules/enforce-realtimedb-path-utils';
import { enforceMemoizeAsync } from './rules/enforce-memoize-async';
import { enforceExportedFunctionTypes } from './rules/enforce-exported-function-types';
import { noRedundantParamTypes } from './rules/no-redundant-param-types';
import { noClassInstanceDestructuring } from './rules/no-class-instance-destructuring';
import { noFirestoreObjectArrays } from './rules/no-firestore-object-arrays';
import { noMemoizeOnStatic } from './rules/no-memoize-on-static';
import { noUnsafeFirestoreSpread } from './rules/no-unsafe-firestore-spread';
import { noJsxInHooks } from './rules/no-jsx-in-hooks';
import { enforceAssertThrows } from './rules/enforce-assert-throws';
import { preferBatchOperations } from './rules/prefer-batch-operations';
import { noComplexCloudParams } from './rules/no-complex-cloud-params';
import { noMixedFirestoreTransactions } from './rules/no-mixed-firestore-transactions';
import { enforceFirestoreFacade } from './rules/enforce-firestore-facade';
import { syncOnwriteNameFunc } from './rules/sync-onwrite-name-func';
import { preferCloneDeep } from './rules/prefer-clone-deep';
import { noFirestoreJestMock } from './rules/no-firestore-jest-mock';
import { noMockFirebaseAdmin } from './rules/no-mock-firebase-admin';
import { enforceCentralizedMockFirestore } from './rules/enforce-centralized-mock-firestore';
import { requireHooksDefaultParams } from './rules/require-hooks-default-params';
import { preferDestructuringNoClass } from './rules/prefer-destructuring-no-class';
import { enforceRenderHitsMemoization } from './rules/enforce-render-hits-memoization';
import { preferFragmentComponent } from './rules/prefer-fragment-component';
import { reactUseMemoShouldBeComponent } from './rules/react-usememo-should-be-component';
import { noUnnecessaryVerbSuffix } from './rules/no-unnecessary-verb-suffix';
import { enforceAssertSafeObjectKey } from './rules/enforce-assertSafe-object-key';
import { enforceObjectLiteralAsConst } from './rules/enforce-object-literal-as-const';
import { enforcePositiveNaming } from './rules/enforce-positive-naming';
import { noTypeAssertionReturns } from './rules/no-type-assertion-returns';
import { preferUtilityFunctionOverPrivateStatic } from './rules/prefer-utility-function-over-private-static';
import { enforceMicrodiff } from './rules/enforce-microdiff';
import { enforceTimestampNow } from './rules/enforce-timestamp-now';
import { noAlwaysTrueFalseConditions } from './rules/no-always-true-false-conditions';
import { enforcePropsArgumentName } from './rules/enforce-props-argument-name';
import { preferGlobalRouterStateKey } from './rules/prefer-global-router-state-key';
import { enforceIdCapitalization } from './rules/enforce-id-capitalization';

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
        '@blumintinc/blumint/avoid-utils-directory': 'error',
        '@blumintinc/blumint/enforce-firestore-path-utils': 'error',
        '@blumintinc/blumint/no-jsx-whitespace-literal': 'error',
        '@blumintinc/blumint/array-methods-this-context': 'error',
        '@blumintinc/blumint/class-methods-read-top-to-bottom': 'error',
        '@blumintinc/blumint/consistent-callback-naming': 'error',
        '@blumintinc/blumint/dynamic-https-errors': 'error',
        '@blumintinc/blumint/enforce-identifiable-firestore-type': 'error',
        '@blumintinc/blumint/enforce-callback-memo': 'error',
        '@blumintinc/blumint/enforce-callable-types': 'error',
        '@blumintinc/blumint/enforce-dynamic-firebase-imports': 'error',
        // '@blumintinc/blumint/export-if-in-doubt': 'warn',
        '@blumintinc/blumint/extract-global-constants': 'error',
        '@blumintinc/blumint/generic-starts-with-t': 'error',
        '@blumintinc/blumint/global-const-style': 'error',
        '@blumintinc/blumint/no-async-array-filter': 'error',
        '@blumintinc/blumint/no-async-foreach': 'error',
        '@blumintinc/blumint/no-conditional-literals-in-jsx': 'error',
        '@blumintinc/blumint/no-filter-without-return': 'error',
        '@blumintinc/blumint/no-hungarian': 'error',
        '@blumintinc/blumint/no-misused-switch-case': 'error',
        '@blumintinc/blumint/no-unpinned-dependencies': 'error',
        '@blumintinc/blumint/no-unused-props': 'error',
        //'@blumintinc/blumint/no-useless-fragment': 'error',
        //'@blumintinc/blumint/prefer-fragment-shorthand': 'error',
        '@blumintinc/blumint/prefer-type-over-interface': 'error',
        '@blumintinc/blumint/require-memo': 'error',
        '@blumintinc/blumint/require-dynamic-firebase-imports': 'error',
        '@blumintinc/blumint/require-https-error': 'error',
        '@blumintinc/blumint/use-custom-router': 'error',
        '@blumintinc/blumint/require-image-optimized': 'error',
        '@blumintinc/blumint/require-usememo-object-literals': 'error',
        '@blumintinc/blumint/enforce-safe-stringify': 'error',
        '@blumintinc/blumint/no-entire-object-hook-deps': 'error',
        '@blumintinc/blumint/no-compositing-layer-props': 'error',
        '@blumintinc/blumint/enforce-firestore-doc-ref-generic': 'error',
        '@blumintinc/blumint/semantic-function-prefixes': 'error',
        '@blumintinc/blumint/enforce-mock-firestore': 'error',
        '@blumintinc/blumint/prefer-settings-object': 'error',
        '@blumintinc/blumint/enforce-firestore-set-merge': 'error',
        '@blumintinc/blumint/enforce-verb-noun-naming': 'error',
        '@blumintinc/blumint/no-explicit-return-type': 'error',
        '@blumintinc/blumint/use-custom-memo': 'error',
        '@blumintinc/blumint/use-custom-link': 'error',
        '@blumintinc/blumint/enforce-serializable-params': 'error',
        '@blumintinc/blumint/enforce-realtimedb-path-utils': 'error',
        '@blumintinc/blumint/enforce-memoize-async': 'error',
        '@blumintinc/blumint/enforce-exported-function-types': 'error',
        '@blumintinc/blumint/no-redundant-param-types': 'error',
        '@blumintinc/blumint/no-class-instance-destructuring': 'error',
        '@blumintinc/blumint/no-firestore-object-arrays': 'warn',
        '@blumintinc/blumint/no-memoize-on-static': 'error',
        '@blumintinc/blumint/no-unsafe-firestore-spread': 'error',
        '@blumintinc/blumint/no-jsx-in-hooks': 'error',
        '@blumintinc/blumint/enforce-assert-throws': 'error',
        '@blumintinc/blumint/prefer-batch-operations': 'error',
        '@blumintinc/blumint/no-complex-cloud-params': 'error',
        '@blumintinc/blumint/no-mixed-firestore-transactions': 'error',
        '@blumintinc/blumint/enforce-firestore-facade': 'error',
        '@blumintinc/blumint/sync-onwrite-name-func': 'error',
        '@blumintinc/blumint/prefer-clone-deep': 'error',
        '@blumintinc/blumint/no-firestore-jest-mock': 'error',
        '@blumintinc/blumint/no-mock-firebase-admin': 'error',
        '@blumintinc/blumint/enforce-centralized-mock-firestore': 'error',
        '@blumintinc/blumint/require-hooks-default-params': 'error',
        '@blumintinc/blumint/prefer-destructuring-no-class': 'error',
        '@blumintinc/blumint/enforce-render-hits-memoization': 'error',
        '@blumintinc/blumint/prefer-fragment-component': 'error',
        '@blumintinc/blumint/react-usememo-should-be-component': 'error',
        '@blumintinc/blumint/no-unnecessary-verb-suffix': 'error',
        '@blumintinc/blumint/enforce-assertSafe-object-key': 'error',
        '@blumintinc/blumint/enforce-object-literal-as-const': 'error',
        '@blumintinc/blumint/enforce-positive-naming': 'error',
        '@blumintinc/blumint/no-type-assertion-returns': 'error',
        '@blumintinc/blumint/prefer-utility-function-over-private-static': 'error',
        '@blumintinc/blumint/enforce-microdiff': 'error',
        '@blumintinc/blumint/enforce-timestamp-now': 'error',
        '@blumintinc/blumint/no-always-true-false-conditions': 'error',
        '@blumintinc/blumint/enforce-props-argument-name': 'error',
        '@blumintinc/blumint/prefer-global-router-state-key': 'warn',
        '@blumintinc/blumint/enforce-id-capitalization': 'error',
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
    'no-hungarian': noHungarian,
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
    'require-image-optimized': requireImageOptimized,
    'require-usememo-object-literals': requireUseMemoObjectLiterals,
    'enforce-safe-stringify': enforceStableStringify,
    'avoid-utils-directory': avoidUtilsDirectory,
    'no-entire-object-hook-deps': noEntireObjectHookDeps,
    'enforce-firestore-path-utils': enforceFirestorePathUtils,
    'no-compositing-layer-props': noCompositingLayerProps,
    'enforce-firestore-doc-ref-generic': enforceFirestoreDocRefGeneric,
    'semantic-function-prefixes': semanticFunctionPrefixes,
    'enforce-mock-firestore': enforceFirestoreMock,
    'prefer-settings-object': preferSettingsObject,
    'enforce-firestore-set-merge': enforceFirestoreSetMerge,
    'enforce-verb-noun-naming': enforceVerbNounNaming,
    'no-explicit-return-type': noExplicitReturnType,
    'use-custom-memo': useCustomMemo,
    'use-custom-link': useCustomLink,
    'enforce-serializable-params': enforceSerializableParams,
    'enforce-realtimedb-path-utils': enforceRealtimedbPathUtils,
    'enforce-memoize-async': enforceMemoizeAsync,
    'enforce-exported-function-types': enforceExportedFunctionTypes,
    'no-redundant-param-types': noRedundantParamTypes,
    'no-class-instance-destructuring': noClassInstanceDestructuring,
    'no-firestore-object-arrays': noFirestoreObjectArrays,
    'no-memoize-on-static': noMemoizeOnStatic,
    'no-unsafe-firestore-spread': noUnsafeFirestoreSpread,
    'no-jsx-in-hooks': noJsxInHooks,
    'enforce-assert-throws': enforceAssertThrows,
    'prefer-batch-operations': preferBatchOperations,
    'no-complex-cloud-params': noComplexCloudParams,
    'no-mixed-firestore-transactions': noMixedFirestoreTransactions,
    'enforce-firestore-facade': enforceFirestoreFacade,
    'sync-onwrite-name-func': syncOnwriteNameFunc,
    'prefer-clone-deep': preferCloneDeep,
    'no-firestore-jest-mock': noFirestoreJestMock,
    'no-mock-firebase-admin': noMockFirebaseAdmin,
    'enforce-centralized-mock-firestore': enforceCentralizedMockFirestore,
    'require-hooks-default-params': requireHooksDefaultParams,
    'prefer-destructuring-no-class': preferDestructuringNoClass,
    'enforce-render-hits-memoization': enforceRenderHitsMemoization,
    'prefer-fragment-component': preferFragmentComponent,
    'react-usememo-should-be-component': reactUseMemoShouldBeComponent,
    'no-unnecessary-verb-suffix': noUnnecessaryVerbSuffix,
    'enforce-assertSafe-object-key': enforceAssertSafeObjectKey,
    'enforce-object-literal-as-const': enforceObjectLiteralAsConst,
    'enforce-positive-naming': enforcePositiveNaming,
    'no-type-assertion-returns': noTypeAssertionReturns,
    'prefer-utility-function-over-private-static': preferUtilityFunctionOverPrivateStatic,
    'enforce-microdiff': enforceMicrodiff,
    'enforce-timestamp-now': enforceTimestampNow,
    'no-always-true-false-conditions': noAlwaysTrueFalseConditions,
    'enforce-props-argument-name': enforcePropsArgumentName,
    'prefer-global-router-state-key': preferGlobalRouterStateKey,
    'enforce-id-capitalization': enforceIdCapitalization,
  },
};
