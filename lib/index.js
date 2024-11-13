"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const array_methods_this_context_1 = require("./rules/array-methods-this-context");
const class_methods_read_top_to_bottom_1 = require("./rules/class-methods-read-top-to-bottom");
const dynamic_https_errors_1 = require("./rules/dynamic-https-errors");
const export_if_in_doubt_1 = require("./rules/export-if-in-doubt");
const extract_global_constants_1 = require("./rules/extract-global-constants");
const generic_starts_with_t_1 = require("./rules/generic-starts-with-t");
const no_async_array_filter_1 = require("./rules/no-async-array-filter");
const no_async_foreach_1 = require("./rules/no-async-foreach");
const no_conditional_literals_in_jsx_1 = require("./rules/no-conditional-literals-in-jsx");
const no_filter_without_return_1 = require("./rules/no-filter-without-return");
const no_misused_switch_case_1 = require("./rules/no-misused-switch-case");
const no_unpinned_dependencies_1 = require("./rules/no-unpinned-dependencies");
const no_useless_fragment_1 = require("./rules/no-useless-fragment");
const prefer_fragment_shorthand_1 = require("./rules/prefer-fragment-shorthand");
const prefer_type_over_interface_1 = require("./rules/prefer-type-over-interface");
const require_memo_1 = require("./rules/require-memo");
module.exports = {
    meta: {
        name: '@blumintinc/eslint-plugin-blumint',
        version: '1.0.2',
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
        'array-methods-this-context': array_methods_this_context_1.arrayMethodsThisContext,
        'class-methods-read-top-to-bottom': class_methods_read_top_to_bottom_1.classMethodsReadTopToBottom,
        'dynamic-https-errors': dynamic_https_errors_1.dynamicHttpsErrors,
        'export-if-in-doubt': export_if_in_doubt_1.exportIfInDoubt,
        'extract-global-constants': extract_global_constants_1.extractGlobalConstants,
        'generic-starts-with-t': generic_starts_with_t_1.genericStartsWithT,
        'no-async-array-filter': no_async_array_filter_1.noAsyncArrayFilter,
        'no-async-foreach': no_async_foreach_1.noAsyncForEach,
        'no-conditional-literals-in-jsx': no_conditional_literals_in_jsx_1.noConditionalLiteralsInJsx,
        'no-filter-without-return': no_filter_without_return_1.noFilterWithoutReturn,
        'no-misused-switch-case': no_misused_switch_case_1.noMisusedSwitchCase,
        'no-unpinned-dependencies': no_unpinned_dependencies_1.noUnpinnedDependencies,
        'no-useless-fragment': no_useless_fragment_1.noUselessFragment,
        'prefer-fragment-shorthand': prefer_fragment_shorthand_1.preferFragmentShorthand,
        'prefer-type-over-interface': prefer_type_over_interface_1.preferTypeOverInterface,
        'require-memo': require_memo_1.requireMemo,
    },
};
//# sourceMappingURL=index.js.map