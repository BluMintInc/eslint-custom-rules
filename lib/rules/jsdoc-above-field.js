"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsdocAboveField = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = [{ checkObjectLiterals: false }];
exports.jsdocAboveField = (0, createRule_1.createRule)({
    name: 'jsdoc-above-field',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require JSDoc blocks to sit above fields instead of trailing inline so IDE hovers surface the documentation.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    checkObjectLiterals: {
                        type: 'boolean',
                        description: 'Also enforce JSDoc placement for object literal properties.',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            moveJsdocAbove: 'Inline JSDoc for "{{name}}" sits after the {{kind}} → IDE hovers and autocomplete skip trailing inline JSDoc, so tags like @deprecated/@default never surface when developers hover → Move the JSDoc block above the {{kind}} (and above any decorators or modifiers) so the documentation stays visible where it is needed.',
        },
    },
    defaultOptions,
    create(context, [options = defaultOptions[0]]) {
        const sourceCode = context.getSourceCode();
        const { checkObjectLiterals = false } = options;
        const allComments = sourceCode.getAllComments();
        const isRelevantNode = (node) => {
            if (node.type === utils_1.AST_NODE_TYPES.TSPropertySignature) {
                return true;
            }
            if (node.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
                return true;
            }
            if (checkObjectLiterals &&
                node.type === utils_1.AST_NODE_TYPES.Property &&
                node.parent?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                return true;
            }
            return false;
        };
        const isJSDocBlock = (comment) => comment.type === 'Block' && comment.value.startsWith('*');
        const getPropertyName = (node) => {
            const key = node.key;
            if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
                return key.name;
            }
            if (key.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof key.value === 'string') {
                return key.value;
            }
            return 'computed property';
        };
        const getKind = (node) => {
            if (node.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
                return 'class field';
            }
            if (node.type === utils_1.AST_NODE_TYPES.Property) {
                return 'object property';
            }
            return 'type field';
        };
        const inlineJSDocOnSameLine = (node) => {
            return allComments.find((comment) => {
                if (!isJSDocBlock(comment)) {
                    return false;
                }
                if (comment.loc.start.line !== node.loc.end.line) {
                    return false;
                }
                if (comment.range[0] < node.range[1]) {
                    return false;
                }
                const between = sourceCode.text.slice(node.range[1], comment.range[0]);
                return /^[\s;,]*$/.test(between);
            });
        };
        const indentForNode = (node) => {
            const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
            const beforeColumn = line.slice(0, node.loc.start.column);
            const trailingWhitespace = beforeColumn.match(/\s*$/);
            return trailingWhitespace?.[0] ?? '';
        };
        const formatCommentWithIndent = (comment, indent) => {
            const rawText = sourceCode.getText(comment);
            const rawLines = rawText.split('\n');
            let minIndentAfterStar;
            // Calculate minimum indentation across all lines (excluding the first line and standard closing line)
            rawLines.slice(1).forEach((line, index, arr) => {
                const isLastLine = index === arr.length - 1;
                const starMatch = line.match(/^\s*\*(.*)$/);
                if (!starMatch) {
                    return;
                }
                const afterStar = starMatch[1];
                // Skip the standard " */" closing line
                if (isLastLine && afterStar.trim() === '/') {
                    return;
                }
                const contentIndent = afterStar.match(/^([ \t]*)\S/);
                if (contentIndent) {
                    const indentLength = contentIndent[1].length;
                    minIndentAfterStar =
                        minIndentAfterStar === undefined
                            ? indentLength
                            : Math.min(minIndentAfterStar, indentLength);
                }
            });
            // Normalize indentation: we want the minimum indentation after '*' to be exactly 1 space.
            // (e.g., if min indent is 3, we strip 2; if min indent is 0, we add 1).
            const indentToAdjustment = minIndentAfterStar === undefined ? 0 : minIndentAfterStar - 1;
            const normalize = (text) => {
                if (indentToAdjustment > 0) {
                    return text.replace(new RegExp(`^[ \\t]{0,${indentToAdjustment}}`), '');
                }
                if (indentToAdjustment < 0) {
                    return ' '.repeat(-indentToAdjustment) + text;
                }
                return text;
            };
            const normalizedLines = rawLines.map((line, index) => {
                if (index === 0) {
                    return line.trimStart();
                }
                const starMatch = line.match(/^\s*\*(.*)$/);
                if (!starMatch) {
                    return line.trimStart();
                }
                const afterStar = normalize(starMatch[1]);
                if (afterStar.trim() === '/') {
                    return ' */';
                }
                if (afterStar.trim() === '') {
                    return ' *';
                }
                const needsSpace = !afterStar.startsWith(' ') && !afterStar.startsWith('\t');
                const content = needsSpace ? ` ${afterStar}` : afterStar;
                return ` *${content}`;
            });
            return normalizedLines.map((line) => `${indent}${line}`).join('\n');
        };
        const reportInlineJSDoc = (node, comment) => {
            const insertTarget = node.type === utils_1.AST_NODE_TYPES.PropertyDefinition &&
                node.decorators &&
                node.decorators.length > 0
                ? node.decorators[0]
                : node;
            const indent = indentForNode(insertTarget);
            const commentText = formatCommentWithIndent(comment, indent);
            let removalStart = comment.range[0];
            const removalEnd = comment.range[1];
            const lineStart = insertTarget.range[0] - insertTarget.loc.start.column;
            const textBeforeNode = sourceCode.text.slice(lineStart, insertTarget.range[0]);
            const hasCodeBeforeNode = /\S/.test(textBeforeNode);
            const insertionPoint = hasCodeBeforeNode
                ? insertTarget.range[0]
                : lineStart;
            const insertionText = hasCodeBeforeNode
                ? `\n${commentText}\n${indent}`
                : `${commentText}\n`;
            while (removalStart > node.range[1] &&
                /\s/.test(sourceCode.text[removalStart - 1])) {
                removalStart -= 1;
            }
            context.report({
                node,
                loc: comment.loc,
                messageId: 'moveJsdocAbove',
                data: {
                    name: getPropertyName(node),
                    kind: getKind(node),
                },
                fix(fixer) {
                    return [
                        fixer.insertTextBeforeRange([insertionPoint, insertionPoint], insertionText),
                        fixer.removeRange([removalStart, removalEnd]),
                    ];
                },
            });
        };
        const checkNode = (node) => {
            if (!isRelevantNode(node)) {
                return;
            }
            const jsdocComment = inlineJSDocOnSameLine(node);
            if (!jsdocComment) {
                return;
            }
            reportInlineJSDoc(node, jsdocComment);
        };
        return {
            TSPropertySignature: checkNode,
            PropertyDefinition: checkNode,
            ...(checkObjectLiterals && { Property: checkNode }),
        };
    },
});
//# sourceMappingURL=jsdoc-above-field.js.map