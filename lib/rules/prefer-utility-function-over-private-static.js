"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferUtilityFunctionOverPrivateStatic = void 0;
const createRule_1 = require("../utils/createRule");
const getMethodName_1 = require("../utils/getMethodName");
exports.preferUtilityFunctionOverPrivateStatic = (0, createRule_1.createRule)({
    name: 'prefer-utility-function-over-private-static',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce abstraction of private static methods into utility functions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            preferUtilityFunctionOverPrivateStatic: 'Private static method "{{methodName}}" in class "{{className}}" does not use class state. Keeping class-agnostic helpers as private statics hides reusable logic and signals coupling that is not present. Extract this logic into a standalone utility function (module-level or shared) and import it where needed so it can be reused and unit tested independently.',
        },
    },
    defaultOptions: [],
    create(context) {
        // Helper function to check if a node contains 'this' references
        const hasThisReference = (node) => {
            if (!node)
                return false;
            // If this is a ThisExpression, we found a reference
            if (node.type === 'ThisExpression') {
                return true;
            }
            // Check all child properties that are objects or arrays
            for (const key in node) {
                const child = node[key];
                // Skip non-object properties and special properties
                if (!child || typeof child !== 'object' || key === 'parent') {
                    continue;
                }
                // If it's an array, check each element
                if (Array.isArray(child)) {
                    for (const item of child) {
                        if (item && typeof item === 'object' && hasThisReference(item)) {
                            return true;
                        }
                    }
                }
                else if (hasThisReference(child)) {
                    // If it's an object, recursively check it
                    return true;
                }
            }
            return false;
        };
        const getClassName = (method) => {
            const classNode = method.parent?.parent;
            if (classNode &&
                (classNode.type === 'ClassDeclaration' ||
                    classNode.type === 'ClassExpression')) {
                if (classNode.id && classNode.id.type === 'Identifier') {
                    return classNode.id.name;
                }
                if (classNode.type === 'ClassExpression' &&
                    classNode.parent &&
                    classNode.parent.type === 'VariableDeclarator' &&
                    classNode.parent.id.type === 'Identifier') {
                    return classNode.parent.id.name;
                }
                if (classNode.type === 'ClassExpression' &&
                    classNode.parent &&
                    classNode.parent.type === 'AssignmentExpression' &&
                    classNode.parent.left.type === 'Identifier') {
                    return classNode.parent.left.name;
                }
            }
            return 'this class';
        };
        return {
            'MethodDefinition[static=true][accessibility="private"]'(node) {
                const sourceCode = context.sourceCode;
                const methodBody = node.value.body;
                if (!methodBody) {
                    return;
                }
                // Get the method body text to check size
                const bodyText = sourceCode.getText(methodBody);
                const lineCount = bodyText.split('\n').length;
                // Skip small methods (less than 4 lines including braces)
                if (lineCount < 4) {
                    return;
                }
                // Check if the method uses 'this' keyword by traversing the AST
                const usesThis = hasThisReference(methodBody);
                // If the method doesn't use 'this', it's a good candidate for extraction
                if (!usesThis) {
                    const methodName = (0, getMethodName_1.getMethodName)(node, sourceCode, {
                        computedFallbackToText: false,
                    }) || '<unknown>';
                    const className = getClassName(node);
                    context.report({
                        node,
                        messageId: 'preferUtilityFunctionOverPrivateStatic',
                        data: {
                            methodName,
                            className,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-utility-function-over-private-static.js.map