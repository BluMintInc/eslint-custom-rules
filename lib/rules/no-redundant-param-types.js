"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noRedundantParamTypes = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
function isIdentifierWithTypeAnnotation(node) {
    return (node.type === utils_1.AST_NODE_TYPES.Identifier && node.typeAnnotation !== undefined);
}
function isRestElementWithTypeAnnotation(node) {
    return (node.type === utils_1.AST_NODE_TYPES.RestElement &&
        node.typeAnnotation !== undefined);
}
function isObjectPatternWithTypeAnnotation(node) {
    return (node.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
        node.typeAnnotation !== undefined);
}
function isArrayPatternWithTypeAnnotation(node) {
    return (node.type === utils_1.AST_NODE_TYPES.ArrayPattern &&
        node.typeAnnotation !== undefined);
}
function isAssignmentPatternWithTypeAnnotation(node) {
    return (node.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
        node.left.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.left.typeAnnotation !== undefined);
}
function removeTypeAnnotation(fixer, typeAnnotation, sourceCode) {
    const typeStart = typeAnnotation.range[0];
    const typeEnd = typeAnnotation.range[1];
    // Check if there's a question mark before the type annotation
    const hasQuestionMark = typeStart > 0 && sourceCode.getText().charAt(typeStart - 1) === '?';
    const startPos = hasQuestionMark ? typeStart - 1 : typeStart;
    return fixer.removeRange([startPos, typeEnd]);
}
function hasRedundantTypeAnnotation(node) {
    const parent = node.parent;
    if (!parent)
        return false;
    // Check variable declarations
    if (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
        parent.id.typeAnnotation?.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
        return true;
    }
    // Check class property assignments
    if (parent.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
        parent.typeAnnotation?.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
        return true;
    }
    // Check assignments
    if (parent.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
        parent.left.type === utils_1.AST_NODE_TYPES.Identifier &&
        parent.left.typeAnnotation?.type === utils_1.AST_NODE_TYPES.TSTypeAnnotation) {
        return true;
    }
    return false;
}
exports.noRedundantParamTypes = (0, createRule_1.createRule)({
    name: 'no-redundant-param-types',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow redundant parameter type annotations',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            redundantParamType: 'Parameter type annotation is redundant',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ArrowFunctionExpression(node) {
                if (!hasRedundantTypeAnnotation(node))
                    return;
                const params = node.params;
                params.forEach((param) => {
                    if (isIdentifierWithTypeAnnotation(param)) {
                        context.report({
                            node: param,
                            messageId: 'redundantParamType',
                            fix(fixer) {
                                return removeTypeAnnotation(fixer, param.typeAnnotation, context.getSourceCode());
                            },
                        });
                    }
                    else if (isRestElementWithTypeAnnotation(param)) {
                        context.report({
                            node: param,
                            messageId: 'redundantParamType',
                            fix(fixer) {
                                return removeTypeAnnotation(fixer, param.typeAnnotation, context.getSourceCode());
                            },
                        });
                    }
                    else if (isObjectPatternWithTypeAnnotation(param)) {
                        context.report({
                            node: param,
                            messageId: 'redundantParamType',
                            fix(fixer) {
                                return removeTypeAnnotation(fixer, param.typeAnnotation, context.getSourceCode());
                            },
                        });
                    }
                    else if (isArrayPatternWithTypeAnnotation(param)) {
                        context.report({
                            node: param,
                            messageId: 'redundantParamType',
                            fix(fixer) {
                                return removeTypeAnnotation(fixer, param.typeAnnotation, context.getSourceCode());
                            },
                        });
                    }
                    else if (isAssignmentPatternWithTypeAnnotation(param)) {
                        const { left } = param;
                        context.report({
                            node: param,
                            messageId: 'redundantParamType',
                            fix(fixer) {
                                return removeTypeAnnotation(fixer, left.typeAnnotation, context.getSourceCode());
                            },
                        });
                    }
                });
            },
        };
    },
});
//# sourceMappingURL=no-redundant-param-types.js.map