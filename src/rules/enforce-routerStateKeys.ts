import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceRouterStateKeys' | 'missingImport';

const ROUTER_STATE_KEYS_PATH = '@/util/routing/routerStateKeys';
const QUERY_KEY_NAMESPACE = 'QueryKey';

/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/routerStateKeys.ts` instead of arbitrary string literals when
 * calling router methods that accept key parameters.
 */
export const enforceRouterStateKeys = createRule<[], MessageIds>({
  name: 'enforce-routerStateKeys',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of centralized router state key constants from routerStateKeys.ts',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceRouterStateKeys:
        'Use QueryKey constants from @/util/routing/routerStateKeys.ts instead of string literals for router state keys',
      missingImport:
        'Import QueryKey from @/util/routing/routerStateKeys.ts to use centralized router state keys',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track if the file has imported QueryKey from the correct path
    let hasImportedQueryKey = false;
    let queryKeyAlias: string | null = null;

    /**
     * Checks if a node contains a string literal that should be reported
     */
    function containsStringLiteral(node: TSESTree.Node): boolean {
      // Direct string literal
      if (
        node.type === AST_NODE_TYPES.Literal &&
        typeof node.value === 'string'
      ) {
        return true;
      }

      // String concatenation with + operator
      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+' &&
        (containsStringLiteral(node.left) || containsStringLiteral(node.right))
      ) {
        return true;
      }

      // Conditional (ternary) expression with string literals
      if (
        node.type === AST_NODE_TYPES.ConditionalExpression &&
        (containsStringLiteral(node.consequent) ||
          containsStringLiteral(node.alternate))
      ) {
        return true;
      }

      // Template literal with static parts
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        // Only report if there's a meaningful static part in the template
        // This allows dynamic templates like `${prefix}-${id}` but catches `static-${id}`
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          // Allow common separators like '-', '_', ':', '/' as they're just joining dynamic parts
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });
        return hasSignificantStaticPart;
      }

      return false;
    }

    /**
     * Checks if a node is a reference to the QueryKey namespace
     */
    function isQueryKeyReference(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return node.name === QUERY_KEY_NAMESPACE || node.name === queryKeyAlias;
      }

      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier
      ) {
        return (
          node.object.name === QUERY_KEY_NAMESPACE ||
          node.object.name === queryKeyAlias
        );
      }

      return false;
    }

    /**
     * Converts a string literal to a suggested QueryKey constant name
     */
    function suggestQueryKeyConstant(value: string): string {
      // Convert kebab-case or snake_case to UPPER_SNAKE_CASE
      return value
        .replace(/[-]/g, '_') // Replace hyphens with underscores
        .toUpperCase();
    }

    return {
      // Track imports of QueryKey from the correct path
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.value === ROUTER_STATE_KEYS_PATH ||
          // Also check for relative imports that might end with the correct path
          node.source.value.endsWith('/routerStateKeys')
        ) {
          // Check for namespace imports like: import * as RouterKeys from '...'
          const namespaceImport = node.specifiers.find(
            (s): s is TSESTree.ImportNamespaceSpecifier =>
              s.type === AST_NODE_TYPES.ImportNamespaceSpecifier
          );
          if (namespaceImport) {
            queryKeyAlias = namespaceImport.local.name;
            hasImportedQueryKey = true;
            return;
          }

          // Check for named imports like: import { QueryKey } from '...'
          // or import { QueryKey as RouterKeys } from '...'
          const namedImport = node.specifiers.find(
            (s): s is TSESTree.ImportSpecifier =>
              s.type === AST_NODE_TYPES.ImportSpecifier &&
              s.imported.type === AST_NODE_TYPES.Identifier &&
              s.imported.name === QUERY_KEY_NAMESPACE
          );
          if (namedImport) {
            queryKeyAlias = namedImport.local.name;
            hasImportedQueryKey = true;
            return;
          }
        }
      },

      // Check useRouterState calls
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a call to useRouterState
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useRouterState'
        ) {
          // Check if there are arguments
          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if the first argument is an object expression
            if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
              // Find the key property in the object
              const keyProperty = firstArg.properties.find(
                (prop): prop is TSESTree.Property =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'key'
              );

              // If key property exists, check its value
              if (keyProperty && keyProperty.value) {
                const keyValue = keyProperty.value;

                // Skip if it's already using QueryKey
                if (isQueryKeyReference(keyValue)) {
                  return;
                }

                // Check for string literals in various contexts
                if (containsStringLiteral(keyValue)) {
                  // If we haven't imported QueryKey, report that first
                  if (!hasImportedQueryKey) {
                    context.report({
                      node: keyValue,
                      messageId: 'missingImport',
                    });
                    return;
                  }

                  // Get the string value if it's a direct string literal
                  let stringValue: string | null = null;
                  if (
                    keyValue.type === AST_NODE_TYPES.Literal &&
                    typeof keyValue.value === 'string'
                  ) {
                    stringValue = keyValue.value;
                  }

                  context.report({
                    node: keyValue,
                    messageId: 'enforceRouterStateKeys',
                    fix(fixer) {
                      // Only provide a fix if we have a direct string literal and QueryKey is imported
                      if (
                        hasImportedQueryKey &&
                        stringValue !== null &&
                        keyValue.type === AST_NODE_TYPES.Literal
                      ) {
                        const suggestedConstant = suggestQueryKeyConstant(stringValue);
                        const queryKeyRef = queryKeyAlias || QUERY_KEY_NAMESPACE;
                        return fixer.replaceText(
                          keyValue,
                          `${queryKeyRef}.${suggestedConstant}`
                        );
                      }
                      return null;
                    },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});
