"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeObjectBooleanConditions = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);
function isHookCall(node) {
    const callee = node.callee;
    return ((callee.type === utils_1.AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)) ||
        (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            !callee.computed &&
            callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
            callee.object.name === 'React' &&
            callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            HOOK_NAMES.has(callee.property.name)));
}
function generateBooleanVariableName(objectName, conditionType, isNegated) {
    const base = capitalize(objectName);
    if (conditionType === 'existence') {
        return isNegated ? `is${base}Missing` : `has${base}`;
    }
    if (conditionType === 'keyCount') {
        return isNegated ? `is${base}Empty` : `has${base}`;
    }
    // complex: default to hasX to avoid over-guessing semantics
    return `has${base}`;
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function isObjectExistenceCheck(node) {
    // Check for patterns like !obj
    if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression) {
        // !obj
        if (node.operator === '!' && node.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
            return true;
        }
        // !!obj
        if (node.operator === '!' &&
            node.argument.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
            node.argument.operator === '!' &&
            node.argument.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
            return true;
        }
    }
    return false;
}
function isObjectKeyCountCheck(node) {
    // Check for patterns like Object.keys(obj).length === 0 or Object.keys(obj).length > 0
    if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
        const { left, operator, right } = node;
        // Check if left side is Object.keys(obj).length
        if (left.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            left.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            left.property.name === 'length' &&
            left.object.type === utils_1.AST_NODE_TYPES.CallExpression) {
            const callExpr = left.object;
            if (callExpr.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                callExpr.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                callExpr.callee.object.name === 'Object' &&
                callExpr.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                callExpr.callee.property.name === 'keys' &&
                callExpr.arguments.length === 1 &&
                callExpr.arguments[0].type === utils_1.AST_NODE_TYPES.Identifier) {
                // Check if right side is a number
                if (right.type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof right.value === 'number' &&
                    ['===', '!==', '>', '<', '>=', '<='].includes(operator)) {
                    return true;
                }
            }
        }
    }
    return false;
}
function isComplexBooleanExpression(node) {
    // Check for complex expressions involving objects
    if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        return (containsObjectCondition(node.left) || containsObjectCondition(node.right));
    }
    return false;
}
function containsObjectCondition(node) {
    return (isObjectExistenceCheck(node) ||
        isObjectKeyCountCheck(node) ||
        isComplexBooleanExpression(node));
}
function extractObjectName(node) {
    if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression) {
        if (node.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
            return node.argument.name;
        }
    }
    else if (node.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
        const { left } = node;
        if (left.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            left.object.type === utils_1.AST_NODE_TYPES.CallExpression &&
            left.object.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            left.object.arguments.length === 1 &&
            left.object.arguments[0].type === utils_1.AST_NODE_TYPES.Identifier) {
            return left.object.arguments[0].name;
        }
    }
    else if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        // For complex expressions, try to extract from the first object condition found
        const leftObj = extractObjectName(node.left);
        if (leftObj)
            return leftObj;
        return extractObjectName(node.right);
    }
    return null;
}
function analyzeBooleanCondition(node, context) {
    const sourceCode = context.getSourceCode();
    const expression = sourceCode.getText(node);
    if (isObjectExistenceCheck(node)) {
        const objectName = extractObjectName(node);
        if (objectName) {
            const isNegated = node.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                node.operator === '!' &&
                !(node.argument.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
                    node.argument.operator === '!');
            return {
                type: 'existence',
                objectName,
                expression,
                suggestedName: generateBooleanVariableName(objectName, 'existence', isNegated),
                node,
            };
        }
    }
    else if (isObjectKeyCountCheck(node)) {
        const objectName = extractObjectName(node);
        if (objectName) {
            const isNegated = expression.includes('=== 0') || expression.includes('<= 0');
            return {
                type: 'keyCount',
                objectName,
                expression,
                suggestedName: generateBooleanVariableName(objectName, 'keyCount', isNegated),
                node,
            };
        }
    }
    else if (isComplexBooleanExpression(node)) {
        const objectName = extractObjectName(node);
        if (objectName) {
            return {
                type: 'complex',
                objectName,
                expression,
                suggestedName: generateBooleanVariableName(objectName, 'complex', false),
                node,
            };
        }
    }
    return null;
}
function findBooleanConditionsInDependencies(depsArray, context) {
    const patterns = [];
    for (const element of depsArray.elements) {
        if (!element)
            continue; // Skip holes in array
        const pattern = analyzeBooleanCondition(element, context);
        if (pattern) {
            patterns.push(pattern);
        }
    }
    return patterns;
}
function isAlreadyBooleanVariable(node) {
    // Check if the dependency is already a boolean variable (starts with is, has, can, etc.)
    if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
        const name = node.name;
        const booleanPrefixes = [
            'is',
            'has',
            'can',
            'should',
            'will',
            'was',
            'were',
        ];
        return booleanPrefixes.some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()));
    }
    return false;
}
exports.optimizeObjectBooleanConditions = (0, createRule_1.createRule)({
    name: 'optimize-object-boolean-conditions',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Detects and suggests optimizations for boolean conditions formed over objects in React hook dependencies. Suggests extracting boolean conditions into separate variables to reduce unnecessary re-computations when objects change frequently but the boolean condition changes less frequently.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            extractBooleanCondition: 'Extract boolean condition "{{expression}}" into a separate variable "{{suggestedName}}" to optimize hook re-runs. The condition depends on object "{{objectName}}" which may change frequently, but the boolean result changes less often.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (!isHookCall(node)) {
                    return;
                }
                // Get the dependency array argument (last argument for hooks)
                const depsArg = node.arguments[node.arguments.length - 1];
                if (!depsArg || depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression) {
                    return;
                }
                // Find boolean conditions in dependencies
                const patterns = findBooleanConditionsInDependencies(depsArg, context);
                for (const pattern of patterns) {
                    // Skip if it's already a boolean variable
                    if (isAlreadyBooleanVariable(pattern.node)) {
                        continue;
                    }
                    context.report({
                        node: pattern.node,
                        messageId: 'extractBooleanCondition',
                        data: {
                            expression: pattern.expression,
                            suggestedName: pattern.suggestedName,
                            objectName: pattern.objectName,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=optimize-object-boolean-conditions.js.map