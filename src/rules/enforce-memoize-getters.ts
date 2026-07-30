import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';

type MessageIds = 'requireMemoizeGetter';
type Options = [];

const MEMOIZE_PREFERRED_MODULE = '@blumintinc/typescript-memoize';
const MEMOIZE_MODULES = new Set([
  MEMOIZE_PREFERRED_MODULE,
  'typescript-memoize',
]);
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
        MEMOIZE_MODULES.has(String(declaration.source.value))
      );
    })
  );
}

function isMemoizeDecorator(
  decorator: TSESTree.Decorator,
  alias: string,
): boolean {
  const expression = decorator.expression;
  // @Alias()
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
  // @Alias
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return expression.name === alias;
  }
  // @ns.Alias
  if (
    expression.type === AST_NODE_TYPES.MemberExpression &&
    !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expression.property.name === alias;
  }
  return false;
}

export const enforceMemoizeGetters = createRule<Options, MessageIds>({
  name: 'enforce-memoize-getters',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce @Memoize() decorator on private class getters to avoid re-instantiation and preserve state across accesses.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireMemoizeGetter:
        'Private getter "{{name}}" should use @Memoize() so repeated accesses reuse the same instance instead of re-instantiating and losing internal state. Add @Memoize() and import Memoize from "@blumintinc/typescript-memoize" to avoid redundant setup work.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Only apply in TS/TSX files to avoid JS environments without decorators
    const filename = context.getFilename();
    if (!/\.tsx?$/i.test(filename)) {
      return {};
    }

    const sourceCode = context.getSourceCode();
    let scheduledImportFix = false;

    /**
     * The `import { Memoize }` statement rides on a single violation's fix, so
     * that violation is the file's import carrier. A suppressed carrier would
     * take the import down with it while the surviving violations still emit
     * `@Memoize()`, leaving a decorator with no import.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    /**
     * The memoize import the file already carries: the local name of a named
     * `Memoize` specifier, or the local name of a namespace import.
     *
     * Read off `Program.body` rather than accumulated by an `ImportDeclaration`
     * visitor, because a class that precedes the import declaration in source
     * order is visited — and fixed — before that visitor runs, and would be
     * judged against state recorded for no import at all. The AST is fixed for
     * the pass, so a single scan serves every violation.
     */
    const readMemoizeImports = () => {
      let hasMemoizeImport = false;
      let memoizeAlias = MEMOIZE_NAME;
      let memoizeNamespace: string | null = null;
      let hasNamedImport = false;
      for (const statement of sourceCode.ast.body) {
        if (statement.type !== AST_NODE_TYPES.ImportDeclaration) {
          continue;
        }
        if (!MEMOIZE_MODULES.has(String(statement.source.value))) {
          continue;
        }
        for (const spec of statement.specifiers) {
          if (
            spec.type === AST_NODE_TYPES.ImportSpecifier &&
            spec.imported.type === AST_NODE_TYPES.Identifier &&
            spec.imported.name === MEMOIZE_NAME
          ) {
            hasMemoizeImport = true;
            hasNamedImport = true;
            memoizeAlias = spec.local.name;
          } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
            hasMemoizeImport = true;
            if (!hasNamedImport) {
              memoizeNamespace = spec.local.name;
            }
          }
        }
      }
      return {
        hasMemoizeImport,
        memoizeAlias,
        memoizeNamespace,
        hasNamedImport,
      };
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
        // Target: instance private getters
        if (node.kind !== 'get') return;
        // skip static getters
        if (node.static) return;
        // enforce only "private" accessibility (undefined => public)
        if (node.accessibility !== 'private') return;

        const {
          hasMemoizeImport,
          memoizeAlias,
          memoizeNamespace,
          hasNamedImport,
        } = memoizeImports();

        const decoratorAliases =
          memoizeAlias === MEMOIZE_NAME
            ? [MEMOIZE_NAME]
            : [MEMOIZE_NAME, memoizeAlias];
        const hasDecorator = node.decorators?.some((decorator) =>
          decoratorAliases.some((alias) =>
            isMemoizeDecorator(decorator, alias),
          ),
        );
        if (hasDecorator) return;

        const propertyName = node.computed
          ? '[computed]'
          : sourceCode.getText(node.key);

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node,
          messageId: 'requireMemoizeGetter',
          data: { name: propertyName },
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving the import unscheduled — passes the import
            // to the first violation that survives.
            if (isReportSuppressed(node)) {
              return null;
            }

            const fixes: TSESLint.RuleFix[] = [];
            const getDecoratorIdent = (): string => {
              if (hasNamedImport) {
                return memoizeAlias;
              }
              if (memoizeNamespace) {
                return `${memoizeNamespace}.Memoize`;
              }
              return memoizeAlias;
            };
            const decoratorIdent = getDecoratorIdent();

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

            // Insert import if needed, at the top alongside other imports
            if (!hasMemoizeImport && !scheduledImportFix) {
              const programBody = (sourceCode.ast as TSESTree.Program).body;
              const firstImport = programBody.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              const anchorNode = (firstImport ?? programBody[0]) as
                | typeof programBody[number]
                | undefined;

              if (anchorNode) {
                const text = sourceCode.text;
                const anchorStart = anchorNode.range[0];
                const lineStart = text.lastIndexOf('\n', anchorStart - 1) + 1;
                const leadingWhitespace =
                  text.slice(lineStart, anchorStart).match(/^[ \t]*/)?.[0] ??
                  '';
                const importLine = `${leadingWhitespace}import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`;
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [lineStart, lineStart],
                    importLine,
                  ),
                );
              } else {
                fixes.push(
                  fixer.insertTextBeforeRange(
                    [0, 0],
                    `import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`,
                  ),
                );
              }
              scheduledImportFix = true;
            }

            // Insert decorator above the getter (or before the first decorator), preserving indentation
            const insertionTarget = node.decorators?.[0] ?? node;
            const insertionStart = insertionTarget.range[0];
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

export default enforceMemoizeGetters;
