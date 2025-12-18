import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferGlobalRouterStateKey' | 'invalidQueryKeySource';

/**
 * Rule to enforce the use of centralized router state key constants imported from
 * `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling
 * router methods that accept key parameters.
 */
export const preferGlobalRouterStateKey = createRule<[], MessageIds>({
  name: 'prefer-global-router-state-key',
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
      preferGlobalRouterStateKey:
        'Router state key {{keyValue}} is a string literal. String literals bypass the shared queryKeys.ts QUERY_KEY_* constants, which leads to duplicate router cache entries and makes allowed keys hard to discover. Import the corresponding QUERY_KEY_* constant from "@/util/routing/queryKeys" (or its approved re-export) and pass that to useRouterState instead.',
      invalidQueryKeySource:
        'Router state key variable "{{variableName}}" is not sourced from queryKeys.ts. useRouterState keys must come from QUERY_KEY_* exports so routing cache keys stay stable and traceable. Import the matching constant from "@/util/routing/queryKeys" (or its approved re-export) and use that value here instead of {{variableName}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // Track imports from queryKeys.ts
    const queryKeyImports = new Map<
      string,
      {
        source: string;
        imported: string;
        isNamespace?: boolean;
        isDefault?: boolean;
      }
    >();

    // Track namespace imports (import * as QueryKeys from ...)
    const namespaceImports = new Map<string, string>();

    // Track default imports (import queryKeys from ...)
    const defaultImports = new Map<string, string>();

    // Track re-exports and variable assignments
    const variableAssignments = new Map<string, TSESTree.Node>();

    const validQueryKeySources = new Set<string>([
      'util/routing/queryKeys',
      'constants',
      'constants/index',
    ]);

    /**
     * Check if a source path refers to queryKeys.ts or re-exports from it
     */
    function isQueryKeysSource(source: string): boolean {
      const normalized = source
        .replace(/^@\/|^src\//, '')
        .replace(/^(\.\/|\.\.\/)+/, '');

      return (
        validQueryKeySources.has(normalized) ||
        normalized.endsWith('util/routing/queryKeys')
      );
    }

    /**
     * Check if an identifier is a valid QUERY_KEY constant
     */
    function isValidQueryKeyConstant(name: string): boolean {
      return name.startsWith('QUERY_KEY_');
    }

    /**
     * Check if a node represents a valid query key usage
     */
    function isValidQueryKeyUsage(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        // Check direct imports
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
          // Check namespace imports (QueryKeys.QUERY_KEY_USER)
          const namespaceSource = namespaceImports.get(node.object.name);
          if (namespaceSource && isQueryKeysSource(namespaceSource)) {
            if (node.property.type === AST_NODE_TYPES.Identifier) {
              return isValidQueryKeyConstant(node.property.name);
            }
            return false; // Invalid property access on namespace import
          }

          // Check default imports (queryKeys.QUERY_KEY_USER)
          const defaultSource = defaultImports.get(node.object.name);
          if (defaultSource && isQueryKeysSource(defaultSource)) {
            return true; // Allow any property access on default imports
          }

          // Check regular imports
          const importInfo = queryKeyImports.get(node.object.name);
          if (importInfo && isQueryKeysSource(importInfo.source)) {
            return true;
          }
        }
      }

      // Allow template literals if they use valid query keys
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        if (node.expressions.length > 0) {
          return node.expressions.some((expr) => isValidQueryKeyUsage(expr));
        }
        // Template literals with no expressions are just static strings
        return false;
      }

      // Allow binary expressions if they use valid query keys
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
        return true; // Permissive for function calls
      }

      // Allow type assertions (key as const)
      if (node.type === AST_NODE_TYPES.TSAsExpression) {
        return isValidQueryKeyUsage(node.expression);
      }

      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return false;
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
        // If no expressions, it's just a static template literal
        if (node.expressions.length === 0) {
          return true;
        }

        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });
        if (hasSignificantStaticPart) {
          return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
        }
      }

      return false;
    }

    /**
     * Generate auto-fix suggestion for string literals
     */
    function generateAutoFix(keyValue: string): string | null {
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
              } else if (
                spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
              ) {
                namespaceImports.set(spec.local.name, source);
              } else if (spec.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
                defaultImports.set(spec.local.name, source);
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

      // Track assignment expressions
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.operator === '='
        ) {
          variableAssignments.set(node.left.name, node.right);
        }
      },

      // Check useRouterState calls
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a call to useRouterState
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useRouterState'
        ) {
          if (node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            if (firstArg.type === AST_NODE_TYPES.ObjectExpression) {
              const keyProperty = firstArg.properties.find(
                (prop): prop is TSESTree.Property =>
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'key',
              );

              if (keyProperty && keyProperty.value) {
                const keyValue = keyProperty.value;

                if (!isValidQueryKeyUsage(keyValue)) {
                  if (containsInvalidStringLiteral(keyValue)) {
                    context.report({
                      node: keyValue,
                      messageId: 'preferGlobalRouterStateKey',
                      data: {
                        keyValue: sourceCode.getText(keyValue),
                      },
                      fix(fixer) {
                        if (
                          keyValue.type === AST_NODE_TYPES.Literal &&
                          typeof keyValue.value === 'string'
                        ) {
                          const suggestedConstant = generateAutoFix(
                            keyValue.value,
                          );
                          if (suggestedConstant) {
                            const fixes: TSESLint.RuleFix[] = [];

                            const namespaceAlias = Array.from(
                              namespaceImports.entries(),
                            ).find(([, source]) =>
                              isQueryKeysSource(source),
                            )?.[0];
                            const defaultAlias = Array.from(
                              defaultImports.entries(),
                            ).find(([, source]) =>
                              isQueryKeysSource(source),
                            )?.[0];
                            const importAlias = namespaceAlias ?? defaultAlias;
                            const formatConstantReference = (
                              alias: string | undefined,
                              constant: string,
                            ): string =>
                              alias ? `${alias}.${constant}` : constant;
                            const replacementText = formatConstantReference(
                              importAlias,
                              suggestedConstant,
                            );

                            // 1) Replace the literal with the constant (qualify if alias exists)
                            fixes.push(
                              fixer.replaceText(keyValue, replacementText),
                            );

                            // 2) Ensure an import exists for the suggested constant
                            const alreadyImportedNamed = Array.from(
                              queryKeyImports.values(),
                            ).some(
                              (info) =>
                                isQueryKeysSource(info.source) &&
                                info.imported === suggestedConstant,
                            );
                            const hasNamespaceOrDefault = Boolean(importAlias);

                            if (
                              !alreadyImportedNamed &&
                              !hasNamespaceOrDefault
                            ) {
                              const importText = `import { ${suggestedConstant} } from '@/util/routing/queryKeys';\n`;
                              const firstImport = sourceCode.ast.body.find(
                                (n): n is TSESTree.ImportDeclaration =>
                                  n.type === AST_NODE_TYPES.ImportDeclaration,
                              );

                              if (firstImport) {
                                fixes.push(
                                  fixer.insertTextBefore(
                                    firstImport,
                                    importText,
                                  ),
                                );
                              } else {
                                const { body } = sourceCode.ast;
                                let lastDirective:
                                  | TSESTree.ExpressionStatement
                                  | undefined;

                                for (const stmt of body) {
                                  if (
                                    stmt.type ===
                                      AST_NODE_TYPES.ExpressionStatement &&
                                    stmt.expression.type ===
                                      AST_NODE_TYPES.Literal &&
                                    typeof stmt.expression.value === 'string' &&
                                    typeof stmt.directive === 'string'
                                  ) {
                                    lastDirective = stmt;
                                    continue;
                                  }
                                  break;
                                }

                                if (lastDirective) {
                                  fixes.push(
                                    fixer.insertTextAfter(
                                      lastDirective,
                                      `\n${importText}`,
                                    ),
                                  );
                                } else {
                                  fixes.push(
                                    fixer.insertTextBeforeRange(
                                      [0, 0],
                                      importText,
                                    ),
                                  );
                                }
                              }
                            }

                            return fixes;
                          }
                        }
                        return null;
                      },
                    });
                  } else if (keyValue.type === AST_NODE_TYPES.Identifier) {
                    context.report({
                      node: keyValue,
                      messageId: 'invalidQueryKeySource',
                      data: {
                        variableName: keyValue.name,
                      },
                    });
                  } else if (
                    keyValue.type === AST_NODE_TYPES.MemberExpression
                  ) {
                    context.report({
                      node: keyValue,
                      messageId: 'invalidQueryKeySource',
                      data: {
                        variableName: sourceCode.getText(keyValue),
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
