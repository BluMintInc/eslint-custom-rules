import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { visitorKeys } from '@typescript-eslint/visitor-keys';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importAnchorIndent,
  importAnchorLineStart,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

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

/**
 * Node modules whose exports observe or drive the world outside the process.
 * A getter that reaches one of them yields a fresh observation per access, and
 * `@Memoize()` would pin the first observation for the life of the instance —
 * a behaviour change, not an optimization.
 */
const IO_MODULES = new Set([
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'net',
  'node:net',
  'http',
  'node:http',
  'https',
  'node:https',
  'dns',
  'node:dns',
]);

/**
 * Builtins whose result differs between two otherwise identical accesses, so
 * the cached first value stops tracking whatever the getter samples.
 */
const NON_DETERMINISTIC_CALLS = new Set([
  'Date.now',
  'Math.random',
  'performance.now',
  'crypto.randomUUID',
  'crypto.getRandomValues',
  'process.hrtime',
  'process.hrtime.bigint',
]);

/**
 * The dotted path of a chain of plain identifiers (`process.hrtime.bigint`), or
 * `null` once any link is computed or is not an identifier. Keying on the
 * spelled path keeps the analysis syntactic, which is all this rule has: it
 * runs without `parserOptions.project`, so no type information is available.
 */
function staticMemberPath(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  ) {
    const objectPath = staticMemberPath(node.object);
    return objectPath === null ? null : `${objectPath}.${node.property.name}`;
  }
  return null;
}

/**
 * The member name a key spells, covering the forms `this.<name>` can reach:
 * plain identifiers, string-literal keys, and private names.
 */
function keyName(key: TSESTree.Node): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${key.name}`;
  }
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

/** The member name of a `this.<name>` access, or `null` for anything else. */
function thisMemberName(node: TSESTree.Node): string | null {
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.object.type !== AST_NODE_TYPES.ThisExpression
  ) {
    return null;
  }
  return keyName(node.property);
}

function forEachDescendant(
  root: TSESTree.Node,
  visit: (node: TSESTree.Node) => void,
): void {
  const stack: TSESTree.Node[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    visit(current);
    const keys = visitorKeys[current.type] ?? [];
    for (const key of keys) {
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const element of value) {
          if (ASTHelpers.isNode(element)) {
            stack.push(element);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        stack.push(value);
      }
    }
  }
}

/**
 * Local names bound by an import of a Node I/O module, covering named, default
 * and namespace specifiers alike: a call through any of them — `execFileSync()`
 * or `fs.readFileSync()` — reaches the same I/O.
 */
function collectIoBindings(program: TSESTree.Program): Set<string> {
  const bindings = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.importKind === 'type' ||
      !IO_MODULES.has(String(statement.source.value))
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind === 'type'
      ) {
        continue;
      }
      bindings.add(specifier.local.name);
    }
  }
  return bindings;
}

/**
 * Whether a single node is one of the seed impurities: a call reaching a Node
 * I/O binding, a non-deterministic builtin, or a read of `process.env`.
 */
function isImpureSeed(
  node: TSESTree.Node,
  ioBindings: ReadonlySet<string>,
): boolean {
  // `new Date()` samples the wall clock; `new Date(value)` is a pure conversion.
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === 'Date' &&
      node.arguments.length === 0
    );
  }
  // Every `process.env.X` / `process.env['X']` read contains this subexpression.
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return staticMemberPath(node) === 'process.env';
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const calleePath = staticMemberPath(node.callee);
  if (calleePath === null) {
    return false;
  }
  return (
    NON_DETERMINISTIC_CALLS.has(calleePath) ||
    ioBindings.has(calleePath.split('.')[0])
  );
}

type MemberAnalysis = {
  element: TSESTree.Node;
  dependencies: Set<string>;
  impure: boolean;
};

/**
 * The function a class element carries and the name `this.<name>` reaches it
 * by, for the element kinds a getter can delegate to: methods, accessors, and
 * fields holding a function. Anything else (a static block, a plain field) is
 * not a delegation target.
 */
function describeMember(
  element: TSESTree.ClassElement,
): { fn: TSESTree.Node; name: string | null } | undefined {
  if (
    element.type === AST_NODE_TYPES.MethodDefinition ||
    element.type === AST_NODE_TYPES.TSAbstractMethodDefinition
  ) {
    return { fn: element.value, name: keyName(element.key) };
  }
  if (
    element.type === AST_NODE_TYPES.PropertyDefinition &&
    (element.value?.type === AST_NODE_TYPES.FunctionExpression ||
      element.value?.type === AST_NODE_TYPES.ArrowFunctionExpression)
  ) {
    return { fn: element.value, name: keyName(element.key) };
  }
  return undefined;
}

/**
 * The class elements whose value depends on live external state, as a
 * class-local fixpoint: seed the members that reach I/O or a non-deterministic
 * builtin directly, then keep marking any member that touches an already-impure
 * `this.<member>` until nothing changes.
 *
 * The iteration — rather than a single direct-callee check — is what covers the
 * production shape that motivates the exemption: a getter delegating to a
 * sibling private method that itself delegates further before reaching the I/O
 * call.
 */
function analyzeClassImpurity(
  classBody: TSESTree.ClassBody,
  ioBindings: ReadonlySet<string>,
): Set<TSESTree.Node> {
  const analyses: MemberAnalysis[] = [];
  const byName = new Map<string, MemberAnalysis[]>();

  for (const element of classBody.body) {
    const member = describeMember(element);
    if (!member) {
      continue;
    }
    const analysis: MemberAnalysis = {
      element,
      dependencies: new Set<string>(),
      impure: false,
    };
    forEachDescendant(member.fn, (node) => {
      if (isImpureSeed(node, ioBindings)) {
        analysis.impure = true;
        return;
      }
      // A bare read of `this.<member>` counts alongside a call: reading an
      // impure getter is exactly the propagation path this analysis exists for.
      const dependency = thisMemberName(node);
      if (dependency !== null) {
        analysis.dependencies.add(dependency);
      }
    });
    analyses.push(analysis);

    if (member.name !== null) {
      const siblings = byName.get(member.name);
      if (siblings) {
        siblings.push(analysis);
      } else {
        byName.set(member.name, [analysis]);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const analysis of analyses) {
      if (analysis.impure) {
        continue;
      }
      const reachesImpure = [...analysis.dependencies].some((dependency) =>
        (byName.get(dependency) ?? []).some((target) => target.impure),
      );
      if (reachesImpure) {
        analysis.impure = true;
        changed = true;
      }
    }
  }

  return new Set(
    analyses
      .filter((analysis) => analysis.impure)
      .map(({ element }) => element),
  );
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

    let ioBindingCache: Set<string> | null = null;
    const ioBindings = () => {
      if (!ioBindingCache) {
        ioBindingCache = collectIoBindings(sourceCode.ast);
      }
      return ioBindingCache;
    };

    // One fixpoint per class serves every getter it declares.
    const impurityCache = new Map<TSESTree.ClassBody, Set<TSESTree.Node>>();
    const impureMembersOf = (classBody: TSESTree.ClassBody) => {
      const cached = impurityCache.get(classBody);
      if (cached) {
        return cached;
      }
      const analyzed = analyzeClassImpurity(classBody, ioBindings());
      impurityCache.set(classBody, analyzed);
      return analyzed;
    };

    return {
      MethodDefinition(node: TSESTree.MethodDefinition) {
        // Target: instance private getters
        if (node.kind !== 'get') return;
        // skip static getters
        if (node.static) return;
        // enforce only "private" accessibility (undefined => public)
        if (node.accessibility !== 'private') return;

        // A `#private` name admits no decorator under `experimentalDecorators`
        // — the mode this plugin's consumers compile in — so the prescribed
        // remedy is TS1206 and cannot be written. The shape also carries
        // TS18010 already, because an accessibility modifier beside a private
        // name is a grammar error, so the report would only add noise to code
        // the compiler already rejects while its `--fix` edit deepened the
        // breakage.
        if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) return;

        // A getter whose value is a fresh read of live external state is not a
        // lazy factory: memoizing it pins the first observation forever, so the
        // report is dropped along with its unattended `--fix` edit.
        const classBody = node.parent;
        if (
          classBody?.type === AST_NODE_TYPES.ClassBody &&
          impureMembersOf(classBody).has(node)
        ) {
          return;
        }

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

            // Insert import if needed, at the top alongside other imports.
            // The shared anchor keeps the edit below the file's prologue: a
            // `'use client'` directive demoted to a plain expression statement
            // and a shebang displaced off character 0 both change what the file
            // means, and neither is recoverable from the emitted decorator.
            if (!hasMemoizeImport && !scheduledImportFix) {
              const anchor = importInsertionAnchor(sourceCode);
              // Indent comes from the anchor's own line, so the import lines up
              // with the statement it displaces; widening to the line start
              // then leaves that statement's indentation intact.
              const indent = importAnchorIndent(sourceCode, anchor);
              fixes.push(
                insertAtImportAnchor(
                  sourceCode,
                  fixer,
                  importAnchorLineStart(sourceCode, anchor),
                  `${indent}import { Memoize } from '${MEMOIZE_PREFERRED_MODULE}';\n`,
                ),
              );
              scheduledImportFix = true;
            }

            // Anchor the decorator on the member — its first token, so ahead of
            // `private`/`static` and of any decorator it already carries —
            // rather than on the start of the line the member happens to sit
            // on. The two coincide only while the member is first on its line:
            // in a single-line class body, or where two members share a line, a
            // line-start edit emits the decorator before `class …`, decorating
            // the CLASS. The getter stays bare, so the rule reports again on the
            // next pass and `--fix` stacks one more decorator per pass up to
            // ESLint's pass cap instead of reaching a fixpoint.
            const insertionTarget = node.decorators?.[0] ?? node;
            const insertionStart = insertionTarget.range[0];
            const text = sourceCode.text;
            const lineStart = text.lastIndexOf('\n', insertionStart - 1) + 1;
            const linePrefix = text.slice(lineStart, insertionStart);
            // A member that owns its line keeps the decorator on a line of its
            // own at the member's indentation, which is the layout authors
            // write by hand. A member that shares its line has no line to take,
            // and a newline there would strand the decorator against the
            // neighbour's text, so it rides inline — a spelling the grammar
            // accepts just as readily.
            const ownsItsLine = /^[ \t]*$/.test(linePrefix);
            fixes.push(
              fixer.insertTextBefore(
                insertionTarget,
                ownsItsLine
                  ? `@${decoratorIdent}()\n${linePrefix}`
                  : `@${decoratorIdent}() `,
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
