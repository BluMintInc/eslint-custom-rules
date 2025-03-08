"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const array_methods_this_context_1 = require("./rules/array-methods-this-context");
const class_methods_read_top_to_bottom_1 = require("./rules/class-methods-read-top-to-bottom");
const consistent_callback_naming_1 = __importDefault(require("./rules/consistent-callback-naming"));
const dynamic_https_errors_1 = require("./rules/dynamic-https-errors");
const enforce_identifiable_firestore_type_1 = require("./rules/enforce-identifiable-firestore-type");
const enforce_callback_memo_1 = __importDefault(require("./rules/enforce-callback-memo"));
const enforce_callable_types_1 = require("./rules/enforce-callable-types");
const enforce_dynamic_firebase_imports_1 = require("./rules/enforce-dynamic-firebase-imports");
const enforce_mui_rounded_icons_1 = require("./rules/enforce-mui-rounded-icons");
const enforce_react_type_naming_1 = require("./rules/enforce-react-type-naming");
const export_if_in_doubt_1 = require("./rules/export-if-in-doubt");
const extract_global_constants_1 = require("./rules/extract-global-constants");
const generic_starts_with_t_1 = require("./rules/generic-starts-with-t");
const global_const_style_1 = __importDefault(require("./rules/global-const-style"));
const no_async_array_filter_1 = require("./rules/no-async-array-filter");
const no_async_foreach_1 = require("./rules/no-async-foreach");
const no_conditional_literals_in_jsx_1 = require("./rules/no-conditional-literals-in-jsx");
const no_filter_without_return_1 = require("./rules/no-filter-without-return");
const no_hungarian_1 = require("./rules/no-hungarian");
const no_misused_switch_case_1 = require("./rules/no-misused-switch-case");
const no_unpinned_dependencies_1 = require("./rules/no-unpinned-dependencies");
const no_unused_props_1 = require("./rules/no-unused-props");
const no_useless_fragment_1 = require("./rules/no-useless-fragment");
const prefer_fragment_shorthand_1 = require("./rules/prefer-fragment-shorthand");
const prefer_type_over_interface_1 = require("./rules/prefer-type-over-interface");
const require_memo_1 = require("./rules/require-memo");
const no_jsx_whitespace_literal_1 = require("./rules/no-jsx-whitespace-literal");
const require_dynamic_firebase_imports_1 = __importDefault(require("./rules/require-dynamic-firebase-imports"));
const require_https_error_1 = __importDefault(require("./rules/require-https-error"));
const use_custom_router_1 = require("./rules/use-custom-router");
const require_image_optimized_1 = __importDefault(require("./rules/require-image-optimized"));
const require_usememo_object_literals_1 = require("./rules/require-usememo-object-literals");
const enforce_safe_stringify_1 = require("./rules/enforce-safe-stringify");
const avoid_utils_directory_1 = require("./rules/avoid-utils-directory");
const no_entire_object_hook_deps_1 = require("./rules/no-entire-object-hook-deps");
const enforce_firestore_path_utils_1 = require("./rules/enforce-firestore-path-utils");
const no_compositing_layer_props_1 = require("./rules/no-compositing-layer-props");
const enforce_firestore_doc_ref_generic_1 = require("./rules/enforce-firestore-doc-ref-generic");
const semantic_function_prefixes_1 = require("./rules/semantic-function-prefixes");
const enforce_mock_firestore_1 = require("./rules/enforce-mock-firestore");
const prefer_settings_object_1 = require("./rules/prefer-settings-object");
const enforce_firestore_set_merge_1 = require("./rules/enforce-firestore-set-merge");
const enforce_verb_noun_naming_1 = require("./rules/enforce-verb-noun-naming");
const no_explicit_return_type_1 = require("./rules/no-explicit-return-type");
const use_custom_memo_1 = require("./rules/use-custom-memo");
const use_custom_link_1 = require("./rules/use-custom-link");
const enforce_serializable_params_1 = __importDefault(require("./rules/enforce-serializable-params"));
const enforce_realtimedb_path_utils_1 = require("./rules/enforce-realtimedb-path-utils");
const enforce_memoize_async_1 = require("./rules/enforce-memoize-async");
const enforce_exported_function_types_1 = require("./rules/enforce-exported-function-types");
const no_redundant_param_types_1 = require("./rules/no-redundant-param-types");
const no_class_instance_destructuring_1 = require("./rules/no-class-instance-destructuring");
const no_firestore_object_arrays_1 = require("./rules/no-firestore-object-arrays");
const no_memoize_on_static_1 = require("./rules/no-memoize-on-static");
const no_unsafe_firestore_spread_1 = require("./rules/no-unsafe-firestore-spread");
const no_jsx_in_hooks_1 = require("./rules/no-jsx-in-hooks");
const enforce_assert_throws_1 = require("./rules/enforce-assert-throws");
const prefer_batch_operations_1 = require("./rules/prefer-batch-operations");
const no_complex_cloud_params_1 = require("./rules/no-complex-cloud-params");
const no_mixed_firestore_transactions_1 = require("./rules/no-mixed-firestore-transactions");
const enforce_firestore_facade_1 = require("./rules/enforce-firestore-facade");
const sync_onwrite_name_func_1 = require("./rules/sync-onwrite-name-func");
const prefer_clone_deep_1 = require("./rules/prefer-clone-deep");
const no_firestore_jest_mock_1 = require("./rules/no-firestore-jest-mock");
const no_mock_firebase_admin_1 = require("./rules/no-mock-firebase-admin");
const enforce_centralized_mock_firestore_1 = require("./rules/enforce-centralized-mock-firestore");
const require_hooks_default_params_1 = require("./rules/require-hooks-default-params");
const prefer_destructuring_no_class_1 = require("./rules/prefer-destructuring-no-class");
const enforce_render_hits_memoization_1 = require("./rules/enforce-render-hits-memoization");
const prefer_fragment_component_1 = require("./rules/prefer-fragment-component");
const react_usememo_should_be_component_1 = require("./rules/react-usememo-should-be-component");
const no_unnecessary_verb_suffix_1 = require("./rules/no-unnecessary-verb-suffix");
const enforce_assertSafe_object_key_1 = require("./rules/enforce-assertSafe-object-key");
const enforce_object_literal_as_const_1 = require("./rules/enforce-object-literal-as-const");
const enforce_positive_naming_1 = require("./rules/enforce-positive-naming");
const no_type_assertion_returns_1 = require("./rules/no-type-assertion-returns");
const prefer_utility_function_over_private_static_1 = require("./rules/prefer-utility-function-over-private-static");
const enforce_microdiff_1 = require("./rules/enforce-microdiff");
const fast_deep_equal_over_microdiff_1 = require("./rules/fast-deep-equal-over-microdiff");
const enforce_timestamp_now_1 = require("./rules/enforce-timestamp-now");
const no_always_true_false_conditions_1 = require("./rules/no-always-true-false-conditions");
const enforce_props_argument_name_1 = require("./rules/enforce-props-argument-name");
const prefer_global_router_state_key_1 = require("./rules/prefer-global-router-state-key");
const prefer_usememo_over_useeffect_usestate_1 = require("./rules/prefer-usememo-over-useeffect-usestate");
const enforce_dynamic_imports_1 = __importDefault(require("./rules/enforce-dynamic-imports"));
const ensure_pointer_events_none_1 = require("./rules/ensure-pointer-events-none");
const no_object_values_on_strings_1 = require("./rules/no-object-values-on-strings");
const key_only_outermost_element_1 = require("./rules/key-only-outermost-element");
const no_unnecessary_destructuring_1 = require("./rules/no-unnecessary-destructuring");
const enforce_singular_type_names_1 = require("./rules/enforce-singular-type-names");
const enforce_css_media_queries_1 = require("./rules/enforce-css-media-queries");
const omit_index_html_1 = require("./rules/omit-index-html");
const enforce_id_capitalization_1 = require("./rules/enforce-id-capitalization");
const no_unused_usestate_1 = require("./rules/no-unused-usestate");
const no_uuidv4_base62_as_key_1 = require("./rules/no-uuidv4-base62-as-key");
const enforce_dynamic_file_naming_1 = __importDefault(require("./rules/enforce-dynamic-file-naming"));
const prefer_usecallback_over_usememo_for_functions_1 = __importDefault(require("./rules/prefer-usecallback-over-usememo-for-functions"));
const no_margin_properties_1 = require("./rules/no-margin-properties");
const enforce_boolean_naming_prefixes_1 = require("./rules/enforce-boolean-naming-prefixes");
module.exports = {
    meta: {
        name: '@blumintinc/eslint-plugin-blumint',
        version: '1.10.0',
    },
    parseOptions: {
        ecmaVersion: 2020,
    },
    configs: {
        recommended: {
            plugins: ['@blumintinc/blumint'],
            rules: {
                '@blumintinc/blumint/key-only-outermost-element': 'error',
                '@blumintinc/blumint/avoid-utils-directory': 'error',
                '@blumintinc/blumint/enforce-firestore-path-utils': 'error',
                '@blumintinc/blumint/no-jsx-whitespace-literal': 'error',
                '@blumintinc/blumint/array-methods-this-context': 'error',
                '@blumintinc/blumint/class-methods-read-top-to-bottom': 'error',
                '@blumintinc/blumint/consistent-callback-naming': 'error',
                '@blumintinc/blumint/dynamic-https-errors': 'error',
                '@blumintinc/blumint/enforce-mui-rounded-icons': 'error',
                '@blumintinc/blumint/enforce-identifiable-firestore-type': 'error',
                '@blumintinc/blumint/enforce-callback-memo': 'error',
                '@blumintinc/blumint/enforce-callable-types': 'error',
                '@blumintinc/blumint/enforce-dynamic-firebase-imports': 'error',
                '@blumintinc/blumint/enforce-react-type-naming': 'error',
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
                '@blumintinc/blumint/no-uuidv4-base62-as-key': 'error',
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
                '@blumintinc/blumint/fast-deep-equal-over-microdiff': 'error',
                '@blumintinc/blumint/enforce-timestamp-now': 'error',
                '@blumintinc/blumint/no-always-true-false-conditions': 'error',
                '@blumintinc/blumint/enforce-props-argument-name': 'error',
                '@blumintinc/blumint/prefer-global-router-state-key': 'error',
                '@blumintinc/blumint/prefer-usememo-over-useeffect-usestate': 'error',
                '@blumintinc/blumint/enforce-dynamic-imports': [
                    'error',
                    {
                        libraries: ['@stream-io/video-react-sdk', 'some-heavy-lib*'],
                        allowImportType: true,
                    },
                ],
                '@blumintinc/blumint/ensure-pointer-events-none': 'error',
                '@blumintinc/blumint/no-object-values-on-strings': 'error',
                '@blumintinc/blumint/no-unnecessary-destructuring': 'error',
                '@blumintinc/blumint/enforce-singular-type-names': 'error',
                '@blumintinc/blumint/enforce-css-media-queries': 'error',
                '@blumintinc/blumint/omit-index-html': 'error',
                '@blumintinc/blumint/enforce-id-capitalization': 'error',
                '@blumintinc/blumint/no-unused-usestate': 'error',
                '@blumintinc/blumint/enforce-dynamic-file-naming': 'error',
                '@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions': 'error',
                '@blumintinc/blumint/no-margin-properties': 'error',
                '@blumintinc/blumint/enforce-boolean-naming-prefixes': 'error',
            },
        },
    },
    rules: {
        'key-only-outermost-element': key_only_outermost_element_1.keyOnlyOutermostElement,
        'array-methods-this-context': array_methods_this_context_1.arrayMethodsThisContext,
        'class-methods-read-top-to-bottom': class_methods_read_top_to_bottom_1.classMethodsReadTopToBottom,
        'consistent-callback-naming': consistent_callback_naming_1.default,
        'dynamic-https-errors': dynamic_https_errors_1.dynamicHttpsErrors,
        'enforce-identifiable-firestore-type': enforce_identifiable_firestore_type_1.enforceIdentifiableFirestoreType,
        'enforce-callback-memo': enforce_callback_memo_1.default,
        'enforce-react-type-naming': enforce_react_type_naming_1.enforceReactTypeNaming,
        'enforce-callable-types': enforce_callable_types_1.enforceCallableTypes,
        'enforce-dynamic-firebase-imports': enforce_dynamic_firebase_imports_1.enforceFirebaseImports,
        'enforce-mui-rounded-icons': enforce_mui_rounded_icons_1.enforceMuiRoundedIcons,
        'export-if-in-doubt': export_if_in_doubt_1.exportIfInDoubt,
        'extract-global-constants': extract_global_constants_1.extractGlobalConstants,
        'generic-starts-with-t': generic_starts_with_t_1.genericStartsWithT,
        'global-const-style': global_const_style_1.default,
        'no-async-array-filter': no_async_array_filter_1.noAsyncArrayFilter,
        'no-async-foreach': no_async_foreach_1.noAsyncForEach,
        'no-conditional-literals-in-jsx': no_conditional_literals_in_jsx_1.noConditionalLiteralsInJsx,
        'no-filter-without-return': no_filter_without_return_1.noFilterWithoutReturn,
        'no-hungarian': no_hungarian_1.noHungarian,
        'no-misused-switch-case': no_misused_switch_case_1.noMisusedSwitchCase,
        'no-unpinned-dependencies': no_unpinned_dependencies_1.noUnpinnedDependencies,
        'no-unused-props': no_unused_props_1.noUnusedProps,
        'no-useless-fragment': no_useless_fragment_1.noUselessFragment,
        'no-uuidv4-base62-as-key': no_uuidv4_base62_as_key_1.noUuidv4Base62AsKey,
        'enforce-dynamic-file-naming': enforce_dynamic_file_naming_1.default,
        'prefer-fragment-shorthand': prefer_fragment_shorthand_1.preferFragmentShorthand,
        'prefer-type-over-interface': prefer_type_over_interface_1.preferTypeOverInterface,
        'require-memo': require_memo_1.requireMemo,
        'no-jsx-whitespace-literal': no_jsx_whitespace_literal_1.noJsxWhitespaceLiteral,
        'require-dynamic-firebase-imports': require_dynamic_firebase_imports_1.default,
        'require-https-error': require_https_error_1.default,
        'use-custom-router': use_custom_router_1.useCustomRouter,
        'require-image-optimized': require_image_optimized_1.default,
        'require-usememo-object-literals': require_usememo_object_literals_1.requireUseMemoObjectLiterals,
        'enforce-safe-stringify': enforce_safe_stringify_1.enforceStableStringify,
        'avoid-utils-directory': avoid_utils_directory_1.avoidUtilsDirectory,
        'no-entire-object-hook-deps': no_entire_object_hook_deps_1.noEntireObjectHookDeps,
        'enforce-firestore-path-utils': enforce_firestore_path_utils_1.enforceFirestorePathUtils,
        'no-compositing-layer-props': no_compositing_layer_props_1.noCompositingLayerProps,
        'enforce-firestore-doc-ref-generic': enforce_firestore_doc_ref_generic_1.enforceFirestoreDocRefGeneric,
        'semantic-function-prefixes': semantic_function_prefixes_1.semanticFunctionPrefixes,
        'enforce-mock-firestore': enforce_mock_firestore_1.enforceFirestoreMock,
        'prefer-settings-object': prefer_settings_object_1.preferSettingsObject,
        'enforce-firestore-set-merge': enforce_firestore_set_merge_1.enforceFirestoreSetMerge,
        'enforce-verb-noun-naming': enforce_verb_noun_naming_1.enforceVerbNounNaming,
        'no-explicit-return-type': no_explicit_return_type_1.noExplicitReturnType,
        'use-custom-memo': use_custom_memo_1.useCustomMemo,
        'use-custom-link': use_custom_link_1.useCustomLink,
        'enforce-serializable-params': enforce_serializable_params_1.default,
        'enforce-realtimedb-path-utils': enforce_realtimedb_path_utils_1.enforceRealtimedbPathUtils,
        'enforce-memoize-async': enforce_memoize_async_1.enforceMemoizeAsync,
        'enforce-exported-function-types': enforce_exported_function_types_1.enforceExportedFunctionTypes,
        'no-redundant-param-types': no_redundant_param_types_1.noRedundantParamTypes,
        'no-class-instance-destructuring': no_class_instance_destructuring_1.noClassInstanceDestructuring,
        'no-firestore-object-arrays': no_firestore_object_arrays_1.noFirestoreObjectArrays,
        'no-memoize-on-static': no_memoize_on_static_1.noMemoizeOnStatic,
        'no-unsafe-firestore-spread': no_unsafe_firestore_spread_1.noUnsafeFirestoreSpread,
        'no-jsx-in-hooks': no_jsx_in_hooks_1.noJsxInHooks,
        'enforce-assert-throws': enforce_assert_throws_1.enforceAssertThrows,
        'prefer-batch-operations': prefer_batch_operations_1.preferBatchOperations,
        'no-complex-cloud-params': no_complex_cloud_params_1.noComplexCloudParams,
        'no-mixed-firestore-transactions': no_mixed_firestore_transactions_1.noMixedFirestoreTransactions,
        'enforce-firestore-facade': enforce_firestore_facade_1.enforceFirestoreFacade,
        'sync-onwrite-name-func': sync_onwrite_name_func_1.syncOnwriteNameFunc,
        'prefer-clone-deep': prefer_clone_deep_1.preferCloneDeep,
        'no-firestore-jest-mock': no_firestore_jest_mock_1.noFirestoreJestMock,
        'no-mock-firebase-admin': no_mock_firebase_admin_1.noMockFirebaseAdmin,
        'enforce-centralized-mock-firestore': enforce_centralized_mock_firestore_1.enforceCentralizedMockFirestore,
        'require-hooks-default-params': require_hooks_default_params_1.requireHooksDefaultParams,
        'prefer-destructuring-no-class': prefer_destructuring_no_class_1.preferDestructuringNoClass,
        'enforce-render-hits-memoization': enforce_render_hits_memoization_1.enforceRenderHitsMemoization,
        'prefer-fragment-component': prefer_fragment_component_1.preferFragmentComponent,
        'react-usememo-should-be-component': react_usememo_should_be_component_1.reactUseMemoShouldBeComponent,
        'no-unnecessary-verb-suffix': no_unnecessary_verb_suffix_1.noUnnecessaryVerbSuffix,
        'enforce-assertSafe-object-key': enforce_assertSafe_object_key_1.enforceAssertSafeObjectKey,
        'enforce-object-literal-as-const': enforce_object_literal_as_const_1.enforceObjectLiteralAsConst,
        'enforce-positive-naming': enforce_positive_naming_1.enforcePositiveNaming,
        'no-type-assertion-returns': no_type_assertion_returns_1.noTypeAssertionReturns,
        'prefer-utility-function-over-private-static': prefer_utility_function_over_private_static_1.preferUtilityFunctionOverPrivateStatic,
        'enforce-microdiff': enforce_microdiff_1.enforceMicrodiff,
        'fast-deep-equal-over-microdiff': fast_deep_equal_over_microdiff_1.fastDeepEqualOverMicrodiff,
        'enforce-timestamp-now': enforce_timestamp_now_1.enforceTimestampNow,
        'no-always-true-false-conditions': no_always_true_false_conditions_1.noAlwaysTrueFalseConditions,
        'enforce-props-argument-name': enforce_props_argument_name_1.enforcePropsArgumentName,
        'prefer-global-router-state-key': prefer_global_router_state_key_1.preferGlobalRouterStateKey,
        'prefer-usememo-over-useeffect-usestate': prefer_usememo_over_useeffect_usestate_1.preferUseMemoOverUseEffectUseState,
        'enforce-dynamic-imports': enforce_dynamic_imports_1.default,
        'ensure-pointer-events-none': ensure_pointer_events_none_1.ensurePointerEventsNone,
        'no-object-values-on-strings': no_object_values_on_strings_1.noObjectValuesOnStrings,
        'no-unnecessary-destructuring': no_unnecessary_destructuring_1.noUnnecessaryDestructuring,
        'enforce-singular-type-names': enforce_singular_type_names_1.enforceSingularTypeNames,
        'enforce-css-media-queries': enforce_css_media_queries_1.enforceCssMediaQueries,
        'omit-index-html': omit_index_html_1.omitIndexHtml,
        'enforce-id-capitalization': enforce_id_capitalization_1.enforceIdCapitalization,
        'no-unused-usestate': no_unused_usestate_1.noUnusedUseState,
        'prefer-usecallback-over-usememo-for-functions': prefer_usecallback_over_usememo_for_functions_1.default,
        'no-margin-properties': no_margin_properties_1.noMarginProperties,
        'enforce-boolean-naming-prefixes': enforce_boolean_naming_prefixes_1.enforceBooleanNamingPrefixes,
    },
};
//# sourceMappingURL=index.js.map