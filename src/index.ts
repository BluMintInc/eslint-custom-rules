import { arrayMethodsThisContext } from './rules/array-methods-this-context';
import { classMethodsReadTopToBottom } from './rules/class-methods-read-top-to-bottom';
import { default as consistentCallbackNaming } from './rules/consistent-callback-naming';
import { parallelizeAsyncOperations } from './rules/parallelize-async-operations';
import { dynamicHttpsErrors } from './rules/dynamic-https-errors';
import { enforceIdentifiableFirestoreType } from './rules/enforce-identifiable-firestore-type';
import { default as enforceCallbackMemo } from './rules/enforce-callback-memo';
import { enforceCallableTypes } from './rules/enforce-callable-types';
import { enforceConsoleError } from './rules/enforce-console-error';
import { enforceFirebaseImports } from './rules/enforce-dynamic-firebase-imports';
import { enforceMuiRoundedIcons } from './rules/enforce-mui-rounded-icons';
import { enforceQueryKeyTs } from './rules/enforce-querykey-ts';
import { enforceReactTypeNaming } from './rules/enforce-react-type-naming';
import { enforceFirestoreRulesGetAccess } from './rules/enforce-firestore-rules-get-access';
import { exportIfInDoubt } from './rules/export-if-in-doubt';
import { extractGlobalConstants } from './rules/extract-global-constants';
import { enforceGlobalConstants } from './rules/enforce-global-constants';
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
import { preferTypeAliasOverTypeofConstant } from './rules/prefer-type-alias-over-typeof-constant';
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
import { memoizeRootLevelHocs } from './rules/memoize-root-level-hocs';
import { useCustomLink } from './rules/use-custom-link';
import { default as enforceSerializableParams } from './rules/enforce-serializable-params';
import { enforceRealtimedbPathUtils } from './rules/enforce-realtimedb-path-utils';
import { enforceMemoizeAsync } from './rules/enforce-memoize-async';
import { enforceExportedFunctionTypes } from './rules/enforce-exported-function-types';
import { enforceMemoizeGetters } from './rules/enforce-memoize-getters';
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
import { enforceAssertSafeObjectKey } from './rules/enforce-assert-safe-object-key';
import { enforceObjectLiteralAsConst } from './rules/enforce-object-literal-as-const';
import { enforcePositiveNaming } from './rules/enforce-positive-naming';
import { noTypeAssertionReturns } from './rules/no-type-assertion-returns';
import { preferUtilityFunctionOverPrivateStatic } from './rules/prefer-utility-function-over-private-static';
import { enforceMicrodiff } from './rules/enforce-microdiff';
import { fastDeepEqualOverMicrodiff } from './rules/fast-deep-equal-over-microdiff';
import { enforceTimestampNow } from './rules/enforce-timestamp-now';
import { noAlwaysTrueFalseConditions } from './rules/no-always-true-false-conditions';
import { enforcePropsArgumentName } from './rules/enforce-props-argument-name';
import { enforcePropsNamingConsistency } from './rules/enforce-props-naming-consistency';
import { preferGlobalRouterStateKey } from './rules/prefer-global-router-state-key';
import { preferUseMemoOverUseEffectUseState } from './rules/prefer-usememo-over-useeffect-usestate';
import enforceDynamicImports from './rules/enforce-dynamic-imports';
import { ensurePointerEventsNone } from './rules/ensure-pointer-events-none';
import { noObjectValuesOnStrings } from './rules/no-object-values-on-strings';
import { keyOnlyOutermostElement } from './rules/key-only-outermost-element';
import { noUnnecessaryDestructuring } from './rules/no-unnecessary-destructuring';
import { enforceSingularTypeNames } from './rules/enforce-singular-type-names';
import { enforceCssMediaQueries } from './rules/enforce-css-media-queries';
import { omitIndexHtml } from './rules/omit-index-html';
import { enforceIdCapitalization } from './rules/enforce-id-capitalization';
import { noUnusedUseState } from './rules/no-unused-usestate';
import { noUuidv4Base62AsKey } from './rules/no-uuidv4-base62-as-key';
import { logicalTopToBottomGrouping } from './rules/logical-top-to-bottom-grouping';
import enforceDynamicFileNaming from './rules/enforce-dynamic-file-naming';
import { default as preferUseCallbackOverUseMemoForFunctions } from './rules/prefer-usecallback-over-usememo-for-functions';
import { noMarginProperties } from './rules/no-margin-properties';
import { enforceBooleanNamingPrefixes } from './rules/enforce-boolean-naming-prefixes';
import { enforceFieldPathSyntaxInDocSetter } from './rules/enforce-fieldpath-syntax-in-docsetter';
import { preferBlockCommentsForDeclarations } from './rules/prefer-block-comments-for-declarations';
import { noUndefinedNullPassthrough } from './rules/no-undefined-null-passthrough';
import { firestoreTransactionReadsBeforeWrites } from './rules/firestore-transaction-reads-before-writes';
import { enforceTypescriptMarkdownCodeBlocks } from './rules/enforce-typescript-markdown-code-blocks';
import { preferNullishCoalescingOverride } from './rules/prefer-nullish-coalescing-override';
import { preferNullishCoalescingBooleanProps } from './rules/prefer-nullish-coalescing-boolean-props';
import { noRestrictedPropertiesFix } from './rules/no-restricted-properties-fix';
import { noExcessiveParentChain } from './rules/no-excessive-parent-chain';
import { preferDocumentFlattening } from './rules/prefer-document-flattening';
import { noOverridableMethodCallsInConstructor } from './rules/no-overridable-method-calls-in-constructor';
import { useLatestCallback } from './rules/use-latest-callback';
import { noStaleStateAcrossAwait } from './rules/no-stale-state-across-await';
import { noSeparateLoadingState } from './rules/no-separate-loading-state';
import { optimizeObjectBooleanConditions } from './rules/optimize-object-boolean-conditions';
import { preferParamsOverParentId } from './rules/prefer-params-over-parent-id';
import { preferFieldPathsInTransforms } from './rules/prefer-field-paths-in-transforms';
import { noMisleadingBooleanPrefixes } from './rules/no-misleading-boolean-prefixes';
import { preferUrlToStringOverToJson } from './rules/prefer-url-tostring-over-tojson';
import { preferNextDynamic } from './rules/prefer-next-dynamic';
import { default as noRedundantUseCallbackWrapper } from './rules/no-redundant-usecallback-wrapper';
import { noArrayLengthInDeps } from './rules/no-array-length-in-deps';
import { preferUseDeepCompareMemo } from './rules/prefer-use-deep-compare-memo';
import { noCircularReferences } from './rules/no-circular-references';
import { noPassthroughGetters } from './rules/no-passthrough-getters';
import { noTryCatchAlreadyExistsInTransaction } from './rules/no-try-catch-already-exists-in-transaction';
import { default as noStaticConstantsInDynamicFiles } from './rules/no-static-constants-in-dynamic-files';
import { testFileLocationEnforcement } from './rules/test-file-location-enforcement';

module.exports = {
  meta: {
    name: '@blumintinc/eslint-plugin-blumint',
    version: '1.12.6',
  },
  parseOptions: {
    ecmaVersion: 2020,
  },
  configs: {
    recommended: {
      plugins: ['@blumintinc/blumint'],
      rules: {
        '@blumintinc/blumint/firestore-transaction-reads-before-writes':
          'error',
        // Override the @typescript-eslint/prefer-nullish-coalescing rule
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@blumintinc/blumint/prefer-nullish-coalescing-override': 'error',
        '@blumintinc/blumint/prefer-block-comments-for-declarations': 'error',
        '@blumintinc/blumint/key-only-outermost-element': 'error',
        '@blumintinc/blumint/logical-top-to-bottom-grouping': 'error',
        '@blumintinc/blumint/parallelize-async-operations': 'error',
        '@blumintinc/blumint/avoid-utils-directory': 'error',
        '@blumintinc/blumint/enforce-firestore-path-utils': 'error',
        '@blumintinc/blumint/enforce-firestore-rules-get-access': 'error',
        '@blumintinc/blumint/no-jsx-whitespace-literal': 'error',
        '@blumintinc/blumint/array-methods-this-context': 'error',
        '@blumintinc/blumint/class-methods-read-top-to-bottom': 'error',
        '@blumintinc/blumint/consistent-callback-naming': 'error',
        '@blumintinc/blumint/dynamic-https-errors': 'error',
        '@blumintinc/blumint/enforce-mui-rounded-icons': 'error',
        '@blumintinc/blumint/enforce-identifiable-firestore-type': 'error',
        '@blumintinc/blumint/enforce-callback-memo': 'error',
        '@blumintinc/blumint/enforce-callable-types': 'error',
        '@blumintinc/blumint/enforce-console-error': 'error',
        '@blumintinc/blumint/enforce-dynamic-firebase-imports': 'error',
        '@blumintinc/blumint/enforce-react-type-naming': 'error',
        '@blumintinc/blumint/export-if-in-doubt': 'error',
        '@blumintinc/blumint/extract-global-constants': 'error',
        '@blumintinc/blumint/enforce-global-constants': 'error',
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
        '@blumintinc/blumint/no-uuidv4-base62-as-key': 'error',
        '@blumintinc/blumint/no-useless-fragment': 'error',
        '@blumintinc/blumint/prefer-fragment-shorthand': 'error',
        '@blumintinc/blumint/prefer-type-over-interface': 'error',
        '@blumintinc/blumint/prefer-type-alias-over-typeof-constant': 'error',
        '@blumintinc/blumint/require-memo': 'error',
        '@blumintinc/blumint/require-dynamic-firebase-imports': 'error',
        '@blumintinc/blumint/require-https-error': 'error',
        '@blumintinc/blumint/use-custom-router': 'error',
        '@blumintinc/blumint/require-image-optimized': 'error',
        '@blumintinc/blumint/require-usememo-object-literals': 'error',
        '@blumintinc/blumint/memoize-root-level-hocs': 'error',
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
        '@blumintinc/blumint/enforce-memoize-getters': 'error',
        '@blumintinc/blumint/no-class-instance-destructuring': 'error',
        '@blumintinc/blumint/no-firestore-object-arrays': 'error',
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
        '@blumintinc/blumint/prefer-fragment-component': 'off',
        '@blumintinc/blumint/react-usememo-should-be-component': 'error',
        '@blumintinc/blumint/no-unnecessary-verb-suffix': 'error',
        '@blumintinc/blumint/enforce-assert-safe-object-key': 'error',
        '@blumintinc/blumint/enforce-object-literal-as-const': 'error',
        '@blumintinc/blumint/enforce-positive-naming': 'error',
        '@blumintinc/blumint/no-type-assertion-returns': 'error',
        '@blumintinc/blumint/prefer-utility-function-over-private-static':
          'error',
        '@blumintinc/blumint/enforce-microdiff': 'error',
        '@blumintinc/blumint/fast-deep-equal-over-microdiff': 'error',
        '@blumintinc/blumint/enforce-timestamp-now': 'error',
        '@blumintinc/blumint/enforce-typescript-markdown-code-blocks': 'error',
        '@blumintinc/blumint/no-always-true-false-conditions': 'error',
        '@blumintinc/blumint/enforce-props-argument-name': 'error',
        '@blumintinc/blumint/enforce-props-naming-consistency': 'error',
        '@blumintinc/blumint/prefer-global-router-state-key': 'error',
        '@blumintinc/blumint/prefer-usememo-over-useeffect-usestate': 'error',
        '@blumintinc/blumint/enforce-dynamic-imports': 'error',
        '@blumintinc/blumint/ensure-pointer-events-none': 'error',
        '@blumintinc/blumint/no-object-values-on-strings': 'error',
        '@blumintinc/blumint/no-unnecessary-destructuring': 'error',
        '@blumintinc/blumint/enforce-singular-type-names': 'error',
        '@blumintinc/blumint/enforce-css-media-queries': 'error',
        '@blumintinc/blumint/omit-index-html': 'error',
        '@blumintinc/blumint/enforce-id-capitalization': 'error',
        '@blumintinc/blumint/no-unused-usestate': 'error',
        '@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions':
          'error',
        '@blumintinc/blumint/no-margin-properties': 'error',
        '@blumintinc/blumint/enforce-boolean-naming-prefixes': 'error',
        '@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter': 'error',
        '@blumintinc/blumint/no-undefined-null-passthrough': 'error',
        '@blumintinc/blumint/prefer-nullish-coalescing-boolean-props': 'error',
        '@blumintinc/blumint/no-overridable-method-calls-in-constructor':
          'error',
        '@blumintinc/blumint/use-latest-callback': 'error',
        '@blumintinc/blumint/enforce-querykey-ts': 'error',
        '@blumintinc/blumint/no-stale-state-across-await': 'error',
        '@blumintinc/blumint/no-separate-loading-state': 'error',
        '@blumintinc/blumint/optimize-object-boolean-conditions': 'error',
        '@blumintinc/blumint/prefer-params-over-parent-id': 'error',
        '@blumintinc/blumint/prefer-field-paths-in-transforms': 'warn',
        '@blumintinc/blumint/no-misleading-boolean-prefixes': 'error',
        '@blumintinc/blumint/prefer-url-tostring-over-tojson': 'error',
        '@blumintinc/blumint/prefer-next-dynamic': 'error',
        '@blumintinc/blumint/no-redundant-usecallback-wrapper': 'error',
        '@blumintinc/blumint/no-array-length-in-deps': 'error',
        '@blumintinc/blumint/prefer-use-deep-compare-memo': 'error',
        '@blumintinc/blumint/no-circular-references': 'error',
        '@blumintinc/blumint/no-try-catch-already-exists-in-transaction':
          'error',
        '@blumintinc/blumint/no-passthrough-getters': 'error',
        '@blumintinc/blumint/no-static-constants-in-dynamic-files': 'error',
        '@blumintinc/blumint/test-file-location-enforcement': 'error',
      },
    },
  },

  rules: {
    'firestore-transaction-reads-before-writes':
      firestoreTransactionReadsBeforeWrites,
    'prefer-nullish-coalescing-override': preferNullishCoalescingOverride,
    'no-restricted-properties-fix': noRestrictedPropertiesFix,
    'no-excessive-parent-chain': noExcessiveParentChain,
    'prefer-document-flattening': preferDocumentFlattening,
    'prefer-block-comments-for-declarations':
      preferBlockCommentsForDeclarations,
    'key-only-outermost-element': keyOnlyOutermostElement,
    'logical-top-to-bottom-grouping': logicalTopToBottomGrouping,
    'array-methods-this-context': arrayMethodsThisContext,
    'class-methods-read-top-to-bottom': classMethodsReadTopToBottom,
    'consistent-callback-naming': consistentCallbackNaming,
    'parallelize-async-operations': parallelizeAsyncOperations,
    'dynamic-https-errors': dynamicHttpsErrors,
    'enforce-identifiable-firestore-type': enforceIdentifiableFirestoreType,
    'enforce-callback-memo': enforceCallbackMemo,
    'enforce-react-type-naming': enforceReactTypeNaming,
    'enforce-firestore-rules-get-access': enforceFirestoreRulesGetAccess,
    'enforce-callable-types': enforceCallableTypes,
    'enforce-console-error': enforceConsoleError,
    'enforce-dynamic-firebase-imports': enforceFirebaseImports,
    'enforce-mui-rounded-icons': enforceMuiRoundedIcons,
    'export-if-in-doubt': exportIfInDoubt,
    'extract-global-constants': extractGlobalConstants,
    'enforce-global-constants': enforceGlobalConstants,
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
    'no-uuidv4-base62-as-key': noUuidv4Base62AsKey,
    'enforce-dynamic-file-naming': enforceDynamicFileNaming,
    'prefer-fragment-shorthand': preferFragmentShorthand,
    'prefer-type-over-interface': preferTypeOverInterface,
    'prefer-type-alias-over-typeof-constant': preferTypeAliasOverTypeofConstant,
    'require-memo': requireMemo,
    'no-jsx-whitespace-literal': noJsxWhitespaceLiteral,
    'require-dynamic-firebase-imports': requireDynamicFirebaseImports,
    'require-https-error': requireHttpsError,
    'use-custom-router': useCustomRouter,
    'require-image-optimized': requireImageOptimized,
    'require-usememo-object-literals': requireUseMemoObjectLiterals,
    'memoize-root-level-hocs': memoizeRootLevelHocs,
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
    'enforce-memoize-getters': enforceMemoizeGetters,
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
    'enforce-assert-safe-object-key': enforceAssertSafeObjectKey,
    'enforce-object-literal-as-const': enforceObjectLiteralAsConst,
    'enforce-positive-naming': enforcePositiveNaming,
    'no-type-assertion-returns': noTypeAssertionReturns,
    'prefer-utility-function-over-private-static':
      preferUtilityFunctionOverPrivateStatic,
    'enforce-microdiff': enforceMicrodiff,
    'fast-deep-equal-over-microdiff': fastDeepEqualOverMicrodiff,
    'enforce-timestamp-now': enforceTimestampNow,
    'enforce-typescript-markdown-code-blocks':
      enforceTypescriptMarkdownCodeBlocks,
    'no-always-true-false-conditions': noAlwaysTrueFalseConditions,
    'enforce-props-argument-name': enforcePropsArgumentName,
    'enforce-props-naming-consistency': enforcePropsNamingConsistency,
    'prefer-global-router-state-key': preferGlobalRouterStateKey,
    'prefer-usememo-over-useeffect-usestate':
      preferUseMemoOverUseEffectUseState,
    'enforce-dynamic-imports': enforceDynamicImports,
    'ensure-pointer-events-none': ensurePointerEventsNone,
    'no-object-values-on-strings': noObjectValuesOnStrings,
    'no-unnecessary-destructuring': noUnnecessaryDestructuring,
    'enforce-singular-type-names': enforceSingularTypeNames,
    'enforce-css-media-queries': enforceCssMediaQueries,
    'omit-index-html': omitIndexHtml,
    'enforce-id-capitalization': enforceIdCapitalization,
    'no-unused-usestate': noUnusedUseState,
    'prefer-usecallback-over-usememo-for-functions':
      preferUseCallbackOverUseMemoForFunctions,
    'no-margin-properties': noMarginProperties,
    'enforce-boolean-naming-prefixes': enforceBooleanNamingPrefixes,
    'enforce-fieldpath-syntax-in-docsetter': enforceFieldPathSyntaxInDocSetter,
    'no-undefined-null-passthrough': noUndefinedNullPassthrough,
    'prefer-nullish-coalescing-boolean-props':
      preferNullishCoalescingBooleanProps,
    'no-overridable-method-calls-in-constructor':
      noOverridableMethodCallsInConstructor,
    'use-latest-callback': useLatestCallback,
    'enforce-querykey-ts': enforceQueryKeyTs,
    'no-stale-state-across-await': noStaleStateAcrossAwait,
    'no-separate-loading-state': noSeparateLoadingState,
    'optimize-object-boolean-conditions': optimizeObjectBooleanConditions,
    'prefer-params-over-parent-id': preferParamsOverParentId,
    'prefer-field-paths-in-transforms': preferFieldPathsInTransforms,
    'no-misleading-boolean-prefixes': noMisleadingBooleanPrefixes,
    'prefer-url-tostring-over-tojson': preferUrlToStringOverToJson,
    'prefer-next-dynamic': preferNextDynamic,
    'no-redundant-usecallback-wrapper': noRedundantUseCallbackWrapper,
    'no-array-length-in-deps': noArrayLengthInDeps,
    'prefer-use-deep-compare-memo': preferUseDeepCompareMemo,
    'no-circular-references': noCircularReferences,
    'no-try-catch-already-exists-in-transaction':
      noTryCatchAlreadyExistsInTransaction,
    'no-passthrough-getters': noPassthroughGetters,
    'no-static-constants-in-dynamic-files': noStaticConstantsInDynamicFiles,
    'test-file-location-enforcement': testFileLocationEnforcement,
  },
};
