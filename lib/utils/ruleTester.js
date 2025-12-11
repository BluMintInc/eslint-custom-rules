"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ruleTesterJson = exports.ruleTesterJsx = exports.ruleTesterTs = void 0;
const utils_1 = require("@typescript-eslint/utils");
const eslint_1 = require("eslint");
exports.ruleTesterTs = new utils_1.ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
});
exports.ruleTesterJsx = new utils_1.ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaFeatures: {
            jsx: true,
        },
    },
});
exports.ruleTesterJson = new eslint_1.RuleTester({
    parser: require.resolve('jsonc-eslint-parser'),
    parserOptions: {
        ecmaVersion: 2020,
    },
});
//# sourceMappingURL=ruleTester.js.map