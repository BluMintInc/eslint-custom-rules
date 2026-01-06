"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUselessUsememoPrimitives = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const tsTypeClassifier_1 = require("../utils/tsTypeClassifier");
const DEFAULT_OPTIONS = {
    ignoreCallExpressions: true,
    ignoreSymbol: true,
    tsOnly: false,
};
const NON_DETERMINISTIC_MEMBERS = new Set([
    'Date.now',
    'Math.random',
    'performance.now',
    'crypto.randomUUID',
    'crypto.getRandomValues',
]);
const NON_DETERMINISTIC_CONSTRUCTORS = new Set(['Date']);
const COMPARISON_OPERATORS = new Set([
    '==',
    '===',
    '!=',
    '!==',
    '<',
    '<=',
    '>',
    '>=',
    'instanceof',
    'in',
]);
function isStringLikeWithoutTypes(expr) {
    switch (expr.type) {
        case utils_1.AST_NODE_TYPES.Literal:
            return typeof expr.value === 'string';
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return true;
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            return expr.operator === 'typeof';
        case utils_1.AST_NODE_TYPES.BinaryExpression:
            return (expr.operator === '+' &&
                (isStringLikeWithoutTypes(expr.left) ||
                    isStringLikeWithoutTypes(expr.right)));
        default:
            return false;
    }
}
function isUseMemoCallee(callee) {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === 'useMemo';
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.property.name === 'useMemo';
    }
    return false;
}
function getReturnedExpression(callback) {
    if (callback.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
        return callback.body;
    }
    if (callback.body.body.length !== 1) {
        return null;
    }
    const soleStatement = callback.body.body[0];
    if (soleStatement.type === utils_1.AST_NODE_TYPES.ReturnStatement &&
        soleStatement.argument &&
        soleStatement.argument.type !== utils_1.AST_NODE_TYPES.SequenceExpression) {
        return soleStatement.argument;
    }
    return null;
}
function walkExpression(expr, predicate, maxDepth = 100) {
    const stack = [
        { node: expr, depth: 0 },
    ];
    while (stack.length > 0) {
        const { node: current, depth } = stack.pop();
        if (depth > maxDepth)
            continue;
        if (predicate(current)) {
            return true;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const key of Object.keys(current)) {
            if (key === 'parent')
                continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = current[key];
            if (!value)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object' && 'type' in child) {
                        stack.push({ node: child, depth: depth + 1 });
                    }
                }
            }
            else if (typeof value === 'object' && 'type' in value) {
                stack.push({ node: value, depth: depth + 1 });
            }
        }
    }
    return false;
}
function containsCallExpression(expr) {
    return walkExpression(expr, (node) => [
        utils_1.AST_NODE_TYPES.CallExpression,
        utils_1.AST_NODE_TYPES.NewExpression,
        utils_1.AST_NODE_TYPES.TaggedTemplateExpression,
    ].includes(node.type));
}
function isNonDeterministicCall(node) {
    const callee = node.callee;
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression && !callee.computed) {
        const object = callee.object;
        const property = callee.property;
        if (object.type === utils_1.AST_NODE_TYPES.Identifier &&
            property.type === utils_1.AST_NODE_TYPES.Identifier) {
            const key = `${object.name}.${property.name}`;
            if (NON_DETERMINISTIC_MEMBERS.has(key)) {
                return true;
            }
        }
    }
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier && callee.name === 'Date') {
        return true;
    }
    return false;
}
function isNonDeterministicInvocation(expr) {
    return walkExpression(expr, (node) => {
        if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
            return isNonDeterministicCall(node);
        }
        if (node.type === utils_1.AST_NODE_TYPES.NewExpression) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                NON_DETERMINISTIC_CONSTRUCTORS.has(node.callee.name)) {
                return true;
            }
        }
        return false;
    });
}
function hasUnsafeSideEffects(expr) {
    return walkExpression(expr, (node) => [
        utils_1.AST_NODE_TYPES.AssignmentExpression,
        utils_1.AST_NODE_TYPES.AwaitExpression,
        utils_1.AST_NODE_TYPES.UpdateExpression,
        utils_1.AST_NODE_TYPES.YieldExpression,
        utils_1.AST_NODE_TYPES.SequenceExpression,
    ].includes(node.type) ||
        (node.type === utils_1.AST_NODE_TYPES.UnaryExpression &&
            node.operator === 'delete'));
}
function describePrimitiveExpression(expr) {
    switch (expr.type) {
        case utils_1.AST_NODE_TYPES.Literal: {
            if ('regex' in expr && expr.regex) {
                return 'RegExp object';
            }
            if ('bigint' in expr && expr.bigint !== undefined) {
                return 'bigint value';
            }
            if (expr.value === null)
                return 'null value';
            if (typeof expr.value === 'boolean')
                return 'boolean value';
            if (typeof expr.value === 'number')
                return 'number value';
            if (typeof expr.value === 'string')
                return 'string value';
            /* istanbul ignore next -- defensive fallback for uncommon literals */
            return 'primitive value';
        }
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return 'string value';
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            if (expr.operator === '!')
                return 'boolean condition';
            if (expr.operator === 'void')
                return 'undefined value';
            if (expr.operator === 'typeof')
                return 'string value';
            /* istanbul ignore next -- other unary operators are treated as primitives */
            return 'primitive value';
        case utils_1.AST_NODE_TYPES.BinaryExpression:
            if (COMPARISON_OPERATORS.has(expr.operator)) {
                return 'boolean condition';
            }
            if (expr.operator === '+' && isStringLikeWithoutTypes(expr)) {
                return 'string value';
            }
            return 'number value';
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return 'primitive value';
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return 'primitive value';
        case utils_1.AST_NODE_TYPES.Identifier:
            if (expr.name === 'undefined')
                return 'undefined value';
            if (expr.name === 'Infinity' || expr.name === 'NaN')
                return 'number value';
            return 'primitive value';
        default:
            /* istanbul ignore next -- unreachable with current node set */
            return 'primitive value';
    }
}
function isPrimitiveExpressionWithoutTypes(expr) {
    switch (expr.type) {
        case utils_1.AST_NODE_TYPES.Literal: {
            if ('regex' in expr && expr.regex) {
                return { primitive: false, kind: describePrimitiveExpression(expr) };
            }
            return { primitive: true, kind: describePrimitiveExpression(expr) };
        }
        case utils_1.AST_NODE_TYPES.Identifier: {
            const identifier = expr;
            if (identifier.name === 'undefined' ||
                identifier.name === 'Infinity' ||
                identifier.name === 'NaN') {
                return { primitive: true, kind: describePrimitiveExpression(expr) };
            }
            return { primitive: false, kind: 'primitive value' };
        }
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return { primitive: true, kind: describePrimitiveExpression(expr) };
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            return { primitive: true, kind: describePrimitiveExpression(expr) };
        case utils_1.AST_NODE_TYPES.BinaryExpression: {
            const primitive = COMPARISON_OPERATORS.has(expr.operator) ||
                (isPrimitiveExpressionWithoutTypes(expr.left)
                    .primitive &&
                    isPrimitiveExpressionWithoutTypes(expr.right)
                        .primitive);
            return {
                primitive,
                kind: describePrimitiveExpression(expr),
            };
        }
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return {
                primitive: isPrimitiveExpressionWithoutTypes(expr.left)
                    .primitive &&
                    isPrimitiveExpressionWithoutTypes(expr.right)
                        .primitive,
                kind: describePrimitiveExpression(expr),
            };
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return {
                primitive: isPrimitiveExpressionWithoutTypes(expr.consequent).primitive &&
                    isPrimitiveExpressionWithoutTypes(expr.alternate).primitive,
                kind: describePrimitiveExpression(expr),
            };
        case utils_1.AST_NODE_TYPES.ChainExpression:
            return isPrimitiveExpressionWithoutTypes(expr.expression);
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
            return isPrimitiveExpressionWithoutTypes(expr.expression);
        default:
            return { primitive: false, kind: 'primitive value' };
    }
}
exports.noUselessUsememoPrimitives = (0, createRule_1.createRule)({
    name: 'no-useless-usememo-primitives',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow useless useMemo with primitive values.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    ignoreCallExpressions: { type: 'boolean', default: true },
                    ignoreSymbol: { type: 'boolean', default: true },
                    tsOnly: { type: 'boolean', default: false },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            uselessUseMemoPrimitive: 'useMemo wraps a primitive {{valueKind}}. → Primitives are pass-by-value and have no identity to preserve, so memoization provides zero referential-stability benefit and only adds unnecessary hook overhead. → Remove useMemo and inline the expression directly.',
        },
    },
    defaultOptions: [DEFAULT_OPTIONS],
    create(context) {
        const options = { ...DEFAULT_OPTIONS, ...context.options[0] };
        const sourceCode = context.sourceCode;
        const services = sourceCode.parserServices;
        const parserServices = services &&
            'hasFullTypeInformation' in services &&
            services.hasFullTypeInformation
            ? services
            : null;
        if (options.tsOnly && !parserServices) {
            return {};
        }
        let tsModule = null;
        let checker = null;
        if (parserServices) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const ts = require('typescript');
                tsModule = ts;
                checker = parserServices.program.getTypeChecker();
            }
            catch {
                /* istanbul ignore next -- TypeScript not available, falls back to heuristic path */
            }
        }
        function classifyExpressionTypeInternal(expr) {
            if (!checker || !tsModule || !parserServices) {
                return { status: 'unknown', kind: 'unknown value' };
            }
            return (0, tsTypeClassifier_1.classifyExpressionType)(expr, {
                checker,
                tsModule,
                parserServices,
                options,
            });
        }
        return {
            CallExpression(node) {
                if (!isUseMemoCallee(node.callee)) {
                    return;
                }
                if (node.arguments.length === 0) {
                    return;
                }
                const callback = node.arguments[0];
                if (callback.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                    callback.type !== utils_1.AST_NODE_TYPES.FunctionExpression) {
                    return;
                }
                if (callback.async) {
                    return;
                }
                if (callback.generator) {
                    return;
                }
                const returnedExpression = getReturnedExpression(callback);
                if (!returnedExpression) {
                    return;
                }
                if (hasUnsafeSideEffects(returnedExpression)) {
                    return;
                }
                if (isNonDeterministicInvocation(returnedExpression)) {
                    return;
                }
                if (options.ignoreCallExpressions &&
                    containsCallExpression(returnedExpression)) {
                    return;
                }
                const typeEvaluation = classifyExpressionTypeInternal(returnedExpression);
                let isPrimitive = false;
                let valueKind = typeEvaluation.kind;
                if (typeEvaluation.status === 'primitive') {
                    isPrimitive = true;
                }
                else if (typeEvaluation.status !== 'non-primitive') {
                    const heuristic = isPrimitiveExpressionWithoutTypes(returnedExpression);
                    if (heuristic.primitive) {
                        isPrimitive = true;
                        valueKind = heuristic.kind;
                    }
                }
                if (!isPrimitive) {
                    return;
                }
                context.report({
                    node,
                    messageId: 'uselessUseMemoPrimitive',
                    data: {
                        valueKind,
                    },
                    fix(fixer) {
                        const replacement = `(${sourceCode.getText(returnedExpression)})`;
                        return fixer.replaceText(node, replacement);
                    },
                });
            },
        };
    },
});
exports.default = exports.noUselessUsememoPrimitives;
//# sourceMappingURL=no-useless-usememo-primitives.js.map