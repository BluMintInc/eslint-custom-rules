"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenPushCalls = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const PUSH_METHOD_NAME = 'push';
function getRangeStart(node, sourceCode) {
    return node.range?.[0] ?? sourceCode.getIndexFromLoc(node.loc.start);
}
function getRangeEnd(node, sourceCode) {
    return node.range?.[1] ?? sourceCode.getIndexFromLoc(node.loc.end);
}
function unwrapExpression(expression) {
    let current = expression;
    /**
     * Peel off harmless wrappers to compare the underlying array identity
     * (e.g., arr!.push(), arr as Foo, (arr).push()).
     */
    while (true) {
        if (current.type === utils_1.AST_NODE_TYPES.TSNonNullExpression) {
            current = current.expression;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.TSAsExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSTypeAssertion ||
            current.type === utils_1.AST_NODE_TYPES.TSInstantiationExpression ||
            current.type === utils_1.AST_NODE_TYPES.TSSatisfiesExpression) {
            current = current.expression;
            continue;
        }
        if (current.type === utils_1.AST_NODE_TYPES.ChainExpression) {
            current = current
                .expression;
            continue;
        }
        break;
    }
    return current;
}
function getPropertyKey(property, computed) {
    if (!computed && property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return property.name;
    }
    if (property.type === utils_1.AST_NODE_TYPES.Literal) {
        const value = typeof property.value === 'string' || typeof property.value === 'number'
            ? property.value
            : null;
        return value !== null ? String(value) : null;
    }
    return null;
}
function getCalleeWithTypeParams(call, sourceCode) {
    const calleeStart = getRangeStart(call.callee, sourceCode);
    const calleeEnd = call.typeParameters
        ? getRangeEnd(call.typeParameters, sourceCode)
        : getRangeEnd(call.callee, sourceCode);
    return sourceCode.text.slice(calleeStart, calleeEnd);
}
function getPreferredCalleeText(group) {
    const withTypeParams = group.find((entry) => entry.call.typeParameters);
    return withTypeParams ? withTypeParams.calleeText : group[0].calleeText;
}
function getExpressionIdentity(expression) {
    const node = unwrapExpression(expression);
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
            return `id:${node.name}`;
        case utils_1.AST_NODE_TYPES.ThisExpression:
            return 'this';
        case utils_1.AST_NODE_TYPES.Super:
            return 'super';
        case utils_1.AST_NODE_TYPES.Literal:
            if (typeof node.value === 'string' || typeof node.value === 'number') {
                return `lit:${String(node.value)}`;
            }
            return null;
        case utils_1.AST_NODE_TYPES.MemberExpression: {
            if (node.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier)
                return null;
            const objectKey = getExpressionIdentity(node.object);
            const propertyKey = getPropertyKey(node.property, Boolean(node.computed));
            if (!objectKey || !propertyKey)
                return null;
            return `${objectKey}.${propertyKey}`;
        }
        default:
            return null;
    }
}
function isSafeMemberChain(expression) {
    const node = unwrapExpression(expression);
    if (node.type === utils_1.AST_NODE_TYPES.Identifier ||
        node.type === utils_1.AST_NODE_TYPES.ThisExpression ||
        node.type === utils_1.AST_NODE_TYPES.Super) {
        return true;
    }
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        if (node.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
            return false;
        }
        if (node.computed || node.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
            return false;
        }
        return isSafeMemberChain(node.object);
    }
    return false;
}
function hasForbiddenSideEffects(node) {
    if (!node)
        return false;
    const astNodeType = node.type;
    if (astNodeType === 'ParenthesizedExpression') {
        return hasForbiddenSideEffects(node.expression);
    }
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.Identifier:
        case utils_1.AST_NODE_TYPES.Literal:
        case utils_1.AST_NODE_TYPES.ThisExpression:
        case utils_1.AST_NODE_TYPES.Super:
            return false;
        case utils_1.AST_NODE_TYPES.CallExpression:
        case utils_1.AST_NODE_TYPES.NewExpression:
        case utils_1.AST_NODE_TYPES.UpdateExpression:
        case utils_1.AST_NODE_TYPES.AwaitExpression:
        case utils_1.AST_NODE_TYPES.YieldExpression:
        case utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
        case utils_1.AST_NODE_TYPES.ImportExpression:
        case utils_1.AST_NODE_TYPES.AssignmentExpression:
            return true;
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            if (node.operator === 'delete')
                return true;
            return hasForbiddenSideEffects(node.argument);
        case utils_1.AST_NODE_TYPES.BinaryExpression:
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            return (hasForbiddenSideEffects(node.left) ||
                hasForbiddenSideEffects(node.right));
        case utils_1.AST_NODE_TYPES.ConditionalExpression:
            return (hasForbiddenSideEffects(node.test) ||
                hasForbiddenSideEffects(node.consequent) ||
                hasForbiddenSideEffects(node.alternate));
        case utils_1.AST_NODE_TYPES.MemberExpression:
            return (hasForbiddenSideEffects(node.object) ||
                (node.computed &&
                    hasForbiddenSideEffects(node.property)));
        case utils_1.AST_NODE_TYPES.ChainExpression:
            return hasForbiddenSideEffects(node.expression);
        case utils_1.AST_NODE_TYPES.SequenceExpression:
            return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return node.expressions.some((expr) => hasForbiddenSideEffects(expr));
        case utils_1.AST_NODE_TYPES.ArrayExpression:
            return node.elements.some((elem) => elem ? hasForbiddenSideEffects(elem) : false);
        case utils_1.AST_NODE_TYPES.ObjectExpression:
            return node.properties.some((prop) => {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    return ((prop.computed &&
                        hasForbiddenSideEffects(prop.key)) ||
                        hasForbiddenSideEffects(prop.value));
                }
                if (prop.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                    return hasForbiddenSideEffects(prop.argument);
                }
                return false;
            });
        case utils_1.AST_NODE_TYPES.SpreadElement:
            return hasForbiddenSideEffects(node.argument);
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
        case utils_1.AST_NODE_TYPES.TSInstantiationExpression:
        case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
            return hasForbiddenSideEffects(node.expression);
        default:
            return false;
    }
}
function canSafelyFix(group) {
    return group.every((entry) => {
        const callee = entry.call.callee;
        if (callee.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier ||
            callee.computed ||
            callee.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
            return false;
        }
        if (!isSafeMemberChain(callee.object)) {
            return false;
        }
        if (hasForbiddenSideEffects(callee.object)) {
            return false;
        }
        return entry.call.arguments.every((arg) => {
            if (arg.type === utils_1.AST_NODE_TYPES.SpreadElement) {
                return !hasForbiddenSideEffects(arg.argument);
            }
            return !hasForbiddenSideEffects(arg);
        });
    });
}
function isPushCallStatement(statement, sourceCode) {
    if (statement.type !== utils_1.AST_NODE_TYPES.ExpressionStatement)
        return null;
    const expr = statement.expression;
    if (expr.type !== utils_1.AST_NODE_TYPES.CallExpression)
        return null;
    if (expr.optional)
        return null;
    const callee = expr.callee;
    if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression ||
        callee.optional ||
        callee.property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier) {
        return null;
    }
    const propertyName = callee.property.type === utils_1.AST_NODE_TYPES.Identifier
        ? callee.property.name
        : callee.property.type === utils_1.AST_NODE_TYPES.Literal
            ? callee.property.value
            : null;
    if (propertyName !== PUSH_METHOD_NAME)
        return null;
    const targetKey = getExpressionIdentity(callee.object);
    if (!targetKey)
        return null;
    return {
        statement,
        call: expr,
        targetKey,
        calleeText: getCalleeWithTypeParams(expr, sourceCode),
    };
}
function getLineIndent(targetNode, sourceCode) {
    const start = getRangeStart(targetNode, sourceCode);
    const text = sourceCode.text;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const indentMatch = text.slice(lineStart, start).match(/^[\t ]*/u);
    return indentMatch ? indentMatch[0] : '';
}
function normalizeIndentation(text) {
    const lines = text.split('\n');
    const indents = lines
        .slice(1)
        .filter((line) => line.trim().length > 0)
        .map((line) => line.match(/^[\t ]*/u)?.[0].length ?? 0);
    const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
    if (minIndent === 0)
        return text;
    return [
        lines[0],
        ...lines
            .slice(1)
            .map((line) => line.slice(Math.min(minIndent, line.length))),
    ].join('\n');
}
function indentText(text, indent) {
    const normalized = normalizeIndentation(text);
    return normalized
        .split('\n')
        .map((line) => indent + line)
        .join('\n');
}
function formatComments(comments, indent, sourceCode) {
    return comments.map((comment) => indentText(sourceCode.getText(comment), indent));
}
function getLeadingCommentsBetween(sourceCode, previousStatement, current) {
    const previousEnd = getRangeEnd(previousStatement, sourceCode);
    return sourceCode
        .getCommentsBefore(current)
        .filter((comment) => comment.range[0] >= previousEnd);
}
exports.flattenPushCalls = (0, createRule_1.createRule)({
    name: 'flatten-push-calls',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Consolidate consecutive push calls on the same array into a single push with multiple arguments.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            flattenPushCalls: [
                'What’s wrong: "{{target}}" is pushed to using multiple consecutive ".push(...)" calls.',
                'Why it matters: repeated calls add property-access overhead and obscure that these values belong to one append operation.',
                'How to fix: merge them into a single ".push(...)" call with multiple arguments (for example, "{{target}}.push(a, b, c)").',
            ].join(' '),
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        function buildSegments(group) {
            return group.map((entry, index) => {
                const previousStatement = index > 0 ? group[index - 1].statement : null;
                const comments = previousStatement === null
                    ? []
                    : getLeadingCommentsBetween(sourceCode, previousStatement, entry.statement);
                return { comments, args: entry.call.arguments };
            });
        }
        function shouldUseMultilineFormat(segments, group, totalArgs) {
            const hasInterstitialComments = segments.some((segment) => segment.comments.length > 0);
            const hasMultilineArgument = group.some((entry) => entry.call.arguments.some((arg) => sourceCode.getText(arg).includes('\n')));
            return hasInterstitialComments || hasMultilineArgument || totalArgs > 2;
        }
        function detectSemicolon(first, last) {
            return (sourceCode.getLastToken(last.statement)?.value === ';' ||
                sourceCode.getLastToken(first.statement)?.value === ';');
        }
        function formatArguments(segments, shouldUseMultiline, argumentIndent) {
            if (!shouldUseMultiline) {
                return segments.flatMap((segment) => segment.args.map((arg) => sourceCode.getText(arg)));
            }
            return formatMultilineArguments(segments, argumentIndent);
        }
        function formatMultilineArguments(segments, argumentIndent) {
            const argumentParts = [];
            let pendingComments = [];
            segments.forEach((segment) => {
                const formattedComments = formatComments(segment.comments, argumentIndent, sourceCode);
                pendingComments = pendingComments.concat(formattedComments);
                if (segment.args.length === 0)
                    return;
                segment.args.forEach((arg, index) => {
                    const argText = indentText(sourceCode.getText(arg), argumentIndent);
                    if (index === 0 && pendingComments.length > 0) {
                        argumentParts.push(`${pendingComments.join('\n')}\n${argText}`);
                        pendingComments = [];
                    }
                    else {
                        argumentParts.push(argText);
                    }
                });
            });
            return attachTrailingComments(argumentParts, pendingComments);
        }
        function attachTrailingComments(argumentParts, pendingComments) {
            if (pendingComments.length > 0 && argumentParts.length > 0) {
                const lastIndex = argumentParts.length - 1;
                argumentParts[lastIndex] = `${argumentParts[lastIndex]}\n${pendingComments.join('\n')}`;
            }
            return argumentParts;
        }
        function buildFinalReplacement(calleeText, argumentParts, shouldUseMultiline, baseIndent, hasSemicolon) {
            const argsText = shouldUseMultiline
                ? `\n${argumentParts.join(',\n')}\n${baseIndent}`
                : argumentParts.join(', ');
            return `${calleeText}(${argsText})${hasSemicolon ? ';' : ''}`;
        }
        function buildReplacement(group) {
            const first = group[0];
            const last = group[group.length - 1];
            const totalArgs = group.reduce((count, item) => count + item.call.arguments.length, 0);
            const calleeText = getPreferredCalleeText(group);
            const segments = buildSegments(group);
            const shouldUseMultiline = shouldUseMultilineFormat(segments, group, totalArgs);
            const baseIndent = getLineIndent(first.statement, sourceCode);
            const argumentIndent = `${baseIndent}  `;
            const argumentParts = formatArguments(segments, shouldUseMultiline, argumentIndent);
            const hasSemicolon = detectSemicolon(first, last);
            const replacement = buildFinalReplacement(calleeText, argumentParts, shouldUseMultiline, baseIndent, hasSemicolon);
            const currentText = sourceCode
                .getText()
                .slice(first.statement.range[0], last.statement.range[1]);
            return currentText === replacement ? null : replacement;
        }
        function findConsecutivePushGroup(statements, startIndex, firstInfo) {
            const group = [firstInfo];
            let cursor = startIndex + 1;
            while (cursor < statements.length) {
                const next = isPushCallStatement(statements[cursor], sourceCode);
                if (!next || next.targetKey !== firstInfo.targetKey)
                    break;
                group.push(next);
                cursor += 1;
            }
            return { group, nextIndex: cursor };
        }
        function shouldReportViolation(group) {
            if (group.length <= 1)
                return false;
            const totalArgs = group.reduce((count, entry) => count + entry.call.arguments.length, 0);
            const firstArgs = group[0].call.arguments.length;
            return totalArgs > firstArgs && canSafelyFix(group);
        }
        function reportViolation(group) {
            context.report({
                node: group[0].call.callee,
                messageId: 'flattenPushCalls',
                data: {
                    target: sourceCode.getText(group[0].call.callee.object),
                },
                fix(fixer) {
                    const replacement = buildReplacement(group);
                    if (!replacement)
                        return null;
                    return fixer.replaceTextRange([
                        group[0].statement.range[0],
                        group[group.length - 1].statement.range[1],
                    ], replacement);
                },
            });
        }
        function checkStatements(statements) {
            for (let i = 0; i < statements.length; i++) {
                const info = isPushCallStatement(statements[i], sourceCode);
                if (!info)
                    continue;
                const { group, nextIndex } = findConsecutivePushGroup(statements, i, info);
                if (shouldReportViolation(group)) {
                    reportViolation(group);
                }
                i = nextIndex - 1;
            }
        }
        return {
            Program(node) {
                checkStatements(node.body);
            },
            BlockStatement(node) {
                checkStatements(node.body);
            },
            SwitchCase(node) {
                checkStatements(node.consequent);
            },
        };
    },
});
//# sourceMappingURL=flatten-push-calls.js.map