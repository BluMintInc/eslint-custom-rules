import { arrayMethodsThisContext } from "./rules/array-methods-this-context";
import { genericStartsWithT } from "./rules/generic-starts-with-t";
import { noAsyncArrayFilter } from "./rules/no-async-array-filter";
import { noFilterWithoutReturn } from "./rules/no-filter-without-return";
import { noUnpinnedDependencies } from "./rules/no-unpinned-dependencies";
import { preferFragmentShorthand } from "./rules/prefer-fragment-shorthand";
import { preferTypeOverInterface } from "./rules/prefer-type-over-interface";

module.exports = {
    meta: {
        name: 'eslint-plugin-blumint',
        version: '0.0.1',
    },
    parseOptions: {
        ecmaVersion: 2020,
    },
    rules: {
        'array-methods-this-context': arrayMethodsThisContext,
        'generic-starts-with-t': genericStartsWithT,
        'no-async-array-filter': noAsyncArrayFilter,
        'no-filter-without-return': noFilterWithoutReturn,
        'no-unpinned-dependencies': noUnpinnedDependencies,
        'prefer-fragment-shorthand': preferFragmentShorthand,
        'prefer-type-over-interface': preferTypeOverInterface,
    },

};
