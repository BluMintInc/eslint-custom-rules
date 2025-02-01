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
const export_if_in_doubt_1 = require("./rules/export-if-in-doubt");
const extract_global_constants_1 = require("./rules/extract-global-constants");
const generic_starts_with_t_1 = require("./rules/generic-starts-with-t");
const global_const_style_1 = __importDefault(require("./rules/global-const-style"));
const no_async_array_filter_1 = require("./rules/no-async-array-filter");
const no_async_foreach_1 = require("./rules/no-async-foreach");
const no_conditional_literals_in_jsx_1 = require("./rules/no-conditional-literals-in-jsx");
const no_filter_without_return_1 = require("./rules/no-filter-without-return");
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
module.exports = {
    meta: {
        name: '@blumintinc/eslint-plugin-blumint',
        version: '1.5.3',
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
                '@blumintinc/blumint/no-misused-switch-case': 'error',
                '@blumintinc/blumint/no-unpinned-dependencies': 'error',
                '@blumintinc/blumint/no-unused-props': 'error',
                //'@blumintinc/blumint/no-useless-fragment': 'error',
                '@blumintinc/blumint/prefer-fragment-shorthand': 'error',
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
            },
        },
    },
    rules: {
        'array-methods-this-context': array_methods_this_context_1.arrayMethodsThisContext,
        'class-methods-read-top-to-bottom': class_methods_read_top_to_bottom_1.classMethodsReadTopToBottom,
        'consistent-callback-naming': consistent_callback_naming_1.default,
        'dynamic-https-errors': dynamic_https_errors_1.dynamicHttpsErrors,
        'enforce-identifiable-firestore-type': enforce_identifiable_firestore_type_1.enforceIdentifiableFirestoreType,
        'enforce-callback-memo': enforce_callback_memo_1.default,
        'enforce-callable-types': enforce_callable_types_1.enforceCallableTypes,
        'enforce-dynamic-firebase-imports': enforce_dynamic_firebase_imports_1.enforceFirebaseImports,
        'export-if-in-doubt': export_if_in_doubt_1.exportIfInDoubt,
        'extract-global-constants': extract_global_constants_1.extractGlobalConstants,
        'generic-starts-with-t': generic_starts_with_t_1.genericStartsWithT,
        'global-const-style': global_const_style_1.default,
        'no-async-array-filter': no_async_array_filter_1.noAsyncArrayFilter,
        'no-async-foreach': no_async_foreach_1.noAsyncForEach,
        'no-conditional-literals-in-jsx': no_conditional_literals_in_jsx_1.noConditionalLiteralsInJsx,
        'no-filter-without-return': no_filter_without_return_1.noFilterWithoutReturn,
        'no-misused-switch-case': no_misused_switch_case_1.noMisusedSwitchCase,
        'no-unpinned-dependencies': no_unpinned_dependencies_1.noUnpinnedDependencies,
        'no-unused-props': no_unused_props_1.noUnusedProps,
        'no-useless-fragment': no_useless_fragment_1.noUselessFragment,
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
    },
};
//# sourceMappingURL=index.js.map