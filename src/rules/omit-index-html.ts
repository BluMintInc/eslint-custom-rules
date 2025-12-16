import { TSESLint, TSESTree } from '@typescript-eslint/utils';

import { createRule } from '../utils/createRule';

type Options = [
  {
    allowWithQueryOrHash?: boolean;
  },
];
type MessageIds = 'omitIndexHtml';

/**
 * Checks if a string is a URL by looking for common URL patterns
 * and excludes file system paths
 */
function isLikelyUrl(str: string): boolean {
  // Check if it's a URL
  const isUrl =
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('/');

  // Exclude file system paths (containing directories like /usr/, /var/, etc.)
  const isFilePath =
    /^\/(?:usr|var|etc|home|opt|tmp|bin|lib|mnt|media|root|srv|sys|boot|dev)\//.test(
      str,
    );

  return isUrl && !isFilePath;
}

/**
 * Checks if a URL has query parameters or hash fragments
 */
function hasQueryOrHash(url: string): boolean {
  return url.includes('?') || url.includes('#');
}

/**
 * Removes 'index.html' from a URL and ensures proper trailing slash
 */
function fixUrl(url: string): string {
  // Replace /index.html with /
  return url.replace(/\/index\.html($|[?#]|\$\{)/, '/$1');
}

/**
 * Escapes backslashes and backticks so template literal wrappers remain valid
 */
function escapeForTemplateLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

/**
 * Reconstructs a template literal as it appears in source, including expressions,
 * using cooked text so escape sequences match the runtime string.
 */
function describeTemplateLiteral(
  node: TSESTree.TemplateLiteral,
  sourceCode: Readonly<TSESLint.SourceCode>,
): string {
  const parts: string[] = [];

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

export const omitIndexHtml = createRule<Options, MessageIds>({
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
      omitIndexHtml:
        'URL "{{url}}" includes "index.html", which servers already serve implicitly for directory paths. Keeping the file name creates duplicate URLs, breaks canonical links, and can make caches treat the same page as different assets. {{fixHint}}',
    },
  },
  defaultOptions: [{ allowWithQueryOrHash: true }],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();
    const allowWithQueryOrHash = options.allowWithQueryOrHash !== false;

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;

        const value = node.value;

        // Check if it's a URL and contains index.html
        if (isLikelyUrl(value) && value.includes('/index.html')) {
          // Skip if it has query parameters or hash fragments and we're allowing those
          if (allowWithQueryOrHash && hasQueryOrHash(value)) return;

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
              return fixer.replaceText(node, `"${suggestedUrl}"`);
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

        if (value.includes('/index.html')) {
          const hasDynamicParts = node.expressions.length > 0;
          const suggestedUrlRaw = fixUrl(value);
          const suggestedUrl = hasDynamicParts
            ? `\`${escapeForTemplateLiteral(suggestedUrlRaw)}\``
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
