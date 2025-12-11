"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferNullishCoalescingBooleanProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const BOOLEAN_PROP_REGEX = /^(is|has|should|can|will|do|does|did|was|were|enable|disable)/;
function isInJSXBooleanAttribute(node) {
    const parent = node.parent;
    if (parent?.type !== utils_1.AST_NODE_TYPES.JSXAttribute)
        return false;
    const attributeName = parent.name.name;
    const booleanPropNames = [
        'disabled',
        'required',
        'checked',
        'selected',
        'readOnly',
        'autoFocus',
        'autoPlay',
        'controls',
        'default',
        'defer',
        'hidden',
        'isOpen',
        'loop',
        'multiple',
        'muted',
        'noValidate',
        'open',
        'scoped',
        'seamless',
        'itemScope',
        'allowFullScreen',
        'async',
        'autofocus',
        'autoplay',
        'formNoValidate',
        'spellcheck',
        'translate',
    ];
    return (typeof attributeName === 'string' &&
        (booleanPropNames.includes(attributeName) ||
            BOOLEAN_PROP_REGEX.test(attributeName)));
}
function isInConditionalContext(node) {
    const parent = node.parent;
    if (!parent)
        return false;
    return ((parent.type === utils_1.AST_NODE_TYPES.IfStatement && node === parent.test) ||
        (parent.type === utils_1.AST_NODE_TYPES.ConditionalExpression &&
            node === parent.test) ||
        (parent.type === utils_1.AST_NODE_TYPES.WhileStatement && node === parent.test) ||
        (parent.type === utils_1.AST_NODE_TYPES.ForStatement && node === parent.test) ||
        (parent.type === utils_1.AST_NODE_TYPES.DoWhileStatement && node === parent.test) ||
        (parent.type === utils_1.AST_NODE_TYPES.SwitchCase && node === parent.test));
}
/**
 * Determines if a node is within a boolean context in JSX props or other boolean contexts
 */
function isInBooleanContext(node) {
    let current = node;
    // Traverse up the AST to find if we're in a boolean context
    while (current && current.parent) {
        if (isInJSXBooleanAttribute(current))
            return true;
        if (isInConditionalContext(current))
            return true;
        // If we're in a logical expression that's part of a boolean context
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            (current.parent.operator === '&&' || current.parent.operator === '||')) {
            // Continue up the tree to check if the parent logical expression is in a boolean context
            current = current.parent;
            continue;
        }
        // If we're in a unary expression with a boolean operator
        if (current.parent.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
            current.parent.operator === '!') {
            return true;
        }
        // If we're in a conditional expression (ternary)
        if (current.parent.type === utils_1.AST_NODE_TYPES.ConditionalExpression &&
            current === current.parent.test) {
            return true;
        }
        // If we're in a variable declaration that has a boolean-like name
        if (current.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
            current.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
            const variableName = current.parent.id.name;
            if (/^(is|has|should|can|will|do|does|did|was|were)/.test(variableName)) {
                return true;
            }
        }
        // If we're in a while loop condition
        if (current.parent.type === utils_1.AST_NODE_TYPES.WhileStatement &&
            current === current.parent.test) {
            return true;
        }
        // If we're in a for loop condition
        if (current.parent.type === utils_1.AST_NODE_TYPES.ForStatement &&
            current === current.parent.test) {
            return true;
        }
        // If we're in a do-while loop condition
        if (current.parent.type === utils_1.AST_NODE_TYPES.DoWhileStatement &&
            current === current.parent.test) {
            return true;
        }
        // If we're in a function return statement with a boolean-like function name
        if (current.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
            // Find the function that contains this return statement
            let functionNode = current.parent.parent;
            let functionName = '';
            // Handle different function types
            if (functionNode &&
                functionNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                functionNode.id) {
                functionName = functionNode.id.name;
            }
            else if (functionNode &&
                functionNode.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                // For function expressions, check the parent context
                if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    functionNode.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.id.name;
                }
                else if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.Property &&
                    functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.key.name;
                }
                else if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                    functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.key.name;
                }
            }
            else if (functionNode &&
                functionNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                // For arrow functions, check the parent context
                if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    functionNode.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.id.name;
                }
                else if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.Property &&
                    functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.key.name;
                }
                else if (functionNode.parent &&
                    functionNode.parent.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                    functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    functionName = functionNode.parent.key.name;
                }
            }
            else if (functionNode &&
                functionNode.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                // Handle case where return is in a block statement
                functionNode = functionNode.parent;
                if (functionNode &&
                    functionNode.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
                    functionNode.id) {
                    functionName = functionNode.id.name;
                }
                else if (functionNode &&
                    functionNode.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        functionNode.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.id.name;
                    }
                    else if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.Property &&
                        functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.key.name;
                    }
                    else if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                        functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.key.name;
                    }
                }
                else if (functionNode &&
                    functionNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        functionNode.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.id.name;
                    }
                    else if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.Property &&
                        functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.key.name;
                    }
                    else if (functionNode.parent &&
                        functionNode.parent.type === utils_1.AST_NODE_TYPES.MethodDefinition &&
                        functionNode.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                        functionName = functionNode.parent.key.name;
                    }
                }
            }
            if (functionName &&
                /^(is|has|should|can|will|do|does|did|was|were|check|validate)/.test(functionName)) {
                return true;
            }
        }
        // If we're directly in an arrow function body (without explicit return) with boolean-like name
        if (current.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
            let functionName = '';
            if (current.parent.parent &&
                current.parent.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                current.parent.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                functionName = current.parent.parent.id.name;
            }
            else if (current.parent.parent &&
                current.parent.parent.type === utils_1.AST_NODE_TYPES.Property &&
                current.parent.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                functionName = current.parent.parent.key.name;
            }
            if (functionName &&
                /^(is|has|should|can|will|do|does|did|was|were|check|validate)/.test(functionName)) {
                return true;
            }
        }
        // If we're in a conditional rendering context (JSX && operator)
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.operator === '&&' &&
            current.parent.parent &&
            (current.parent.parent.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer ||
                current.parent.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement)) {
            return true;
        }
        // If we're the left side of a && operator that's used for conditional rendering
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.operator === '&&' &&
            current === current.parent.left &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
            return true;
        }
        // If we're in a logical expression that will be used for conditional rendering
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.operator === '&&' &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            current.parent.right &&
            current.parent.right.type === utils_1.AST_NODE_TYPES.JSXElement) {
            return true;
        }
        // If we're inside parentheses that are the left side of a && operator for conditional rendering
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.parent.operator === '&&' &&
            current.parent.parent.parent &&
            current.parent.parent.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            current.parent.parent.right &&
            current.parent.parent.right.type === utils_1.AST_NODE_TYPES.JSXElement) {
            return true;
        }
        // Check if we're in a logical expression that's eventually used for conditional rendering
        let tempParent = current.parent;
        while (tempParent) {
            if (tempParent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
                tempParent.operator === '&&' &&
                tempParent.right &&
                tempParent.right.type === utils_1.AST_NODE_TYPES.JSXElement) {
                return true;
            }
            tempParent = tempParent.parent;
        }
        // If we're in a switch case
        if (current.parent.type === utils_1.AST_NODE_TYPES.SwitchCase &&
            current === current.parent.test) {
            return true;
        }
        // If we're in array method callbacks that expect boolean returns
        if (current.parent.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
            current.parent.parent.parent &&
            current.parent.parent.parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
            current.parent.parent.parent.callee.type ===
                utils_1.AST_NODE_TYPES.MemberExpression &&
            current.parent.parent.parent.callee.property.type ===
                utils_1.AST_NODE_TYPES.Identifier) {
            const methodName = current.parent.parent.parent.callee.property.name;
            if (['filter', 'some', 'every', 'find', 'findIndex'].includes(methodName)) {
                return true;
            }
        }
        // If we're directly in array method callbacks (arrow function body without return)
        if (current.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
            current.parent.parent.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            current.parent.parent.callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
            const methodName = current.parent.parent.callee.property.name;
            if (['filter', 'some', 'every', 'find', 'findIndex'].includes(methodName)) {
                return true;
            }
        }
        // If we're in an object property with a boolean-like name
        if (current.parent.type === utils_1.AST_NODE_TYPES.Property &&
            current.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
            const propertyName = current.parent.key.name;
            if (/^(is|has|should|can|will|do|does|did|was|were|enable|disable|validate)/.test(propertyName)) {
                return true;
            }
        }
        // If we're in destructuring assignment with boolean-like name
        if (current.parent.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.Property &&
            current.parent.parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
            const propertyName = current.parent.parent.key.name;
            if (/^(is|has|should|can|will|do|does|did|was|were)/.test(propertyName)) {
                return true;
            }
        }
        // If we're in a function call argument for useState with boolean-like variable name
        if (current.parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
            current.parent.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
            current.parent.callee.name === 'useState' &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
            current.parent.parent.id.type === utils_1.AST_NODE_TYPES.ArrayPattern &&
            current.parent.parent.id.elements.length > 0 &&
            current.parent.parent.id.elements[0] &&
            current.parent.parent.id.elements[0].type === utils_1.AST_NODE_TYPES.Identifier) {
            const variableName = current.parent.parent.id.elements[0].name;
            if (/^(is|has|should|can|will|do|does|did|was|were|ready|valid|loading|error|complete|active|enabled|disabled|visible|hidden)/.test(variableName)) {
                return true;
            }
        }
        // If we're in an event handler (arrow function in JSX prop)
        if (current.parent.type === utils_1.AST_NODE_TYPES.LogicalExpression &&
            current.parent.operator === '&&' &&
            current.parent.parent &&
            current.parent.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
            current.parent.parent.parent &&
            current.parent.parent.parent.type ===
                utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
            current.parent.parent.parent.parent &&
            current.parent.parent.parent.parent.type === utils_1.AST_NODE_TYPES.JSXAttribute) {
            return true;
        }
        // If we're in a logical expression inside an arrow function that's in a JSX attribute
        let tempCurrent = current.parent;
        while (tempCurrent) {
            if (tempCurrent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                tempCurrent.parent &&
                tempCurrent.parent.type === utils_1.AST_NODE_TYPES.JSXExpressionContainer &&
                tempCurrent.parent.parent &&
                tempCurrent.parent.parent.type === utils_1.AST_NODE_TYPES.JSXAttribute) {
                return true;
            }
            tempCurrent = tempCurrent.parent;
        }
        current = current.parent;
    }
    return false;
}
/**
 * Checks if the left operand could be nullish (null or undefined)
 */
function couldBeNullish(node) {
    // For literals, check the actual value
    if (node.type === utils_1.AST_NODE_TYPES.Literal) {
        return node.value === null || node.value === undefined;
    }
    if (node.type === utils_1.AST_NODE_TYPES.Identifier && node.name === 'undefined') {
        return true;
    }
    if (node.type === utils_1.AST_NODE_TYPES.NewExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrayExpression ||
        node.type === utils_1.AST_NODE_TYPES.ObjectExpression ||
        node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ClassExpression ||
        (node.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
            node.expressions.length === 0)) {
        return false;
    }
    // For other expressions, conservatively assume they could be nullish
    return true;
}
exports.preferNullishCoalescingBooleanProps = (0, createRule_1.createRule)({
    name: 'prefer-nullish-coalescing-boolean-props',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts',
            recommended: 'error',
        },
        fixable: 'code',
        messages: {
            preferNullishCoalescing: 'Prefer using nullish coalescing operator (??) instead of logical OR operator (||) when checking for null/undefined',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            LogicalExpression(node) {
                if (node.operator === '||') {
                    // If the node is in a boolean context, we allow logical OR
                    if (isInBooleanContext(node)) {
                        return;
                    }
                    // Check if this could benefit from nullish coalescing
                    // We only suggest nullish coalescing when the left operand could be nullish
                    if (couldBeNullish(node.left)) {
                        context.report({
                            node,
                            messageId: 'preferNullishCoalescing',
                            fix(fixer) {
                                return fixer.replaceText(node, `${context.getSourceCode().getText(node.left)} ?? ${context
                                    .getSourceCode()
                                    .getText(node.right)}`);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-nullish-coalescing-boolean-props.js.map