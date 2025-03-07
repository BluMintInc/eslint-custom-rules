import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

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
        'Use "ID" instead of "id" in user-facing text for better readability',
    },
  },
  defaultOptions: [],
  create(context) {
    // Regular expression to match standalone "id" surrounded by whitespace or punctuation
    // This ensures we only match "id" as a word, not as part of another word
    const idRegex = /(^|\s|[.,;:!?'"()\[\]{}])id(\s|$|[.,;:!?'"()\[\]{}])/g;

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
     * Check if a string contains "id" as a standalone word and report if found
     */
    function checkForIdInString(node: any, value: string) {
      if (typeof value !== 'string') return;

      // Skip checking if the node is in an excluded context
      if (isExcludedContext(node)) return;

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
            if (node.type === AST_NODE_TYPES.Literal) {
              return fixer.replaceText(node, JSON.stringify(fixedText));
            } else if (node.type === AST_NODE_TYPES.JSXText) {
              return fixer.replaceText(node, fixedText);
            } else if (node.type === AST_NODE_TYPES.TemplateElement) {
              return fixer.replaceText(node, fixedText);
            }
            return fixer.replaceText(node, JSON.stringify(fixedText));
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
