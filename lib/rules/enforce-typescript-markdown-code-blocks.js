"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTypescriptMarkdownCodeBlocks = void 0;
const createRule_1 = require("../utils/createRule");
const FENCE = '```';
function isFenceLine(text, fenceIndex, indent) {
    const lineEnd = text.indexOf('\n', fenceIndex);
    const afterFence = lineEnd === -1
        ? text.slice(fenceIndex + FENCE.length)
        : text.slice(fenceIndex + FENCE.length, lineEnd);
    return (afterFence.trim().length === 0 &&
        text.slice(text.lastIndexOf('\n', fenceIndex - 1) + 1, fenceIndex) ===
            indent);
}
function findClosingFence(text, startIndex, indent) {
    let searchIndex = startIndex;
    while (searchIndex < text.length) {
        const candidate = text.indexOf(FENCE, searchIndex);
        if (candidate === -1) {
            return null;
        }
        if (isFenceLine(text, candidate, indent)) {
            return candidate;
        }
        searchIndex = candidate + FENCE.length;
    }
    return null;
}
function isIndentOnly(value) {
    return /^[\t ]*$/.test(value);
}
exports.enforceTypescriptMarkdownCodeBlocks = (0, createRule_1.createRule)({
    name: 'enforce-typescript-markdown-code-blocks',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Ensure Markdown fenced code blocks without a language specifier default to typescript for consistent highlighting.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            missingLanguageSpecifier: 'Code block starting on line {{line}} has no language label. Unlabeled fences render as plain text, hiding TypeScript syntax and type cues. Add "typescript" after the opening backticks (```typescript) to keep documentation readable and consistent.',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        if (!filename.toLowerCase().endsWith('.md')) {
            return {};
        }
        return {
            Program() {
                const sourceCode = context.sourceCode;
                const text = sourceCode.getText();
                let index = 0;
                while (index < text.length) {
                    const openingFence = text.indexOf(FENCE, index);
                    if (openingFence === -1) {
                        break;
                    }
                    const lineStart = text.lastIndexOf('\n', openingFence - 1) + 1;
                    const indent = text.slice(lineStart, openingFence);
                    if (!isIndentOnly(indent)) {
                        index = openingFence + FENCE.length;
                        continue;
                    }
                    const lineEnd = text.indexOf('\n', openingFence + FENCE.length);
                    if (lineEnd === -1) {
                        break;
                    }
                    const infoString = text.slice(openingFence + FENCE.length, lineEnd);
                    const closingFence = findClosingFence(text, lineEnd + 1, indent);
                    if (closingFence === null) {
                        index = lineEnd + 1;
                        continue;
                    }
                    const content = text.slice(lineEnd + 1, closingFence);
                    const hasContent = content.trim().length > 0;
                    const hasLanguage = infoString.trim().length > 0;
                    if (!hasLanguage && hasContent) {
                        const locStart = sourceCode.getLocFromIndex(openingFence);
                        const hasCarriageReturn = lineEnd > 0 && text[lineEnd - 1] === '\r';
                        context.report({
                            loc: {
                                start: locStart,
                                end: sourceCode.getLocFromIndex(lineEnd),
                            },
                            messageId: 'missingLanguageSpecifier',
                            data: { line: locStart.line },
                            fix: (fixer) => fixer.replaceTextRange([openingFence + FENCE.length, lineEnd], hasCarriageReturn ? 'typescript\r' : 'typescript'),
                        });
                    }
                    index = closingFence + FENCE.length;
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-typescript-markdown-code-blocks.js.map