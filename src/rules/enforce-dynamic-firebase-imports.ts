import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression;

const isFunctionNode = (node: TSESTree.Node): node is FunctionNode =>
  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
  node.type === AST_NODE_TYPES.FunctionDeclaration ||
  node.type === AST_NODE_TYPES.FunctionExpression;

/**
 * Walks outward from a reference to the innermost `async` function whose block
 * body contains it.
 *
 * A reference sitting in a *synchronous* callback nested inside an async
 * function still resolves once the declaration heads the async body, because
 * the callback cannot run before the first statement of the body it is created
 * in — so the walk continues past non-async functions rather than giving up.
 *
 * The containment check is against the body rather than the function: a
 * reference in a parameter default or a signature type annotation is evaluated
 * before the body runs, so a declaration at the top of the body would come too
 * late for it.
 */
const enclosingAsyncBodyOf = (
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): FunctionNode | undefined => {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      isFunctionNode(current) &&
      current.async &&
      current.body.type === AST_NODE_TYPES.BlockStatement &&
      identifier.range[0] >= current.body.range[0] &&
      identifier.range[1] <= current.body.range[1]
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
};

const THIRD_PARTY_DIRECTORY = /(^|\/)node_modules(\/|$)/;

// Anchored at the end of the path so multi-part suffixes such as
// `useStartMatch.integration.test.ts` are recognized while production modules
// that merely contain the word (`latest.tsx`, `contest.ts`, `testHelpers.ts`)
// keep their enforcement.
const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Jest convention directories hold test-only modules regardless of file name.
const TEST_FILE_DIRECTORY = /(^|\/)(__tests__|__mocks__)\//;

/**
 * The rule's rationale is bundle weight: a static import pulls Firebase into the
 * initial client chunk. A suite, a Jest manual mock and a declaration file are
 * never part of that chunk, so there is nothing to inflate and the rule has
 * nothing to enforce there.
 *
 * The exemption is load-bearing rather than cosmetic because the rule is
 * fixable: a suite's static binding is exactly what `jest.mock()` hoisting
 * intercepts, and rewriting it emits a module-scope `await import(...)` that a
 * CommonJS test transform cannot even parse (issue #1715).
 */
const isNeverBundled = (filename: string) =>
  filename.endsWith('.d.ts') ||
  TEST_FILE_SUFFIX.test(filename) ||
  TEST_FILE_DIRECTORY.test(filename);

const enforceFirebaseImports = createRule({
  name: 'enforce-dynamic-firebase-imports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed.',
      recommended: 'error',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      noDynamicImport:
        'Static import from firebaseCloud path "{{importPath}}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Load it at the call site instead, inside an async function body (e.g., `const { export } = await import(\'{{importPath}}\')`). Keep it out of module scope: a top-level `await import(...)` defers nothing and does not parse once the module is compiled to CommonJS.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    // Normalize Windows backslash separators so the forward-slash directory
    // checks match on every platform. Without this, `getFilename()` returns
    // `C:\repo\src\hooks\__tests__\Foo.ts` on Windows and the exemption
    // silently fails there.
    const filename = (context.getFilename?.() ?? '').replace(/\\/g, '/');

    // `<input>`/`<text>` are the synthetic names RuleTester uses when a case
    // declares no filename. They match none of the exemptions below, so a
    // snippet keeps its enforcement — unlike a path-gated rule, this one has no
    // include list to fall outside of.
    if (THIRD_PARTY_DIRECTORY.test(filename) || isNeverBundled(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        // Skip type-only import declarations
        if (node.importKind === 'type') {
          return;
        }

        const importPath = node.source.value as string;

        // Check if the import is from firebaseCloud directory
        if (!importPath.includes('firebaseCloud/')) {
          return;
        }

        // Determine specifiers
        const defaultSpecifier = node.specifiers.find(
          (spec): spec is TSESTree.ImportDefaultSpecifier =>
            spec.type === 'ImportDefaultSpecifier',
        );
        const namespaceSpecifier = node.specifiers.find(
          (spec): spec is TSESTree.ImportNamespaceSpecifier =>
            spec.type === 'ImportNamespaceSpecifier',
        );
        const namedSpecifiers = node.specifiers.filter(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === 'ImportSpecifier' && spec.importKind !== 'type',
        );
        const typeOnlySpecifiers = node.specifiers.filter(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === 'ImportSpecifier' && spec.importKind === 'type',
        );

        // If there are only type-only specifiers, allow
        if (
          !defaultSpecifier &&
          !namespaceSpecifier &&
          namedSpecifiers.length === 0 &&
          typeOnlySpecifiers.length > 0
        ) {
          return;
        }

        const buildTypeNames = (): string =>
          typeOnlySpecifiers
            .map((spec) =>
              spec.imported.name === spec.local.name
                ? spec.imported.name
                : `${spec.imported.name} as ${spec.local.name}`,
            )
            .join(', ');

        const destructureEntry = (spec: TSESTree.ImportSpecifier): string =>
          spec.imported.name === spec.local.name
            ? spec.local.name
            : `${spec.imported.name}: ${spec.local.name}`;

        const buildValueStatements = (): string[] => {
          if (namespaceSpecifier) {
            const nsLocal = namespaceSpecifier.local.name;
            const statements = [
              `const ${nsLocal} = await import('${importPath}');`,
            ];

            if (defaultSpecifier) {
              statements.push(
                `const ${defaultSpecifier.local.name} = ${nsLocal}.default;`,
              );
            }

            if (namedSpecifiers.length > 0) {
              statements.push(
                `const { ${namedSpecifiers
                  .map(destructureEntry)
                  .join(', ')} } = ${nsLocal};`,
              );
            }

            return statements;
          }

          const destructureParts = [
            ...(defaultSpecifier
              ? [`default: ${defaultSpecifier.local.name}`]
              : []),
            ...namedSpecifiers.map(destructureEntry),
          ];

          // A side-effect import binds nothing, so there is no declaration to
          // relocate — the awaited call would have to stay at module scope.
          return destructureParts.length > 0
            ? [
                `const { ${destructureParts.join(
                  ', ',
                )} } = await import('${importPath}');`,
              ]
            : [];
        };

        /**
         * An `ImportDeclaration` only ever sits at module scope, so rewriting
         * it in place can only ever produce a module-scope `await import(...)`
         * — which defers nothing (the module still awaits it during
         * evaluation) and does not even parse once the file is compiled to
         * CommonJS, where top-level await does not exist (issue #1716).
         *
         * The rewrite is therefore only expressible when every value reference
         * lives in one async function body: the declaration can then head that
         * body, exactly the shape the codebase writes by hand. Anything else
         * is a per-call-site refactor the fixer declines rather than corrupts.
         */
        const findRelocationTarget = (): FunctionNode | undefined => {
          const valueLocalNames = new Set(
            [
              defaultSpecifier?.local.name,
              namespaceSpecifier?.local.name,
              ...namedSpecifiers.map((spec) => spec.local.name),
            ].filter((name): name is string => name !== undefined),
          );

          const references = context
            .getDeclaredVariables(node)
            .filter((variable) => valueLocalNames.has(variable.name))
            .flatMap((variable) => variable.references);

          // Nothing reads the binding, so there is no call site to defer to.
          if (references.length === 0) {
            return undefined;
          }

          let target: FunctionNode | undefined;
          for (const reference of references) {
            const enclosing = enclosingAsyncBodyOf(reference.identifier);
            if (!enclosing || (target && target !== enclosing)) {
              return undefined;
            }
            target = enclosing;
          }
          return target;
        };

        const indentationAt = (line: number): string =>
          /^[ \t]*/.exec(sourceCode.lines[line - 1] ?? '')?.[0] ?? '';

        /**
         * Consumes the import's own trailing whitespace, and its line break
         * when the import owns the line, so the removal strands neither a blank
         * line nor the indentation of whatever shared the line with it.
         * Anything that is not whitespace — a trailing comment, a statement —
         * is left untouched.
         */
        const removalEnd = (): number => {
          const text = sourceCode.getText();
          let cursor = node.range[1];
          while (
            cursor < text.length &&
            (text[cursor] === ' ' || text[cursor] === '\t')
          ) {
            cursor += 1;
          }
          if (text[cursor] === '\n') {
            return cursor + 1;
          }
          if (text[cursor] === '\r' && text[cursor + 1] === '\n') {
            return cursor + 2;
          }
          return cursor;
        };

        const buildFix: TSESLint.ReportFixFunction = (fixer) => {
          const target = findRelocationTarget();
          const statements = buildValueStatements();
          if (!target || statements.length === 0) {
            return null;
          }

          const body = target.body as TSESTree.BlockStatement;

          // A directive stops being a directive the moment a declaration
          // precedes it, so `'use server'` on a server action would silently
          // become a discarded string expression. The declaration goes after
          // the whole prologue instead.
          const prologueLength = body.body.findIndex(
            (statement) =>
              statement.type !== AST_NODE_TYPES.ExpressionStatement ||
              statement.expression.type !== AST_NODE_TYPES.Literal ||
              typeof statement.expression.value !== 'string',
          );
          const directives = body.body.slice(
            0,
            prologueLength === -1 ? body.body.length : prologueLength,
          );
          const lastDirective = directives[directives.length - 1];
          const following = body.body[directives.length];
          const anchorLine = lastDirective
            ? lastDirective.loc.end.line
            : body.loc.start.line;
          const neighbour = following ?? lastDirective;

          // A body written on one line keeps its shape; a multi-line body gets
          // the declaration on its own line at the body's own indentation.
          const insertion =
            following && following.loc.start.line === anchorLine
              ? ` ${statements.join(' ')}`
              : statements
                  .map((statement) => {
                    const indent = neighbour
                      ? indentationAt(neighbour.loc.start.line)
                      : `${indentationAt(target.loc.start.line)}  `;
                    return `\n${indent}${statement}`;
                  })
                  .join('');

          return [
            // Type-only specifiers are erased at compile time, so they stay
            // where they are instead of riding along into the function body.
            typeOnlySpecifiers.length > 0
              ? fixer.replaceText(
                  node,
                  `import type { ${buildTypeNames()} } from '${importPath}';`,
                )
              : fixer.removeRange([node.range[0], removalEnd()]),
            lastDirective
              ? fixer.insertTextAfter(lastDirective, insertion)
              : fixer.insertTextAfterRange(
                  [body.range[0], body.range[0] + 1],
                  insertion,
                ),
          ];
        };

        context.report({
          node,
          messageId: 'noDynamicImport',
          data: { importPath },
          fix: buildFix,
          suggest: [
            {
              messageId: 'noDynamicImport',
              data: { importPath },
              fix: buildFix,
            },
          ],
        });
      },
    };
  },
});

export default enforceFirebaseImports;
