import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceQueryKeyImport' | 'enforceQueryKeyConstant';

/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export const enforceQueryKeyTs = createRule<[], MessageIds>({
  name: 'enforce-querykey-ts',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceQueryKeyImport:
        'Router state key must be imported from "@/util/routing/queryKeys" or "src/util/routing/queryKeys". Use a QUERY_KEY_* constant instead of string literals.',
      enforceQueryKeyConstant:
        'Router state key must use a QUERY_KEY_* constant from queryKeys.ts. Variable "{{variableName}}" is not imported from the correct source.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track imports from queryKeys.ts
    const queryKeyImports = new Map<
      string,
      { source: string; imported: string }
    >();
    const validQueryKeySources = new Set([
      '@/util/routing/queryKeys',
      'src/util/routing/queryKeys',
      './util/routing/queryKeys',
      '../util/routing/queryKeys',
      '../../util/routing/queryKeys',
      '../../../util/routing/queryKeys',
      '../../../../util/routing/queryKeys',
    ]);

    /**
     * Check if a source path refers to queryKeys.ts
     */
    function isQueryKeysSource(source: string): boolean {
      return (
        validQueryKeySources.has(source) ||
        source.endsWith('/util/routing/queryKeys')
      );
    }

    /**
     * Check if an identifier is a valid QUERY_KEY constant
     */
    function isValidQueryKeyConstant(name: string): boolean {
      return name.startsWith('QUERY_KEY_');
    }

    /**
     * Track variable assignments to detect variables derived from query key constants
     */
    const variableAssignments = new Map<string, TSESTree.Node>();

    /**
     * Check if a node represents a valid query key usage
     */
    function isValidQueryKeyUsage(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        const importInfo = queryKeyImports.get(node.name);
        if (importInfo && isQueryKeysSource(importInfo.source)) {
          return isValidQueryKeyConstant(importInfo.imported);
        }

        // Check if it's a variable derived from a query key constant
        const assignment = variableAssignments.get(node.name);
        if (assignment) {
          return isValidQueryKeyUsage(assignment);
        }
      }

      // Allow member expressions accessing query key constants
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        if (node.object.type === AST_NODE_TYPES.Identifier) {
          const importInfo = queryKeyImports.get(node.object.name);
          if (importInfo && isQueryKeysSource(importInfo.source)) {
            return true;
          }
        }
      }

      // Allow template literals if they use valid query keys
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        // If there are expressions, at least one should be a valid query key
        if (node.expressions.length > 0) {
          return node.expressions.some((expr) => isValidQueryKeyUsage(expr));
        }
        // If no expressions, it's just a static template literal (should be invalid)
        return false;
      }

      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+'
      ) {
        return (
          isValidQueryKeyUsage(node.left) || isValidQueryKeyUsage(node.right)
        );
      }

      // Allow conditional expressions if both branches use valid query keys
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          isValidQueryKeyUsage(node.consequent) &&
          isValidQueryKeyUsage(node.alternate)
        );
      }

      // Allow function calls that might return query keys
      if (node.type === AST_NODE_TYPES.CallExpression) {
        // This is a more permissive approach - we assume function calls might be valid
        // In a real implementation, you might want to be more strict
        return true;
      }

      return false;
    }

    /**
     * Check if a node contains string literals that should be reported
     */
    function containsInvalidStringLiteral(node: TSESTree.Node): boolean {
      // Direct string literal
      if (
        node.type === AST_NODE_TYPES.Literal &&
        typeof node.value === 'string'
      ) {
        return true;
      }

      // String concatenation with + operator containing literals
      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        node.operator === '+'
      ) {
        return (
          containsInvalidStringLiteral(node.left) ||
          containsInvalidStringLiteral(node.right)
        );
      }

      // Conditional (ternary) expression with string literals
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          containsInvalidStringLiteral(node.consequent) ||
          containsInvalidStringLiteral(node.alternate)
        );
      }

      // Template literal with static parts (but allow if it uses query key variables)
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });
        if (hasSignificantStaticPart) {
          // Check if expressions use valid query keys
          return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
        }
      }

      return false;
    }

    /**
     * Generate auto-fix suggestion for string literals
     */
    function generateAutoFix(keyValue: string): string | null {
      // Simple heuristic to suggest query key constant names
      const normalizedKey = keyValue
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');

      return `QUERY_KEY_${normalizedKey}`;
    }

    return {
      // Track imports from queryKeys.ts
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === 'string'
        ) {
          const source = node.source.value;
          if (isQueryKeysSource(source)) {
            node.specifiers.forEach((spec) => {
              if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
                const imported = spec.imported.name;
                const local = spec.local.name;
                queryKeyImports.set(local, { source, imported });
              }
            });
          }
        }
      },

      // Track variable declarations that might derive from query key constants
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
          variableAssignments.set(node.id.name, node.init);
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

                // Check if it's a valid query key usage
                if (!isValidQueryKeyUsage(keyValue)) {
                  // Check if it contains invalid string literals
                  if (containsInvalidStringLiteral(keyValue)) {
                    context.report({
                      node: keyValue,
                      messageId: 'enforceQueryKeyImport',
                      fix(fixer) {
                        // Only provide auto-fix for simple string literals
                        if (
                          keyValue.type === AST_NODE_TYPES.Literal &&
                          typeof keyValue.value === 'string'
                        ) {
                          const suggestedConstant = generateAutoFix(
                            keyValue.value,
                          );
                          if (suggestedConstant) {
                            return fixer.replaceText(
                              keyValue,
                              suggestedConstant,
                            );
                          }
                        }
                        return null;
                      },
                    });
                  } else if (keyValue.type === AST_NODE_TYPES.Identifier) {
                    // Report variables that aren't from the correct source
                    context.report({
                      node: keyValue,
                      messageId: 'enforceQueryKeyConstant',
                      data: {
                        variableName: keyValue.name,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },
    };
  },
});
