import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'requireMemoize';
type Options = [];

const MEMOIZE_MODULE = '@blumintinc/typescript-memoize';
const ALLOWED_MEMOIZE_MODULES = new Set([MEMOIZE_MODULE, 'typescript-memoize']);

/**
 * The `import { Memoize }` statement rides on a single violation's fix, so that
 * violation is the file's import carrier. ESLint calls `fix()` eagerly, while
 * inline disable directives are applied afterwards: a suppressed report takes
 * its fix down with it. If the carrier is suppressed, the surviving violations
 * still emit `@Memoize()` and the file ends up with a decorator that has no
 * import. Resolving suppression up front lets the carrier slot fall to the
 * first violation that actually survives.
 *
 * The parsing below mirrors ESLint's own directive handling
 * (`lib/linter/apply-disable-directives.js`).
 */
const DIRECTIVE_PATTERN =
  /^(eslint-disable(?:-next-line|-line)?|eslint-enable)(?:\s|$)/;

/** ESLint separates a directive from its justification with ` -- `. */
const JUSTIFICATION_SEPARATOR = /\s-{2,}\s/;

type DirectiveKind =
  | 'disable'
  | 'enable'
  | 'disable-line'
  | 'disable-next-line';

type Directive = {
  kind: DirectiveKind;
  /** `null` when the directive names no rule, which targets every rule. */
  rules: Set<string> | null;
  /**
   * For block directives, the comment's own position; for line-scoped ones,
   * the single source line the directive covers.
   */
  line: number;
  column: number;
};

function parseDirective(comment: TSESTree.Comment): Directive | null {
  const justification = JUSTIFICATION_SEPARATOR.exec(comment.value);
  const directivePart = (
    justification ? comment.value.slice(0, justification.index) : comment.value
  ).trim();

  const match = DIRECTIVE_PATTERN.exec(directivePart);
  if (!match) {
    return null;
  }
  const token = match[1];
  const kind = token.slice('eslint-'.length) as DirectiveKind;
  const isLineScoped = kind === 'disable-line' || kind === 'disable-next-line';

  // `eslint-disable`/`eslint-enable` are honoured only in block comments, and
  // a multi-line `eslint-disable-line` is rejected outright — both per ESLint.
  if (!isLineScoped && comment.type !== AST_TOKEN_TYPES.Block) {
    return null;
  }
  if (
    kind === 'disable-line' &&
    comment.loc.start.line !== comment.loc.end.line
  ) {
    return null;
  }

  const ruleList = directivePart.slice(token.length).trim();
  const rules =
    ruleList === ''
      ? null
      : new Set(
          ruleList
            .split(',')
            .map((rule) => rule.trim())
            .filter((rule) => rule !== ''),
        );

  // A multi-line `eslint-disable-next-line` targets the line after the comment
  // ends, not after it starts.
  const line =
    kind === 'disable-next-line'
      ? comment.loc.end.line + 1
      : comment.loc.start.line;

  return { kind, rules, line, column: comment.loc.start.column };
}

function targetsRule(directive: Directive, ruleId: string): boolean {
  return directive.rules === null || directive.rules.has(ruleId);
}

/**
 * ESLint evaluates line-scoped directives in a pass of their own, so the
 * implicit re-enable that follows an `eslint-disable-next-line` cannot punch a
 * hole in a surrounding block disable. This mirrors that separation.
 */
function isBlockSuppressed(
  directives: readonly Directive[],
  ruleId: string,
  loc: TSESTree.Position,
): boolean {
  let globalDisabled = false;
  let ruleDisabled = false;
  // An `eslint-enable <rule>` carves a single rule out of a bare disable.
  let ruleReEnabled = false;

  for (const directive of directives) {
    if (directive.kind !== 'disable' && directive.kind !== 'enable') {
      continue;
    }
    const isBefore =
      directive.line < loc.line ||
      (directive.line === loc.line && directive.column <= loc.column);
    if (!isBefore) {
      break;
    }
    const isBare = directive.rules === null;
    if (!isBare && !targetsRule(directive, ruleId)) {
      continue;
    }

    if (directive.kind === 'disable') {
      if (isBare) {
        globalDisabled = true;
        ruleDisabled = false;
        ruleReEnabled = false;
      } else if (globalDisabled) {
        ruleReEnabled = false;
      } else {
        ruleDisabled = true;
      }
      continue;
    }
    if (isBare) {
      globalDisabled = false;
      ruleDisabled = false;
      ruleReEnabled = false;
    } else if (globalDisabled) {
      ruleReEnabled = true;
    } else {
      ruleDisabled = false;
    }
  }

  return ruleDisabled || (globalDisabled && !ruleReEnabled);
}

function isSuppressed(
  directives: readonly Directive[],
  ruleId: string,
  loc: TSESTree.Position,
): boolean {
  const lineSuppressed = directives.some(
    (directive) =>
      (directive.kind === 'disable-line' ||
        directive.kind === 'disable-next-line') &&
      directive.line === loc.line &&
      targetsRule(directive, ruleId),
  );
  return lineSuppressed || isBlockSuppressed(directives, ruleId, loc);
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
    let hasMemoizeImport = false;
    const memoizeAliases = new Map<string, string>(); // alias -> source module
    const memoizeNamespaces = new Map<string, string>(); // namespace -> source module
    let scheduledImportFix = false;

    let parsedDirectives: Directive[] | null = null;
    const directivesOf = () => {
      if (parsedDirectives === null) {
        parsedDirectives = context.sourceCode
          .getAllComments()
          .map(parseDirective)
          .filter((directive): directive is Directive => directive !== null)
          .sort((a, b) => a.line - b.line || a.column - b.column);
      }
      return parsedDirectives;
    };

    // `context.id` is exactly the name a disable directive must spell, whether
    // the rule runs bare or under the plugin prefix.
    const isReportSuppressed = (node: TSESTree.Node) =>
      isSuppressed(directivesOf(), context.id, node.loc.start);

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (ALLOWED_MEMOIZE_MODULES.has(String(node.source.value))) {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === 'Memoize'
            ) {
              hasMemoizeImport = true;
              memoizeAliases.set(spec.local.name, String(node.source.value));
            } else if (spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
              hasMemoizeImport = true;
              memoizeNamespaces.set(spec.local.name, String(node.source.value));
            }
          });
        }
      },

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
