"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noTryCatchAlreadyExistsInTransaction = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ALREADY_EXISTS_STRINGS = new Set(['already-exists', 'ALREADY_EXISTS']);
const ALREADY_EXISTS_NUMBERS = new Set([6, '6']);
function unwrapChainExpression(expression) {
    if (expression.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return expression.expression;
    }
    return expression;
}
function isRunTransactionCall(node) {
    const callee = unwrapChainExpression(node.callee);
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === 'runTransaction';
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        const property = callee.property;
        return (!callee.computed &&
            property.type === utils_1.AST_NODE_TYPES.Identifier &&
            property.name === 'runTransaction');
    }
    return false;
}
function getCallbackArgument(args) {
    for (const arg of args) {
        if (arg.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            arg.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
            return arg;
        }
    }
    return null;
}
function isErrorAliasExpression(expression, context) {
    if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
        return context.errorAliases.has(expression.name);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
        expression.type === utils_1.AST_NODE_TYPES.TSTypeAssertion) {
        return isErrorAliasExpression(expression.expression, context);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        return isErrorAliasExpression(expression.object, context);
    }
    if (expression.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return isErrorAliasExpression(expression.expression, context);
    }
    return false;
}
function isCodeProperty(property) {
    if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return property.name === 'code';
    }
    if (property.type === utils_1.AST_NODE_TYPES.Literal) {
        return property.value === 'code';
    }
    return false;
}
function isErrorCodeExpression(expression, context) {
    if (!expression) {
        return false;
    }
    if (expression.type === utils_1.AST_NODE_TYPES.Identifier) {
        return context.codeAliases.has(expression.name);
    }
    const unwrapped = expression.type === utils_1.AST_NODE_TYPES.ChainExpression
        ? expression.expression
        : expression;
    if (unwrapped.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        return (isCodeProperty(unwrapped.property) &&
            isErrorAliasExpression(unwrapped.object, context));
    }
    return false;
}
function isAlreadyExistsLiteral(expression) {
    if (!expression) {
        return null;
    }
    if (expression.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
        return null;
    }
    if (expression.type === utils_1.AST_NODE_TYPES.Literal) {
        if (ALREADY_EXISTS_STRINGS.has(`${expression.value}`)) {
            return `${expression.value}`;
        }
        if (ALREADY_EXISTS_NUMBERS.has(expression.value)) {
            return `${expression.value}`;
        }
    }
    if (expression.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
        expression.expressions.length === 0 &&
        expression.quasis.length === 1) {
        const raw = expression.quasis[0].value.cooked;
        if (raw && ALREADY_EXISTS_STRINGS.has(raw)) {
            return raw;
        }
    }
    return null;
}
function isAlreadyExistsComparison(expression, context) {
    if (expression.type !== utils_1.AST_NODE_TYPES.BinaryExpression) {
        return null;
    }
    if (!['==', '==='].includes(expression.operator)) {
        return null;
    }
    const leftLiteral = isAlreadyExistsLiteral(expression.left);
    const rightLiteral = isAlreadyExistsLiteral(expression.right);
    if (leftLiteral && isErrorCodeExpression(expression.right, context)) {
        return leftLiteral;
    }
    if (rightLiteral && isErrorCodeExpression(expression.left, context)) {
        return rightLiteral;
    }
    return null;
}
function addAliasesFromDeclarator(declarator, context) {
    const init = declarator.init;
    const id = declarator.id;
    const initIsAliasSource = !!init &&
        (isErrorAliasExpression(init, context) ||
            (init.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
                isErrorAliasExpression(init.right, context)));
    if (id.type === utils_1.AST_NODE_TYPES.Identifier && initIsAliasSource) {
        context.errorAliases.add(id.name);
    }
    if (id.type === utils_1.AST_NODE_TYPES.ObjectPattern && initIsAliasSource) {
        for (const property of id.properties) {
            if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                continue;
            }
            const value = property.value;
            if (isCodeProperty(property.key) &&
                value.type === utils_1.AST_NODE_TYPES.Identifier) {
                context.codeAliases.add(value.name);
            }
        }
    }
}
function containsAlreadyExistsCheck(node, context) {
    if (!node) {
        return null;
    }
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.BlockStatement: {
            for (const statement of node.body) {
                const found = containsAlreadyExistsCheck(statement, context);
                if (found)
                    return found;
            }
            return null;
        }
        case utils_1.AST_NODE_TYPES.ExpressionStatement:
            return containsAlreadyExistsCheck(node.expression, context);
        case utils_1.AST_NODE_TYPES.ReturnStatement:
            return containsAlreadyExistsCheck(node.argument, context);
        case utils_1.AST_NODE_TYPES.IfStatement: {
            const testMatch = containsAlreadyExistsCheck(node.test, context);
            if (testMatch)
                return testMatch;
            const consequentMatch = containsAlreadyExistsCheck(node.consequent, context);
            if (consequentMatch)
                return consequentMatch;
            return containsAlreadyExistsCheck(node.alternate, context);
        }
        case utils_1.AST_NODE_TYPES.SwitchStatement: {
            const discriminantIsCode = isErrorCodeExpression(node.discriminant, context);
            for (const switchCase of node.cases) {
                const caseLiteral = isAlreadyExistsLiteral(switchCase.test);
                if (discriminantIsCode && caseLiteral) {
                    return caseLiteral;
                }
                const found = switchCase.consequent
                    .map((stmt) => containsAlreadyExistsCheck(stmt, context))
                    .find(Boolean);
                if (found)
                    return found;
            }
            return null;
        }
        case utils_1.AST_NODE_TYPES.VariableDeclaration: {
            for (const declarator of node.declarations) {
                addAliasesFromDeclarator(declarator, context);
                const found = containsAlreadyExistsCheck(declarator.init, context);
                if (found)
                    return found;
            }
            return null;
        }
        case utils_1.AST_NODE_TYPES.VariableDeclarator:
            addAliasesFromDeclarator(node, context);
            return containsAlreadyExistsCheck(node.init, context);
        case utils_1.AST_NODE_TYPES.AssignmentExpression:
            if (node.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                isErrorAliasExpression(node.right, context)) {
                context.errorAliases.add(node.left.name);
            }
            return containsAlreadyExistsCheck(node.right, context);
        case utils_1.AST_NODE_TYPES.CallExpression:
        case utils_1.AST_NODE_TYPES.NewExpression: {
            const calleeMatch = containsAlreadyExistsCheck(node.callee, context);
            if (calleeMatch)
                return calleeMatch;
            for (const arg of node.arguments) {
                const found = containsAlreadyExistsCheck(arg, context);
                if (found)
                    return found;
            }
            return null;
        }
        case utils_1.AST_NODE_TYPES.LogicalExpression: {
            const leftMatch = containsAlreadyExistsCheck(node.left, context);
            if (leftMatch)
                return leftMatch;
            return containsAlreadyExistsCheck(node.right, context);
        }
        case utils_1.AST_NODE_TYPES.BinaryExpression:
            return (isAlreadyExistsComparison(node, context) ||
                containsAlreadyExistsCheck(node.left, context) ||
                containsAlreadyExistsCheck(node.right, context));
        case utils_1.AST_NODE_TYPES.ConditionalExpression: {
            const testMatch = containsAlreadyExistsCheck(node.test, context);
            if (testMatch)
                return testMatch;
            const consequentMatch = containsAlreadyExistsCheck(node.consequent, context);
            if (consequentMatch)
                return consequentMatch;
            return containsAlreadyExistsCheck(node.alternate, context);
        }
        case utils_1.AST_NODE_TYPES.MemberExpression:
            return containsAlreadyExistsCheck(node.object, context);
        case utils_1.AST_NODE_TYPES.ChainExpression:
            return containsAlreadyExistsCheck(node.expression, context);
        case utils_1.AST_NODE_TYPES.AwaitExpression:
        case utils_1.AST_NODE_TYPES.UnaryExpression:
        case utils_1.AST_NODE_TYPES.UpdateExpression:
            return containsAlreadyExistsCheck(node.argument, context);
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return null;
        case utils_1.AST_NODE_TYPES.TryStatement: {
            const blockMatch = containsAlreadyExistsCheck(node.block, context);
            if (blockMatch)
                return blockMatch;
            const handlerMatch = containsAlreadyExistsCheck(node.handler?.body, context);
            if (handlerMatch)
                return handlerMatch;
            return containsAlreadyExistsCheck(node.finalizer, context);
        }
        default:
            return null;
    }
}
function createCatchContext(handler) {
    const errorAliases = new Set();
    const codeAliases = new Set();
    const param = handler.param;
    if (param?.type === utils_1.AST_NODE_TYPES.Identifier) {
        errorAliases.add(param.name);
    }
    else if (param?.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
        for (const property of param.properties) {
            if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                continue;
            }
            const value = property.value;
            if (isCodeProperty(property.key) &&
                value.type === utils_1.AST_NODE_TYPES.Identifier) {
                codeAliases.add(value.name);
            }
        }
    }
    return { errorAliases, codeAliases };
}
exports.noTryCatchAlreadyExistsInTransaction = (0, createRule_1.createRule)({
    name: 'no-try-catch-already-exists-in-transaction',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow catching ALREADY_EXISTS errors inside Firestore transaction callbacks',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noAlreadyExistsCatchInTransaction: 'Do not catch ALREADY_EXISTS ({{codeLiteral}}) inside Firestore transaction callbacks. Firestore retries transaction bodies on contention, so this catch will re-run even though ALREADY_EXISTS is permanent. Move the try/catch outside the transaction or use runCreateForgivenessTransaction so the handler runs once.',
        },
    },
    defaultOptions: [],
    create(context) {
        const transactionBodies = new Set();
        function isInsideTransaction(node) {
            let current = node;
            while (current) {
                if (transactionBodies.has(current)) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }
        return {
            CallExpression(node) {
                if (!isRunTransactionCall(node)) {
                    return;
                }
                const callback = getCallbackArgument(node.arguments);
                if (callback && callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    transactionBodies.add(callback.body);
                }
            },
            'CallExpression:exit'(node) {
                if (!isRunTransactionCall(node)) {
                    return;
                }
                const callback = getCallbackArgument(node.arguments);
                if (callback && callback.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                    transactionBodies.delete(callback.body);
                }
            },
            TryStatement(node) {
                if (!isInsideTransaction(node)) {
                    return;
                }
                const handler = node.handler;
                if (!handler) {
                    return;
                }
                const catchContext = createCatchContext(handler);
                const match = containsAlreadyExistsCheck(handler.body, catchContext);
                if (match) {
                    context.report({
                        node: handler,
                        messageId: 'noAlreadyExistsCatchInTransaction',
                        data: { codeLiteral: match },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-try-catch-already-exists-in-transaction.js.map