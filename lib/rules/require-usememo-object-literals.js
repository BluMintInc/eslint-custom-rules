"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUseMemoObjectLiterals = void 0;
const createRule_1 = require("../utils/createRule");
exports.requireUseMemoObjectLiterals = (0, createRule_1.createRule)({
    name: 'require-usememo-object-literals',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using useMemo for inline object literals passed as props to JSX components',
            recommended: 'error',
        },
        messages: {
            requireUseMemo: 'Inline object/array literals in JSX props should be wrapped in useMemo to prevent unnecessary re-renders',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            JSXAttribute(node) {
                // Skip if the value is not an expression
                if (!node.value || node.value.type !== 'JSXExpressionContainer') {
                    return;
                }
                const { expression } = node.value;
                // Check if the expression is an object or array literal
                if ((expression.type === 'ObjectExpression' ||
                    expression.type === 'ArrayExpression') &&
                    // Ensure we're in a function component context
                    context
                        .getAncestors()
                        .some((ancestor) => ancestor.type === 'FunctionDeclaration' ||
                        ancestor.type === 'ArrowFunctionExpression' ||
                        ancestor.type === 'FunctionExpression')) {
                    // Check if the parent component name starts with an uppercase letter
                    // to ensure it's a React component
                    const jsxElement = node.parent;
                    const elementName = jsxElement.name.type === 'JSXIdentifier'
                        ? jsxElement.name.name
                        : '';
                    if (elementName && /^[A-Z]/.test(elementName)) {
                        context.report({
                            node: expression,
                            messageId: 'requireUseMemo',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=require-usememo-object-literals.js.map