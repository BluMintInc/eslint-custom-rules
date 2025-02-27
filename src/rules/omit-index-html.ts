import { createRule } from '../utils/createRule';

type Options = [
  {
    allowWithQueryOrHash?: boolean;
  }
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
  const isFilePath = /^\/(?:usr|var|etc|home|opt|tmp|bin|lib|mnt|media|root|srv|sys|boot|dev)\//.test(str);

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
  return url.replace(/\/index\.html($|[?#])/, '/$1');
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
        'Avoid using "index.html" in URLs. Many web servers automatically resolve directory requests to index.html.',
    },
  },
  defaultOptions: [{ allowWithQueryOrHash: true }],
  create(context, [options]) {
    const allowWithQueryOrHash = options.allowWithQueryOrHash !== false;

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;

        const value = node.value;

        // Check if it's a URL and contains index.html
        if (isLikelyUrl(value) && value.includes('/index.html')) {
          // Skip if it has query parameters or hash fragments and we're allowing those
          if (allowWithQueryOrHash && hasQueryOrHash(value)) return;

          context.report({
            node,
            messageId: 'omitIndexHtml',
            fix: (fixer) => {
              return fixer.replaceText(node, `"${fixUrl(value)}"`);
            },
          });
        }
      },
      TemplateLiteral(node) {
        // For template literals, we can only check if the static parts contain index.html
        const value = node.quasis.map(q => q.value.raw).join('');

        if (value.includes('/index.html')) {
          context.report({
            node,
            messageId: 'omitIndexHtml',
            // No automatic fix for template literals as they may contain dynamic parts
          });
        }
      },
    };
  },
});
