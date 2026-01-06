"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceEmptyObjectCheck = void 0;
const utils_1 = require("@typescript-eslint/utils");
const ts = __importStar(require("typescript"));
const createRule_1 = require("../utils/createRule");
const DEFAULT_OBJECT_SUFFIXES = [
    'Config',
    'Configs',
    'Data',
    'Info',
    'Settings',
    'Options',
    'Props',
    'State',
    'Response',
    'Result',
    'Payload',
    'Map',
    'Record',
    'Object',
    'Obj',
    'Details',
    'Meta',
    'Profile',
    'Request',
    'Params',
    'Context',
];
const DEFAULT_EMPTY_CHECK_FUNCTIONS = ['isEmpty'];
const BOOLEAN_PREFIXES = [
    'is',
    'has',
    'can',
    'should',
    'was',
    'were',
    'will',
    'did',
];
const NON_OBJECT_LIKE_NAMES = [
    'count',
    'index',
    'idx',
    'length',
    'size',
    'total',
    'flag',
    'enabled',
    'ready',
    'items',
    'item',
    'list',
    'lists',
    'array',
    'arr',
];
function hasBooleanPrefixBoundary(name) {
    const lower = name.toLowerCase();
    return BOOLEAN_PREFIXES.some((prefix) => {
        if (!lower.startsWith(prefix)) {
            return false;
        }
        const boundary = name.charAt(prefix.length);
        return boundary !== '' && boundary >= 'A' && boundary <= 'Z';
    });
}
function isLoopLike(node) {
    return (node.type === utils_1.AST_NODE_TYPES.ForStatement ||
        node.type === utils_1.AST_NODE_TYPES.ForInStatement ||
        node.type === utils_1.AST_NODE_TYPES.ForOfStatement ||
        node.type === utils_1.AST_NODE_TYPES.WhileStatement ||
        node.type === utils_1.AST_NODE_TYPES.DoWhileStatement);
}
function isInsideLoop(node) {
    let current = node;
    while (current && current.parent) {
        if (isLoopLike(current.parent)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}
function isObjectLikeName(name, patterns) {
    const lower = name.toLowerCase();
    if (hasBooleanPrefixBoundary(name)) {
        return false;
    }
    if (NON_OBJECT_LIKE_NAMES.includes(lower)) {
        return false;
    }
    for (const pattern of patterns) {
        if (name.endsWith(pattern) || lower.endsWith(pattern.toLowerCase())) {
            return true;
        }
    }
    return false;
}
function isNullableType(type) {
    return ((type.flags & ts.TypeFlags.Null) !== 0 ||
        (type.flags & ts.TypeFlags.Undefined) !== 0 ||
        (type.flags & ts.TypeFlags.Void) !== 0);
}
function isNonObjectPrimitive(type) {
    const flag = type.flags;
    return ((flag & ts.TypeFlags.StringLike) !== 0 ||
        (flag & ts.TypeFlags.NumberLike) !== 0 ||
        (flag & ts.TypeFlags.BooleanLike) !== 0 ||
        (flag & ts.TypeFlags.BigIntLike) !== 0 ||
        (flag & ts.TypeFlags.ESSymbolLike) !== 0 ||
        (flag & ts.TypeFlags.EnumLike) !== 0);
}
function isAnyOrUnknown(type) {
    return ((type.flags & ts.TypeFlags.Any) !== 0 ||
        (type.flags & ts.TypeFlags.Unknown) !== 0);
}
function hasRequiredProperties(type, checker) {
    const properties = checker.getPropertiesOfType(type);
    return properties.some((property) => (property.getFlags() & ts.SymbolFlags.Optional) === 0);
}
function isObjectLikeType(type, checker) {
    if (type.isUnion()) {
        let hasObject = false;
        let hasUnknown = false;
        let hasNonObject = false;
        let hasNonNullable = false;
        for (const part of type.types) {
            if (isNullableType(part)) {
                continue;
            }
            hasNonNullable = true;
            if (isNonObjectPrimitive(part)) {
                hasNonObject = true;
                continue;
            }
            const analysis = isObjectLikeType(part, checker);
            if (analysis === 'object') {
                hasObject = true;
            }
            else if (analysis === 'unknown') {
                hasUnknown = true;
            }
            else {
                hasNonObject = true;
            }
        }
        if (hasObject) {
            return 'object';
        }
        if (!hasNonNullable) {
            return 'non-object';
        }
        if (hasUnknown) {
            return 'unknown';
        }
        return hasNonObject ? 'non-object' : 'unknown';
    }
    if ((type.flags & ts.TypeFlags.Intersection) !== 0) {
        const intersectionType = type;
        let hasObject = false;
        let hasUnknown = false;
        for (const part of intersectionType.types) {
            const analysis = isObjectLikeType(part, checker);
            if (analysis === 'non-object') {
                return 'non-object';
            }
            if (analysis === 'object') {
                hasObject = true;
            }
            else {
                hasUnknown = true;
            }
        }
        if (hasObject) {
            return 'object';
        }
        return hasUnknown ? 'unknown' : 'non-object';
    }
    if (isAnyOrUnknown(type)) {
        return 'unknown';
    }
    if (isNonObjectPrimitive(type) || isNullableType(type)) {
        return 'non-object';
    }
    if ((type.flags & ts.TypeFlags.Object) === 0) {
        return 'non-object';
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
        return 'non-object';
    }
    if (type.getCallSignatures().length > 0) {
        return 'non-object';
    }
    if (hasRequiredProperties(type, checker)) {
        return 'non-object';
    }
    return 'object';
}
function isObjectKeysLengthExpression(node, name) {
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !node.computed &&
        node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.property.name === 'length' &&
        node.object.type === utils_1.AST_NODE_TYPES.CallExpression &&
        node.object.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !node.object.callee.computed &&
        node.object.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.object.callee.object.name === 'Object' &&
        node.object.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        node.object.callee.property.name === 'keys' &&
        node.object.arguments.length === 1 &&
        node.object.arguments[0].type === utils_1.AST_NODE_TYPES.Identifier &&
        node.object.arguments[0].name === name) {
        return true;
    }
    return false;
}
function isZeroLiteral(node) {
    return node.type === utils_1.AST_NODE_TYPES.Literal && node.value === 0;
}
function isLengthZeroComparison(node, name) {
    const { operator, left, right } = node;
    const leftIsLength = isObjectKeysLengthExpression(left, name);
    const rightIsLength = isObjectKeysLengthExpression(right, name);
    const leftIsZero = isZeroLiteral(left);
    const rightIsZero = isZeroLiteral(right);
    /**
     * Only zero-length checks signal emptiness: length never drops below zero, and
     * `> 0` means data is present. Restrict operators to equality and zero-bound
     * comparisons to avoid mistaking impossible `length < 0` or presence checks for
     * valid emptiness guards.
     */
    if (operator === '===' || operator === '==') {
        return (leftIsLength && rightIsZero) || (rightIsLength && leftIsZero);
    }
    if (operator === '<=') {
        return leftIsLength && rightIsZero;
    }
    if (operator === '>=') {
        return leftIsZero && rightIsLength;
    }
    return false;
}
function conditionHasEmptyCheck(node, name, emptyCheckFunctions, negationDepth = 0) {
    if (!node)
        return false;
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return (conditionHasEmptyCheck(node.left, name, emptyCheckFunctions, negationDepth) ||
                conditionHasEmptyCheck(node.right, name, emptyCheckFunctions, negationDepth));
        case utils_1.AST_NODE_TYPES.BinaryExpression:
            if (isLengthZeroComparison(node, name)) {
                return negationDepth % 2 === 0;
            }
            return (conditionHasEmptyCheck(node.left, name, emptyCheckFunctions, negationDepth) ||
                conditionHasEmptyCheck(node.right, name, emptyCheckFunctions, negationDepth));
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            if (node.operator === '!') {
                return conditionHasEmptyCheck(node.argument, name, emptyCheckFunctions, negationDepth + 1);
            }
            return conditionHasEmptyCheck(node.argument, name, emptyCheckFunctions, negationDepth);
        case utils_1.AST_NODE_TYPES.CallExpression: {
            const callee = node.callee;
            const firstArgIsTarget = node.arguments[0] &&
                node.arguments[0].type === utils_1.AST_NODE_TYPES.Identifier &&
                node.arguments[0].name === name;
            if (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                emptyCheckFunctions.has(callee.name) &&
                firstArgIsTarget) {
                return negationDepth % 2 === 0;
            }
            if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                !callee.computed &&
                callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                emptyCheckFunctions.has(callee.property.name) &&
                firstArgIsTarget) {
                return negationDepth % 2 === 0;
            }
            return (conditionHasEmptyCheck(callee, name, emptyCheckFunctions, negationDepth) ||
                node.arguments.some((argument) => conditionHasEmptyCheck(argument, name, emptyCheckFunctions, negationDepth)));
        }
        case utils_1.AST_NODE_TYPES.MemberExpression:
            /**
             * `!Object.keys(name).length` counts as an emptiness check through negation
             * depth; comparisons like `length < 0` or `length > 0` remain excluded because
             * length is never negative and `> 0` signals presence rather than emptiness.
             */
            if (isObjectKeysLengthExpression(node, name)) {
                return negationDepth % 2 === 1;
            }
            return conditionHasEmptyCheck(node.object, name, emptyCheckFunctions, negationDepth);
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return (conditionHasEmptyCheck(node.test, name, emptyCheckFunctions, negationDepth) ||
                conditionHasEmptyCheck(node.consequent, name, emptyCheckFunctions, negationDepth) ||
                conditionHasEmptyCheck(node.alternate, name, emptyCheckFunctions, negationDepth));
        default:
            return false;
    }
}
function collectNegations(node, results) {
    if (node.type === utils_1.AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
        results.push(node);
    }
    else if (node.type === utils_1.AST_NODE_TYPES.LogicalExpression) {
        collectNegations(node.left, results);
        collectNegations(node.right, results);
    }
    else if (node.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
        collectNegations(node.test, results);
        collectNegations(node.consequent, results);
        collectNegations(node.alternate, results);
    }
}
function getRootCondition(node) {
    let current = node;
    while (current && current.parent) {
        const parent = current.parent;
        if ((parent.type === utils_1.AST_NODE_TYPES.IfStatement && parent.test === current) ||
            (parent.type === utils_1.AST_NODE_TYPES.WhileStatement &&
                parent.test === current) ||
            (parent.type === utils_1.AST_NODE_TYPES.DoWhileStatement &&
                parent.test === current) ||
            (parent.type === utils_1.AST_NODE_TYPES.ForStatement &&
                parent.test === current) ||
            (parent.type === utils_1.AST_NODE_TYPES.ConditionalExpression &&
                parent.test === current)) {
            return current;
        }
        if (parent.type === utils_1.AST_NODE_TYPES.LogicalExpression ||
            parent.type === utils_1.AST_NODE_TYPES.BinaryExpression ||
            parent.type === utils_1.AST_NODE_TYPES.UnaryExpression ||
            parent.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
            current = parent;
            continue;
        }
        break;
    }
    return null;
}
exports.enforceEmptyObjectCheck = (0, createRule_1.createRule)({
    name: 'enforce-empty-object-check',
    meta: {
        type: 'problem',
        docs: {
            description: 'Ensure object existence checks also guard against empty objects so that empty payloads are treated like missing data.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    objectNamePattern: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    ignoreInLoops: {
                        type: 'boolean',
                    },
                    emptyCheckFunctions: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            missingEmptyObjectCheck: 'What\'s wrong: "{{name}}" is only checked for falsiness, so `{}` passes the guard. Why it matters: empty payloads or configs behave like missing data and can execute "has data" logic incorrectly. How to fix: also check emptiness (for example, Object.keys({{name}}).length === 0 or a configured empty-check helper).',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const sourceCode = context.getSourceCode();
        const parserServices = sourceCode.parserServices;
        const checker = parserServices?.program?.getTypeChecker();
        const options = context.options[0] ?? {};
        const { objectNamePattern = [], ignoreInLoops = false, emptyCheckFunctions = [], } = options;
        const patternSet = new Set([
            ...DEFAULT_OBJECT_SUFFIXES,
            ...objectNamePattern,
        ]);
        const emptyCheckFunctionsSet = new Set([
            ...DEFAULT_EMPTY_CHECK_FUNCTIONS,
            ...emptyCheckFunctions,
        ]);
        const processedExpressions = new WeakSet();
        const processedNegations = new WeakSet();
        function isLikelyObject(identifier) {
            if (checker && parserServices?.esTreeNodeToTSNodeMap) {
                try {
                    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(identifier);
                    const type = checker.getTypeAtLocation(tsNode);
                    const analysis = isObjectLikeType(type, checker);
                    if (analysis === 'object') {
                        return true;
                    }
                    if (analysis === 'non-object') {
                        return false;
                    }
                }
                catch {
                    // TypeScript parser services can throw when AST-to-TS node mapping fails; fall back to naming heuristic so linting does not crash.
                }
            }
            return isObjectLikeName(identifier.name, patternSet);
        }
        function reportNegation(node, identifier) {
            if (processedNegations.has(node)) {
                return;
            }
            processedNegations.add(node);
            if (ignoreInLoops && isInsideLoop(node)) {
                return;
            }
            const conditionRoot = getRootCondition(node);
            if (conditionRoot &&
                conditionHasEmptyCheck(conditionRoot, identifier.name, emptyCheckFunctionsSet)) {
                return;
            }
            if (!isLikelyObject(identifier)) {
                return;
            }
            context.report({
                node,
                messageId: 'missingEmptyObjectCheck',
                data: {
                    name: identifier.name,
                },
                fix(fixer) {
                    const identifierText = sourceCode.getText(identifier);
                    const replacement = `(${node.operator}${identifierText} || Object.keys(${identifierText}).length === 0)`;
                    return fixer.replaceText(node, replacement);
                },
            });
        }
        function handleTestExpression(expression) {
            if (processedExpressions.has(expression)) {
                return;
            }
            processedExpressions.add(expression);
            const negations = [];
            collectNegations(expression, negations);
            for (const negation of negations) {
                if (negation.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                    negation.operator === '!') {
                    reportNegation(negation, negation.argument);
                }
            }
        }
        return {
            IfStatement(node) {
                if (node.test) {
                    handleTestExpression(node.test);
                }
            },
            WhileStatement(node) {
                if (node.test) {
                    handleTestExpression(node.test);
                }
            },
            DoWhileStatement(node) {
                if (node.test) {
                    handleTestExpression(node.test);
                }
            },
            ForStatement(node) {
                if (node.test) {
                    handleTestExpression(node.test);
                }
            },
            ConditionalExpression(node) {
                handleTestExpression(node.test);
            },
        };
    },
});
//# sourceMappingURL=enforce-empty-object-check.js.map