import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';

type MessageIds = 'requireMemoize';
type Options = [];

const MEMOIZE_MODULE = '@blumintinc/typescript-memoize';
const ALLOWED_MEMOIZE_MODULES = new Set([MEMOIZE_MODULE, 'typescript-memoize']);
const MEMOIZE_NAME = 'Memoize';

/**
 * A named specifier that binds `Memoize` under its own name — the only shape
 * that makes a bare `@Memoize()` decorator resolve to the decorator factory. An
 * alias (`import { Memoize as Cache }`) leaves the name free for the injected
 * import, and a type-only specifier erases at compile time, so neither backs a
 * value reference.
 */
function isMemoizeSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === MEMOIZE_NAME &&
    specifier.local.name === MEMOIZE_NAME
  );
}

/**
 * Whether every declaration of a visible `Memoize` binding is a value import of
 * the decorator itself. A local const/function/class, an enclosing class of the
 * same name, a parameter, a namespace or default import, or a named import from
 * any other module all mean the emitted `@Memoize()` would resolve somewhere
 * other than the decorator factory.
 */
function bindsMemoize(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isMemoizeSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        ALLOWED_MEMOIZE_MODULES.has(String(declaration.source.value))
      );
    })
  );
}

/**
 * Whether a declared return type annotation promises no value: `void` or
 * `Promise<void>`.
 *
 * Memoizing such a method caches nothing — there is no result to hand back —
 * while changing runtime behaviour: the side effects run once per instance and
 * every later call silently no-ops. Because the decision comes from the
 * annotation node, spacing and line breaks inside the type are irrelevant.
 *
 * The check stays keyed to a plain `void`: a union (`Promise<void | undefined>`)
 * or a type parameter (`Promise<T>`) can resolve to a value, so those still
 * warrant caching. Absent annotations are likewise not exempt — this rule is
 * syntactic (no `parserOptions.project`), so an unannotated body carries no
 * declaration of intent to honour, and exempting inferred void would silently
 * drop methods the author never marked value-less.
 */
function declaresVoidResult(
  returnType: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  const annotation = returnType?.typeAnnotation;
  if (!annotation) {
    return false;
  }
  if (annotation.type === AST_NODE_TYPES.TSVoidKeyword) {
    return true;
  }
  if (
    annotation.type !== AST_NODE_TYPES.TSTypeReference ||
    annotation.typeName.type !== AST_NODE_TYPES.Identifier ||
    annotation.typeName.name !== 'Promise'
  ) {
    return false;
  }
  const typeArguments = annotation.typeParameters?.params;
  return (
    typeArguments?.length === 1 &&
    typeArguments[0].type === AST_NODE_TYPES.TSVoidKeyword
  );
}

/**
 * Matches a memoize decorator in supported syntaxes:
 * - @Alias()
 * - @Alias
 * - @ns.Alias
 */
function isMemoizeDecorator(
  decorator: TSESTree.Decorator,
  alias: string,
): boolean {
  const expression = decorator.expression;
  /* @Alias() */
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    const callee = expression.callee;
    return (
      (callee.type === AST_NODE_TYPES.Identifier && callee.name === alias) ||
      (callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === alias)
    );
  }
  /* @Alias */
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name === alias;
  }
  /* @ns.Alias */
  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.property.name === alias;
  }
  return false;
}

export const enforceMemoizeAsync = createRule<Options, MessageIds>({
  name: 'enforce-memoize-async',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce @Memoize() decorator on async methods with 0-1 parameters to cache results and prevent redundant API calls or expensive computations. Without memoization, repeated calls trigger redundant requests or expensive computations, increasing latency. @Memoize() caches results by parameter, ensuring subsequent calls with identical inputs return immediately.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoize:
        'Async methods with 0-1 parameters should be decorated with @Memoize(). Without memoization, repeated calls trigger redundant network requests or expensive computations, increasing latency and risk of rate-limiting. @Memoize() caches results by parameter, ensuring subsequent calls with identical inputs return immediately. Fix: add @Memoize() above the method and import Memoize from "@blumintinc/typescript-memoize".',
    },
  },
  defaultOptions: [],
  create(context) {
    let scheduledImportFix = false;

    /**
     * The `import { Memoize }` statement rides on a single violation's fix, so
     * that violation is the file's import carrier. A suppressed carrier would
     * take the import down with it while the surviving violations still emit
     * `@Memoize()`, leaving a decorator with no import.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * Memoize bindings the file already imports, keyed by local name: aliases
     * for `import { Memoize as X }` and namespaces for `import * as X`.
     *
     * Read off `Program.body` rather than accumulated by an `ImportDeclaration`
     * visitor, because a class that precedes the import declaration in source
     * order is visited — and fixed — before that visitor runs, and would be
     * judged against state recorded for no import at all. The AST is fixed for
     * the pass, so a single scan serves every violation.
     */
    const readMemoizeImports = () => {
      const aliases = new Map<string, string>();
      const namespaces = new Map<string, string>();
      for (const statement of context.sourceCode.ast.body) {
        if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
          continue;
        }
        const source = String(statement.source.value);
        if (!ALLOWED_MEMOIZE_MODULES.has(source)) {
          continue;
        }
        for (const spec of statement.specifiers) {
          if (
            spec.type === AST_NODE_TYPES.ImportSpecifier &&
            spec.imported.type === AST_NODE_TYPES.Identifier &&
            spec.imported.name === MEMOIZE_NAME
          ) {
            aliases.set(spec.local.name, source);
          } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
            namespaces.set(spec.local.name, source);
          }
        }
      }
      return { aliases, namespaces };
    };

    let memoizeImportCache: ReturnType<typeof readMemoizeImports> | null = null;
    const memoizeImports = () => {
      if (!memoizeImportCache) {
        memoizeImportCache = readMemoizeImports();
      }
      return memoizeImportCache;
    };

    return {
      MethodDefinition(node: TSESTree.MethodDefinition) {
        // Only process async instance methods (skip static methods)
        if (
          node.value.type !== AST_NODE_TYPES.FunctionExpression ||
          !node.value.async ||
          node.static
        ) {
          return;
        }

        // Skip methods with more than one parameter
        if (node.value.params.length > 1) {
          return;
        }

        // A method declared to produce no value has no result to cache, so the
        // decorator's benefit is unobtainable while its cost is real: the
        // fixer would convert a repeatable side effect into a
        // once-per-instance one, unattended, under `--fix`.
        if (declaresVoidResult(node.value.returnType)) {
          return;
        }

        const { aliases: memoizeAliases, namespaces: memoizeNamespaces } =
          memoizeImports();
        const hasMemoizeImport =
          memoizeAliases.size > 0 || memoizeNamespaces.size > 0;

        // Check if method already has @Memoize or @Memoize() decorator
        const hasDecorator = node.decorators?.some((decorator) => {
          // If no named imports were found, we assume 'Memoize' is the intended name (for legacy/global support)
          const aliasesToCheck =
            memoizeAliases.size === 0
              ? ['Memoize']
              : Array.from(memoizeAliases.keys());

          // Check against all known aliases
          for (const alias of aliasesToCheck) {
            if (isMemoizeDecorator(decorator, alias)) {
              return true;
            }
          }
          // Also check against namespaces
          const expression = decorator.expression;
          if (
            expression.type === AST_NODE_TYPES.MemberExpression &&
            !expression.computed &&
            expression.property.type === AST_NODE_TYPES.Identifier &&
            expression.property.name === 'Memoize' &&
            expression.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.object.name)
          ) {
            return true;
          }
          // Handle namespace call: @ns.Memoize()
          if (
            expression.type === AST_NODE_TYPES.CallExpression &&
            expression.callee.type === AST_NODE_TYPES.MemberExpression &&
            !expression.callee.computed &&
            expression.callee.property.type === AST_NODE_TYPES.Identifier &&
            expression.callee.property.name === 'Memoize' &&
            expression.callee.object.type === AST_NODE_TYPES.Identifier &&
            memoizeNamespaces.has(expression.callee.object.name)
          ) {
            return true;
          }
          return false;
        });

        if (hasDecorator) {
          return;
        }

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node,
          messageId: 'requireMemoize',
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving the import unscheduled — passes the import
            // to the first violation that survives.
            if (isReportSuppressed(node)) {
              return null;
            }

            const fixes: TSESLint.RuleFix[] = [];
            const sourceCode = context.sourceCode;

            // Determine which identifier to use for the decorator
            let decoratorIdent = 'Memoize';
            if (hasMemoizeImport) {
              // Prefer 'Memoize' from the new package if available
              if (
                memoizeAliases.has('Memoize') &&
                memoizeAliases.get('Memoize') === MEMOIZE_MODULE
              ) {
                decoratorIdent = 'Memoize';
              } else if (memoizeAliases.size > 0) {
                // Find first alias from new package, fallback to any alias
                const newPackageAlias = Array.from(
                  memoizeAliases.entries(),
                ).find(([, pkg]) => pkg === MEMOIZE_MODULE)?.[0];
                decoratorIdent =
                  newPackageAlias || Array.from(memoizeAliases.keys())[0];
              } else if (memoizeNamespaces.size > 0) {
                // Prefer namespace from the new package if available
                const newPackageNs = Array.from(
                  memoizeNamespaces.entries(),
                ).find(([, pkg]) => pkg === MEMOIZE_MODULE)?.[0];
                const selectedNs =
                  newPackageNs || Array.from(memoizeNamespaces.keys())[0];
                decoratorIdent = `${selectedNs}.Memoize`;
              }
            }
            const importStatement = `import { Memoize } from '${MEMOIZE_MODULE}';`;

            // Resolve `Memoize` through the scope chain at the fixed node
            // whenever the edit spells the decorator bare. A binding that is
            // not a memoize import breaks the edit two ways: the injected
            // import collides with a module-scope declaration (TS2440, or
            // TS2300 when the binding is itself an import), and a shadowing
            // parameter or block-scoped binding captures the emitted decorator
            // with no compile error at all. Declining leaves the report
            // standing so the author resolves the clash deliberately.
            //
            // An alias or namespace decorator (`@Cache()`, `@ns.Memoize()`)
            // neither references the bare name nor injects the import, so it is
            // unaffected by a `Memoize` binding and must not be declined.
            if (decoratorIdent === MEMOIZE_NAME) {
              const existing = ASTHelpers.findVariableInScope(
                ASTHelpers.getScope(context, node),
                MEMOIZE_NAME,
              );
              if (existing && !bindsMemoize(existing)) {
                return null;
              }
            }

            // Add import if it's not already present; ensure we only add once per file
            if (
              !hasMemoizeImport &&
              memoizeNamespaces.size === 0 &&
              !scheduledImportFix
            ) {
              const programBody = (sourceCode.ast as TSESTree.Program).body;
              const firstImport = programBody.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              const anchorNode = (firstImport ?? programBody[0]) as
                | typeof programBody[number]
                | undefined;

              if (anchorNode) {
                const text = sourceCode.text;
                const anchorStart = anchorNode.range![0];
                const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
                const leadingWhitespace =
                  text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ??
                  '';
                const importLine = `${leadingWhitespace}${importStatement}\n`;
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [lineStart, lineStart],
                    importLine,
                  ),
                );
              } else {
                // Fallback: empty file
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [0, 0],
                    `import { Memoize } from '${MEMOIZE_MODULE}';\n`,
                  ),
                );
              }
              scheduledImportFix = true;
            }

            // Add decorator for this method
            const insertionTarget =
              node.decorators && node.decorators.length > 0
                ? node.decorators[0]
                : node;
            const insertionStart =
              insertionTarget.range?.[0] ?? node.range?.[0] ?? 0;
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const leadingWhitespace =
              text.slice(lineStart, insertionStart).match(/^[ \t]*/)?.[0] ?? '';
            fixes.push(
              fixer.insertTextBeforeRange(
                [lineStart, lineStart],
                `${leadingWhitespace}@${decoratorIdent}()\n`,
              ),
            );

            return fixes;
          },
        });
      },
    };
  },
});
