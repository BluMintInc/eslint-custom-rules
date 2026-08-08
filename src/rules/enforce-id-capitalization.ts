import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type Options = [];
type MessageIds = 'enforceIdCapitalization';

/**
 * This rule ensures consistency in user-facing text by enforcing the use of "ID"
 * instead of "id" when referring to identifiers in UI labels, instructions,
 * error messages, and other visible strings.
 */
export const enforceIdCapitalization = createRule<Options, MessageIds>({
  name: 'enforce-id-capitalization',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of "ID" instead of "id" in user-facing text',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceIdCapitalization:
        'Found lowercase "id" in user-facing text → "ID" (capitalized) is the standard abbreviation for "identifier" and improves readability in UI labels and messages → replace lowercase "id" with uppercase "ID" in displayed labels and messages.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Regular expression to match standalone "id" surrounded by whitespace or punctuation
    // This ensures we only match "id" as a word, not as part of another word
    const idRegex = /(^|\s|[.,;:!?'"()\[\]{}])id(\s|$|[.,;:!?'"()\[\]{}])/g;

    const sourceCode = context.getSourceCode();

    // DOM / Testing-Library APIs whose first argument is an attribute NAME
    // (code), not user-facing text. A literal like 'id' passed here is a DOM
    // attribute name; flagging or rewriting it to 'ID' breaks the call.
    const ATTRIBUTE_NAME_METHODS = new Set([
      'getAttribute',
      'setAttribute',
      'hasAttribute',
      'removeAttribute',
      'getAttributeNode',
      'getAttributeNS',
      'setAttributeNS',
      'hasAttributeNS',
      'removeAttributeNS',
      'toHaveAttribute',
    ]);

    // A single identifier token — no whitespace, no punctuation. Prose is a
    // phrase, so anything matching this is a name rather than displayed text.
    const IDENTIFIER_TOKEN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

    /**
     * Check if a node is in a context that should be excluded from the rule
     * (e.g., parameter names, property names, type definitions)
     */
    function isExcludedContext(node: any): boolean {
      // Check if the node is a property of an object pattern (destructuring)
      if (
        node.parent &&
        (node.parent.type === AST_NODE_TYPES.Property ||
          node.parent.type === AST_NODE_TYPES.PropertyDefinition) &&
        node.parent.key === node
      ) {
        return true;
      }

      // Check if the node is a parameter name
      if (
        node.parent &&
        (node.parent.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.parent.type === AST_NODE_TYPES.FunctionExpression ||
          node.parent.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
        node.parent.params.includes(node)
      ) {
        return true;
      }

      // Check if the node is part of a type definition
      if (
        node.parent &&
        (node.parent.type === AST_NODE_TYPES.TSPropertySignature ||
          node.parent.type === AST_NODE_TYPES.TSParameterProperty ||
          node.parent.type === AST_NODE_TYPES.TSTypeAnnotation ||
          node.parent.type === AST_NODE_TYPES.TSTypeReference)
      ) {
        return true;
      }

      // Check if the node is a variable name
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id === node
      ) {
        return true;
      }

      // Check if the node is in an object property context
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.Property &&
        node.parent.value === node
      ) {
        // Check if this is a property in an object pattern (destructuring)
        let currentNode = node.parent;
        while (currentNode.parent) {
          if (currentNode.parent.type === AST_NODE_TYPES.ObjectPattern) {
            return true;
          }
          currentNode = currentNode.parent;
        }
      }

      // Check if the node is in a property assignment context
      if (node.parent && node.parent.type === AST_NODE_TYPES.ObjectExpression) {
        return true;
      }

      // Check if the node is in a property access context
      if (node.parent && node.parent.type === AST_NODE_TYPES.MemberExpression) {
        return true;
      }

      // Check if the node is the attribute-name argument of a DOM / jest-dom
      // attribute API call, e.g. element.getAttribute('id') or
      // expect(el).toHaveAttribute('id', ...). The attribute name is code, not
      // user-facing text. For the *NS variants the name is the second argument
      // (the first is the namespace URI); otherwise it is the first argument.
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.CallExpression &&
        node.parent.callee &&
        node.parent.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.callee.property.type === AST_NODE_TYPES.Identifier &&
        ATTRIBUTE_NAME_METHODS.has(node.parent.callee.property.name)
      ) {
        const nameArgIndex = node.parent.callee.property.name.endsWith('NS')
          ? 1
          : 0;
        if (node.parent.arguments[nameArgIndex] === node) {
          return true;
        }
      }

      // Check if the node is a lone identifier token listed in an array
      // literal, e.g. ['id', 'broadcastTest'] as const. An array of bare
      // identifiers is a key/field-name list — the array spelling of the object
      // keys this rule already leaves alone — so 'ID' would name a key that
      // does not exist. The carve-out requires the *whole* element to be one
      // identifier, which keeps a phrase such as ['Enter your id', 'Name']
      // reported: prose carries whitespace or punctuation, a key name does not.
      if (
        node.type === AST_NODE_TYPES.Literal &&
        typeof node.value === 'string' &&
        node.parent &&
        node.parent.type === AST_NODE_TYPES.ArrayExpression &&
        node.parent.elements.includes(node) &&
        IDENTIFIER_TOKEN.test(node.value)
      ) {
        return true;
      }

      // Check if the node is a string literal used for property access
      // This handles cases like obj['id'] or OverwolfGame['id']
      if (
        node.parent &&
        node.parent.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.computed === true &&
        node.parent.property === node
      ) {
        return true;
      }

      // Check if the node is a string literal in a type definition context
      // This handles cases like Pick<Type, 'id' | 'name'>
      if (
        node.type === AST_NODE_TYPES.Literal &&
        typeof node.value === 'string'
      ) {
        let currentNode = node;
        while (currentNode.parent) {
          // Check for TypeScript type contexts
          if (
            currentNode.parent.type === AST_NODE_TYPES.TSTypeReference ||
            currentNode.parent.type ===
              AST_NODE_TYPES.TSTypeParameterInstantiation ||
            currentNode.parent.type === AST_NODE_TYPES.TSUnionType ||
            currentNode.parent.type === AST_NODE_TYPES.TSIntersectionType ||
            currentNode.parent.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
            currentNode.parent.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
            currentNode.parent.type === AST_NODE_TYPES.TSTypeLiteral
          ) {
            return true;
          }
          currentNode = currentNode.parent;
        }
      }

      return false;
    }

    /**
     * Escape a string so it can sit inside a literal delimited by `delimiter`.
     *
     * JSON escaping already covers backslashes, control characters and every
     * other sequence a JavaScript string literal needs, but it is hardcoded to
     * double quotes. For a single-quoted literal the escaping is simply
     * inverted: the double quotes go bare and the apostrophes carry the
     * backslash.
     */
    function escapeForDelimiter(text: string, delimiter: string): string {
      const jsonBody = JSON.stringify(text).slice(1, -1);
      if (delimiter === '"') {
        return jsonBody;
      }
      // Every `"` in a JSON body is escaped and every `\` belongs to an escape
      // sequence, so unescaping the quotes first cannot corrupt a `\\` pair.
      return jsonBody.replace(/\\"/g, '"').replace(/'/g, "\\'");
    }

    /**
     * Rebuild a string literal around the corrected text, keeping the quote
     * character the author chose. Rewriting the delimiter is a formatting
     * regression on every fixed file, so the fix has to reuse it.
     */
    function fixStringLiteral(
      node: TSESTree.Literal,
      fixedText: string,
    ): string | null {
      const raw = sourceCode.getText(node);
      const delimiter = raw[0];
      if (delimiter !== "'" && delimiter !== '"') {
        return null;
      }

      const rawBody = raw.slice(1, -1);
      const isJsxAttributeValue =
        node.parent && node.parent.type === AST_NODE_TYPES.JSXAttribute;

      // Substituting inside the raw source reproduces the file byte for byte,
      // so take that path whenever the source between the quotes already is the
      // parsed value. It is also the only safe path for a JSX attribute value,
      // which the parser does not escape-process: there a backslash is a
      // literal character (rebuilding would double it) and an entity such as
      // &quot; decodes to a delimiter that cannot be written back escaped.
      if (rawBody === node.value || isJsxAttributeValue) {
        idRegex.lastIndex = 0;
        const fixedBody = rawBody.replace(
          idRegex,
          (_match, prefix, suffix) => `${prefix}ID${suffix}`,
        );
        // An entity-bearing JSX value can carry the match only in its decoded
        // form; report it without a fix rather than emit a no-op replacement.
        return fixedBody === rawBody
          ? null
          : `${delimiter}${fixedBody}${delimiter}`;
      }

      return `${delimiter}${escapeForDelimiter(
        fixedText,
        delimiter,
      )}${delimiter}`;
    }

    /**
     * Check if a string contains "id" as a standalone word and report if found
     */
    function checkForIdInString(node: any, value: string) {
      if (typeof value !== 'string') return;

      // Skip checking if the node is in an excluded context
      if (isExcludedContext(node)) return;

      // Check if this is a variable declaration with a string literal containing 'id'
      if (
        node.type === AST_NODE_TYPES.Literal &&
        node.parent &&
        node.parent.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.init === node &&
        node.parent.id.type === AST_NODE_TYPES.Identifier &&
        node.parent.id.name.toLowerCase().includes('id')
      ) {
        // Skip checking variable assignments where the variable name contains 'id'
        return;
      }

      // Reset the regex lastIndex to ensure consistent behavior
      idRegex.lastIndex = 0;

      // Check if the string contains "id" as a standalone word
      if (idRegex.test(value)) {
        // Reset the regex lastIndex again before replacing
        idRegex.lastIndex = 0;

        const fixedText = value.replace(idRegex, (_match, prefix, suffix) => {
          return `${prefix}ID${suffix}`;
        });

        context.report({
          node,
          messageId: 'enforceIdCapitalization',
          fix: (fixer) => {
            // JSX text carries no delimiters, so its own text is the content.
            if (node.type === AST_NODE_TYPES.JSXText) {
              return fixer.replaceText(node, fixedText);
            }
            if (node.type === AST_NODE_TYPES.Literal) {
              const replacement = fixStringLiteral(node, fixedText);
              return replacement === null
                ? null
                : fixer.replaceText(node, replacement);
            }
            // Any other node kind (a TemplateElement, say) is a fragment of a
            // larger construct whose delimiters and `${}` expressions live
            // outside this node; rebuilding it from the parsed value would
            // destroy them, so report without a fix.
            return null;
          },
        });
      }
    }

    return {
      // Check string literals
      Literal(node) {
        if (typeof node.value === 'string') {
          checkForIdInString(node, node.value);
        }
      },

      // Check JSX text
      JSXText(node) {
        checkForIdInString(node, node.value);
      },

      // We don't need a separate handler for CallExpression since we already handle Literals
      // The Literal handler will catch the string arguments in t("user.profile.id")
    };
  },
});
