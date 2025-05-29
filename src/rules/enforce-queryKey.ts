import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceQueryKey';

/**
 * Rule to enforce the use of centralized router state key constants imported from `src/util/routing/queryKeys.ts`
 * instead of arbitrary string literals when calling router methods that accept key parameters.
 *
 * This rule addresses the anti-pattern of scattered string literals throughout the codebase for router state management,
 * which leads to inconsistency, typos, and maintenance difficulties.
 */
export const enforceQueryKey = createRule<[], MessageIds>({
  name: 'enforce-queryKey',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceQueryKey:
        'Use centralized router state key constants from src/util/routing/queryKeys.ts instead of string literals',
    },
  },
  defaultOptions: [],
  create(context) {
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
     * Checks if an import is from the queryKeys module
     */
    function isQueryKeysImport(node: TSESTree.ImportDeclaration): boolean {
      const source = node.source.value;
      return typeof source === 'string' &&
        (source === '@/util/routing/queryKeys' ||
         source === 'src/util/routing/queryKeys' ||
         source.endsWith('/util/routing/queryKeys'));
    }

    /**
     * Tracks imported query key constants
     */
    const importedQueryKeys = new Set<string>();

    /**
     * Tracks variables that are assigned imported query key constants
     */
    const queryKeyVariables = new Set<string>();

    /**
     * Tracks variables that are assigned string literals
     */
    const stringLiteralVariables = new Map<string, TSESTree.Node>();

    return {
      // Track imports from queryKeys.ts
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (isQueryKeysImport(node)) {
          // Add all imported specifiers to our tracking set
          for (const specifier of node.specifiers) {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              // Handle both direct imports and aliased imports
              const importedName = specifier.imported.name;
              const localName = specifier.local.name;

              if (importedName.startsWith('QUERY_KEY_')) {
                importedQueryKeys.add(localName);
              }
            }
          }
        }
      },

      // Track variable assignments
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.Identifier) {
          const variableName = node.id.name;

          // Track variables assigned from imported query keys
          if (node.init && node.init.type === AST_NODE_TYPES.Identifier &&
              importedQueryKeys.has(node.init.name)) {
            queryKeyVariables.add(variableName);
          }

          // Track variables assigned from string literals
          if (node.init && containsStringLiteral(node.init)) {
            stringLiteralVariables.set(variableName, node.init);
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
                  prop.key.name === 'key',
              );

              // If key property exists, check its value
              if (keyProperty && keyProperty.value) {
                const keyValue = keyProperty.value;

                // Skip if the key is already using an imported query key constant
                if (keyValue.type === AST_NODE_TYPES.Identifier) {
                  const keyName = keyValue.name;

                  // Allow if it's a direct import or variable assigned from an import
                  if (importedQueryKeys.has(keyName) || queryKeyVariables.has(keyName)) {
                    return;
                  }

                  // Report if it's a variable assigned from a string literal
                  if (stringLiteralVariables.has(keyName)) {
                    context.report({
                      node: keyValue,
                      messageId: 'enforceQueryKey',
                    });
                    return;
                  }
                }

                // Check for string literals in various contexts
                if (containsStringLiteral(keyValue)) {
                  context.report({
                    node: keyValue,
                    messageId: 'enforceQueryKey',
                    // We can't provide an auto-fix because we don't know which constant to import
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
