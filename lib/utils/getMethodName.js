"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemberExpressionName = exports.getPropertyName = exports.getMethodName = void 0;
const utils_1 = require("@typescript-eslint/utils");
const getKeyName = (key, sourceCode, { privateIdentifierPrefix = '', computedFallbackToText = true, }) => {
    if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
        return key.name;
    }
    if (key.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
        if (privateIdentifierPrefix === null) {
            return key.name;
        }
        return `${privateIdentifierPrefix}${key.name}`;
    }
    if (key.type === utils_1.AST_NODE_TYPES.Literal) {
        if (key.value === null || key.value === undefined) {
            return '';
        }
        return String(key.value);
    }
    return computedFallbackToText ? sourceCode.getText(key) : '';
};
const getMethodName = (method, sourceCode, options = {}) => {
    return getKeyName(method.key, sourceCode, options);
};
exports.getMethodName = getMethodName;
const getPropertyName = (key, sourceCode, options = {}) => {
    return getKeyName(key, sourceCode, options);
};
exports.getPropertyName = getPropertyName;
const getMemberExpressionName = (member, sourceCode, options = {}) => {
    return getKeyName(member.property, sourceCode, options);
};
exports.getMemberExpressionName = getMemberExpressionName;
//# sourceMappingURL=getMethodName.js.map