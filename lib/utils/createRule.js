"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRule = void 0;
const utils_1 = require("@typescript-eslint/utils");
exports.createRule = utils_1.ESLintUtils.RuleCreator((name) => `https://github.com/BluMintInc/eslint-custom-rules/plugin/docs/rules/${name}.md`);
//# sourceMappingURL=createRule.js.map