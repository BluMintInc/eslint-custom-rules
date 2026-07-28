import {
  AST_NODE_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceQueryKeyImport' | 'enforceQueryKeyConstant';

/**
 * The canonical queryKeys module. The rule takes no options and already hard-codes
 * this path as what makes a key valid, so the fixer writes the very same path
 * instead of guessing one when a file has no queryKeys import to copy from.
 */
const DEFAULT_QUERY_KEYS_SOURCE = '@/util/routing/queryKeys';

/**
 * What the substituted `QUERY_KEY_*` name would resolve to once the fix lands.
 */
type BindingState =
  /** Already imported from queryKeys.ts; only the literal has to change. */
  | 'bound'
  /** Nothing owns the name, so the fix must bring the import with it. */
  | 'missing'
  /** Something unrelated owns the name; substituting would silently repoint the key. */
  | 'conflict';

type PendingReport = {
  node: TSESTree.Node;
  messageId: MessageIds;
  data?: { variableName: string };
  /** Present only for the string-literal case, which is the fixable one. */
  substitution?: {
    keyNode: TSESTree.Literal;
    constant: string;
    scope: TSESLint.Scope.Scope;
  };
};

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
        'Router state key must come from queryKeys.ts (e.g., "@/util/routing/queryKeys", "src/util/routing/queryKeys", or a relative path ending in "/util/routing/queryKeys"). Use a QUERY_KEY_* constant instead of string literals.',
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
    const localUseRouterStateNames = new Set<string>(['useRouterState']);
    const validQueryKeySources = new Set([
      DEFAULT_QUERY_KEYS_SOURCE,
      'src/util/routing/queryKeys',
    ]);

    const allowedQueryKeyFactories = new Set(['makeQueryKey', 'getQueryKey']);

    const sourceCode = context.getSourceCode();

    /**
     * Reports are buffered until the whole file has been walked so the fixer can
     * put every substituted constant into a single import instead of racing
     * per-violation insertions that overlap and get dropped.
     */
    const pendingReports: PendingReport[] = [];

    /**
     * `SourceCode#getScope` supersedes the deprecated `context.getScope`; the
     * fallback keeps the rule working on ESLint versions that predate it.
     */
    function scopeOf(node: TSESTree.Node): TSESLint.Scope.Scope {
      const scoped = sourceCode as TSESLint.SourceCode & {
        getScope?: (node: TSESTree.Node) => TSESLint.Scope.Scope;
      };
      return typeof scoped.getScope === 'function'
        ? scoped.getScope(node)
        : context.getScope();
    }

    /**
     * Check if a source path refers to queryKeys.ts
     */
    function isQueryKeysSource(source: string): boolean {
      return (
        validQueryKeySources.has(source) ||
        source.endsWith('/util/routing/queryKeys')
      );
    }

    function importDeclarationsOf(): TSESTree.ImportDeclaration[] {
      return sourceCode.ast.body.filter(
        (statement): statement is TSESTree.ImportDeclaration =>
          statement.type === AST_NODE_TYPES.ImportDeclaration &&
          typeof statement.source.value === 'string',
      );
    }

    function isValueImportSpecifier(
      specifier: TSESTree.ImportClause,
    ): specifier is TSESTree.ImportSpecifier {
      return (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type'
      );
    }

    /**
     * A file that already imports the export under another name reaches it
     * through that name; re-importing it would leave two bindings for one
     * constant.
     */
    function localNameOf(constant: string): string {
      for (const declaration of importDeclarationsOf()) {
        if (
          declaration.importKind === 'type' ||
          !isQueryKeysSource(String(declaration.source.value))
        ) {
          continue;
        }
        for (const specifier of declaration.specifiers) {
          if (
            isValueImportSpecifier(specifier) &&
            specifier.imported.name === constant
          ) {
            return specifier.local.name;
          }
        }
      }
      return constant;
    }

    /**
     * Decide whether the suggested constant can be substituted, and whether the
     * substitution has to carry an import with it.
     */
    function resolveBinding(
      scope: TSESLint.Scope.Scope,
      constant: string,
    ): BindingState {
      const variable = ASTUtils.findVariable(scope, constant);
      if (!variable) {
        return 'missing';
      }
      const [definition] = variable.defs;
      if (!definition) {
        return 'conflict';
      }
      const definitionNode = definition.node;
      if (
        definitionNode.type !== AST_NODE_TYPES.ImportSpecifier ||
        definitionNode.importKind === 'type' ||
        !isValidQueryKeyConstant(definitionNode.imported.name)
      ) {
        return 'conflict';
      }
      const declaration = definitionNode.parent;
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.ImportDeclaration ||
        declaration.importKind === 'type' ||
        typeof declaration.source.value !== 'string' ||
        !isQueryKeysSource(declaration.source.value)
      ) {
        return 'conflict';
      }
      return 'bound';
    }

    /**
     * Make the substituted constants resolve: extend the file's queryKeys import
     * when there is one to extend, otherwise add a fresh import statement.
     */
    function buildImportFix(
      fixer: TSESLint.RuleFixer,
      constants: string[],
    ): TSESLint.RuleFix {
      const importDeclarations = importDeclarationsOf();
      const queryKeysDeclarations = importDeclarations.filter((declaration) =>
        isQueryKeysSource(String(declaration.source.value)),
      );

      const reusable = queryKeysDeclarations.find(
        (declaration) =>
          declaration.importKind !== 'type' &&
          declaration.specifiers.some(isValueImportSpecifier),
      );
      if (reusable) {
        const namedSpecifiers = reusable.specifiers.filter(
          isValueImportSpecifier,
        );
        const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
        return fixer.insertTextAfter(
          lastSpecifier,
          constants.map((constant) => `, ${constant}`).join(''),
        );
      }

      // A namespace or type-only queryKeys import cannot take named value
      // specifiers, but its path is proof of how this file reaches the module.
      const source = queryKeysDeclarations.length
        ? String(queryKeysDeclarations[0].source.value)
        : DEFAULT_QUERY_KEYS_SOURCE;
      const importText = `import { ${constants.join(
        ', ',
      )} } from '${source}';\n`;

      const [firstImport] = importDeclarations;
      if (firstImport) {
        return fixer.insertTextBefore(firstImport, importText);
      }
      // Keep the import visually separated from the code it precedes unless the
      // file already opens with a blank line.
      const separator = /^\r?\n/.test(sourceCode.text) ? '' : '\n';
      return fixer.insertTextBeforeRange([0, 0], `${importText}${separator}`);
    }

    function flushReports(): void {
      const resolutions = new Map<
        PendingReport,
        { name: string; state: BindingState }
      >();
      const missingConstants: string[] = [];

      for (const report of pendingReports) {
        if (!report.substitution) {
          continue;
        }
        const { constant, scope } = report.substitution;
        const name = localNameOf(constant);
        const state = resolveBinding(scope, name);
        resolutions.set(report, { name, state });
        if (state === 'missing' && !missingConstants.includes(name)) {
          missingConstants.push(name);
        }
      }

      // The first applied substitution carries the import for every other one:
      // its fix range then starts at the top of the file and ends before the
      // remaining literals, so no two fixes of this rule overlap in a pass.
      const importCarrier = pendingReports.find((report) => {
        const resolution = resolutions.get(report);
        return resolution !== undefined && resolution.state !== 'conflict';
      });

      for (const report of pendingReports) {
        context.report({
          node: report.node,
          messageId: report.messageId,
          data: report.data,
          fix(fixer) {
            const { substitution } = report;
            const resolution = resolutions.get(report);
            if (
              !substitution ||
              !resolution ||
              resolution.state === 'conflict'
            ) {
              return null;
            }
            const fixes = [
              fixer.replaceText(substitution.keyNode, resolution.name),
            ];
            if (report === importCarrier && missingConstants.length > 0) {
              fixes.unshift(buildImportFix(fixer, missingConstants));
            }
            return fixes;
          },
        });
      }
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
        const member = node;
        if (
          member.object.type === AST_NODE_TYPES.Identifier &&
          !member.computed &&
          member.property.type === AST_NODE_TYPES.Identifier
        ) {
          const importInfo = queryKeyImports.get(member.object.name);
          if (importInfo && isQueryKeysSource(importInfo.source)) {
            if (importInfo.imported === '*') {
              return isValidQueryKeyConstant(member.property.name);
            }
            return isValidQueryKeyConstant(member.property.name);
          }
        }
      }

      // Allow template literals only when they contain no static content and all expressions are valid
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });

        if (node.expressions.length === 0) {
          // Pure static template acts like a string literal
          return false;
        }

        if (hasSignificantStaticPart) {
          return false;
        }

        return node.expressions.some((expr) => isValidQueryKeyUsage(expr));
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
        const callee = node.callee;
        if (callee.type === AST_NODE_TYPES.Identifier) {
          return allowedQueryKeyFactories.has(callee.name);
        }
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          return allowedQueryKeyFactories.has(callee.property.name);
        }
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

      // Template literal handling
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        const hasSignificantStaticPart = node.quasis.some((quasi) => {
          const content = quasi.value.raw.trim();
          return content.length > 0 && !/^[-_:/.]+$/.test(content);
        });

        if (node.expressions.length === 0) {
          // Pure static template behaves like a string literal
          return hasSignificantStaticPart;
        }

        // Any meaningful static content makes this invalid regardless of expressions
        if (hasSignificantStaticPart) {
          return true;
        }

        // Only dynamic parts remain; all expressions must be valid query key usages
        return !node.expressions.every((expr) => isValidQueryKeyUsage(expr));
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
              } else if (
                spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
              ) {
                const local = spec.local.name;
                queryKeyImports.set(local, { source, imported: '*' });
              }
            });
          }

          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === 'useRouterState'
            ) {
              localUseRouterStateNames.add(spec.local.name);
            }
          });
        }
      },

      // Track variable declarations that might derive from query key constants
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init) {
          variableAssignments.set(node.id.name, node.init);
        }
      },

      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        if (node.left.type === AST_NODE_TYPES.Identifier && node.right) {
          variableAssignments.set(node.left.name, node.right);
        }
      },

      // Check useRouterState calls
      CallExpression(node: TSESTree.CallExpression) {
        // Check if this is a call to useRouterState
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          localUseRouterStateNames.has(node.callee.name)
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
                    // Only simple string literals can be auto-fixed
                    const suggestedConstant =
                      keyValue.type === AST_NODE_TYPES.Literal &&
                      typeof keyValue.value === 'string'
                        ? generateAutoFix(keyValue.value)
                        : null;
                    pendingReports.push({
                      node: keyValue,
                      messageId: 'enforceQueryKeyImport',
                      substitution:
                        suggestedConstant &&
                        keyValue.type === AST_NODE_TYPES.Literal
                          ? {
                              keyNode: keyValue,
                              constant: suggestedConstant,
                              scope: scopeOf(keyValue),
                            }
                          : undefined,
                    });
                  } else if (keyValue.type === AST_NODE_TYPES.Identifier) {
                    // Report variables that aren't from the correct source
                    pendingReports.push({
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

      'Program:exit'() {
        flushReports();
      },
    };
  },
});
