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
const require_image_overlayed_1 = __importDefault(require("./rules/require-image-overlayed"));
const require_usememo_object_literals_1 = require("./rules/require-usememo-object-literals");
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
        'require-image-overlayed': require_image_overlayed_1.default,
        'require-usememo-object-literals': require_usememo_object_literals_1.requireUseMemoObjectLiterals,
    },
};
//# sourceMappingURL=index.js.map