"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.omitIndexHtml = void 0;
const createRule_1 = require("../utils/createRule");
/**
 * Checks if a string is a URL by looking for common URL patterns
 * and excludes file system paths
 */
function isLikelyUrl(str) {
    // Check if it's a URL
    const isUrl = str.startsWith('http://') ||
        str.startsWith('https://') ||
        str.startsWith('/');
    // Exclude file system paths (containing directories like /usr/, /var/, etc.)
    const isFilePath = /^\/(?:usr|var|etc|home|opt|tmp|bin|lib|mnt|media|root|srv|sys|boot|dev)\//.test(str);
    return isUrl && !isFilePath;
}
/**
 * Checks if a URL has query parameters or hash fragments
 */
function hasQueryOrHash(url) {
    return url.includes('?') || url.includes('#');
}
/**
 * Removes 'index.html' from a URL and ensures proper trailing slash
 */
function fixUrl(url) {
    // Replace /index.html/ with / and /index.html with / at the end or before ?/#/${
    return url
        .replace(/\/index\.html\//g, '/')
        .replace(/\/index\.html(?=(?:$|[?#]|\$\{))/g, '/');
}
/**
 * Reconstructs a template literal using cooked values so static checks and
 * reporting align with what runtime sees (escape sequences are resolved).
 */
function describeTemplateLiteral(node, sourceCode) {
    const parts = [];
    node.quasis.forEach((quasi, index) => {
        const text = quasi.value.cooked ?? quasi.value.raw;
        parts.push(text);
        const expression = node.expressions[index];
        if (expression) {
            parts.push(`\${${sourceCode.getText(expression)}}`);
        }
    });
    return parts.join('');
}
exports.omitIndexHtml = (0, createRule_1.createRule)({
    name: 'omit-index-html',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow the use of "index.html" in URLs',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    allowWithQueryOrHash: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            omitIndexHtml: 'URL "{{url}}" includes "index.html", which servers already serve implicitly for directory paths. Keeping the file name creates duplicate URLs, breaks canonical links, and can make caches treat the same page as different assets. {{fixHint}}',
        },
    },
    defaultOptions: [{ allowWithQueryOrHash: true }],
    create(context, [options]) {
        const sourceCode = context.getSourceCode();
        const allowWithQueryOrHash = options.allowWithQueryOrHash !== false;
        return {
            Literal(node) {
                if (typeof node.value !== 'string')
                    return;
                const value = node.value;
                // Check if it's a URL and contains index.html
                if (isLikelyUrl(value) && value.includes('/index.html')) {
                    // Skip if it has query parameters or hash fragments and we're allowing those
                    if (allowWithQueryOrHash && hasQueryOrHash(value))
                        return;
                    const suggestedUrl = fixUrl(value);
                    const fixHint = `Replace it with the directory path (e.g., "${suggestedUrl}").`;
                    context.report({
                        node,
                        messageId: 'omitIndexHtml',
                        data: {
                            url: value,
                            suggestedUrl,
                            fixHint,
                        },
                        fix: (fixer) => {
                            const quote = sourceCode.getText(node).startsWith("'")
                                ? "'"
                                : '"';
                            const escapedUrl = suggestedUrl.split(quote).join(`\\${quote}`);
                            return fixer.replaceText(node, `${quote}${escapedUrl}${quote}`);
                        },
                    });
                }
            },
            TemplateLiteral(node) {
                const hasIndexHtmlInStatic = node.quasis.some((quasi) => {
                    const text = quasi.value.cooked ?? quasi.value.raw;
                    return text.includes('/index.html');
                });
                if (!hasIndexHtmlInStatic) {
                    return;
                }
                const value = describeTemplateLiteral(node, sourceCode);
                // Check if it's a URL and contains index.html
                if (isLikelyUrl(value) && value.includes('/index.html')) {
                    // Skip if it has query parameters or hash fragments and we're allowing those
                    if (allowWithQueryOrHash && hasQueryOrHash(value))
                        return;
                    const hasDynamicParts = node.expressions.length > 0;
                    const suggestedUrlRaw = fixUrl(value);
                    const suggestedUrl = hasDynamicParts
                        ? `\`${suggestedUrlRaw
                            .replace(/\\/g, '\\\\')
                            .replace(/`/g, '\\`')}\``
                        : suggestedUrlRaw;
                    const fixHint = hasDynamicParts
                        ? `Remove "index.html" from the static portion of the template so it resolves to the directory path (e.g., ${suggestedUrl}).`
                        : `Replace it with the directory path (e.g., "${suggestedUrl}").`;
                    context.report({
                        node,
                        messageId: 'omitIndexHtml',
                        data: {
                            url: value,
                            suggestedUrl,
                            fixHint,
                        },
                        // No automatic fix for template literals as they may contain dynamic parts
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=omit-index-html.js.map