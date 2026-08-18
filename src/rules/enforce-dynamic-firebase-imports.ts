import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
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
 * Walks outward from a reference to the innermost `async` function whose body
 * both contains it and satisfies `hostsDeclaration`.
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
const enclosingAsyncFunctionOf = (
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
  hostsDeclaration: (fn: FunctionNode) => boolean,
): FunctionNode | undefined => {
  let current: TSESTree.Node | undefined = identifier.parent;
  while (current) {
    if (
      isFunctionNode(current) &&
      current.async &&
      hostsDeclaration(current) &&
      identifier.range[0] >= current.body.range[0] &&
      identifier.range[1] <= current.body.range[1]
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
};

const enclosingAsyncBodyOf = (
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): FunctionNode | undefined =>
  enclosingAsyncFunctionOf(
    identifier,
    (fn) => fn.body.type === AST_NODE_TYPES.BlockStatement,
  );

/**
 * The innermost `async` arrow whose *concise* body holds the reference.
 *
 * A concise body is a single expression with no statement list to head, so the
 * declaration only becomes expressible once the arrow gains a block. That is a
 * larger edit than heading an existing body, which is why this search runs only
 * for references no async block encloses — an enclosing block always wins.
 */
const enclosingConciseAsyncArrowOf = (
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): FunctionNode | undefined =>
  enclosingAsyncFunctionOf(
    identifier,
    (fn) => fn.body.type !== AST_NODE_TYPES.BlockStatement,
  );

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

type Options = [
  {
    printWidth?: number;
  },
];

type MessageIds = 'noDynamicImport';

/**
 * Prettier's own default. The fixer authors a whole statement that a formatter
 * owns, so a line it emits past this width is rewritten on the next
 * `prettier --write` — and fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
const indentUnitOf = (sourceCode: TSESLint.SourceCode): string => {
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry the comment's own alignment, which
  // is not a nesting step of the file; counting them makes a JSDoc-heavy file
  // look 1-space indented.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of sourceCode.getText().split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '' || continuesBlockComment(lineStart)) {
      continue;
    }
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const delta = indent.slice(previous.length);
      frequencies.set(delta, (frequencies.get(delta) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [delta, count] of frequencies) {
    if (count > best) {
      unit = delta;
      best = count;
    }
  }
  return unit;
};

/**
 * A destructured binding kept as its two halves rather than as printed text:
 * Prettier's next break point inside an over-wide pattern is the property's own
 * `:`, so the value has to stay separable from the key.
 */
type DestructureProperty = {
  readonly key: string;
  /** Absent for a shorthand binding, where key and local name coincide. */
  readonly value?: string;
};

const propertyText = (property: DestructureProperty): string =>
  property.value === undefined
    ? property.key
    : `${property.key}: ${property.value}`;

type Binding =
  | { readonly kind: 'name'; readonly name: string }
  | {
      readonly kind: 'pattern';
      readonly properties: readonly DestructureProperty[];
    };

type Initializer =
  | { readonly kind: 'import'; readonly path: string }
  | { readonly kind: 'expression'; readonly text: string };

type Declaration = {
  readonly binding: Binding;
  readonly initializer: Initializer;
};

/** Everything a broken-open `await import(...)` keeps on the line before its argument. */
const IMPORT_CALL_HEAD = 'await import(';

/**
 * Prettier expands an object pattern of more than two properties as soon as one
 * of them is renamed, whatever the line would otherwise measure
 * (`isComplexDestructuring`). A renamed specifier and the `default:` entry are
 * both non-shorthand, so the emitted pattern has to answer that rule as well as
 * the width to survive `prettier --check`.
 */
const isComplexPattern = (binding: Binding): boolean =>
  binding.kind === 'pattern' &&
  binding.properties.length > 2 &&
  binding.properties.some((property) => property.value !== undefined);

/**
 * One property of an expanded pattern. A renamed binding whose own line
 * overflows breaks after its `:`, which is the last break point the pattern
 * has; a shorthand one has none, so it is printed as is — exactly what Prettier
 * does with a name too long for the line it lands on.
 */
const printProperty = (
  property: DestructureProperty,
  indent: string,
  indentUnit: string,
  printWidth: number,
): string => {
  const inline = `${indent}${propertyText(property)},`;
  if (property.value === undefined || inline.length <= printWidth) {
    return inline;
  }
  return `${indent}${property.key}:\n${indent}${indentUnit}${property.value},`;
};

const inlineBindingOf = (binding: Binding): string =>
  binding.kind === 'name'
    ? binding.name
    : `{ ${binding.properties.map(propertyText).join(', ')} }`;

const inlineInitializerOf = (initializer: Initializer): string =>
  initializer.kind === 'import'
    ? `${IMPORT_CALL_HEAD}'${initializer.path}')`
    : initializer.text;

/** The whole declaration on one line, with no break opportunity taken. */
const printInline = (declaration: Declaration): string =>
  `const ${inlineBindingOf(declaration.binding)} = ${inlineInitializerOf(
    declaration.initializer,
  )};`;

/**
 * Prints the declaration in the shape Prettier prints it at `indent`.
 *
 * The specifier list and the module path both come from the source import, so
 * the one-line form has no length bound and overflows on ordinary firebaseCloud
 * paths. Wrapping unconditionally is the mirror failure: Prettier collapses an
 * expanded destructuring pattern, argument list or assignment back onto one line
 * as soon as it fits, so the width — not the shape of the input — decides.
 *
 * Every branch below is a shape Prettier itself emits, so there is no
 * precondition that can fail and no line the measurement rejects yet still gets
 * printed.
 */
const printDeclaration = (
  declaration: Declaration,
  indent: string,
  indentUnit: string,
  printWidth: number,
): string => {
  const { binding, initializer } = declaration;
  const oneLine = printInline(declaration);
  if (indent.length + oneLine.length <= printWidth) {
    return oneLine;
  }

  const inlineHead = `const ${inlineBindingOf(binding)} =`;
  // An expanded pattern moves the `=` onto the closing brace's line, so it is
  // that line — not the head — the initializer is measured against.
  const expanded =
    binding.kind === 'pattern' &&
    (isComplexPattern(binding) ||
      indent.length + inlineHead.length > printWidth)
      ? {
          text: `const {\n${binding.properties
            .map((property) =>
              printProperty(
                property,
                `${indent}${indentUnit}`,
                indentUnit,
                printWidth,
              ),
            )
            .join('\n')}\n${indent}} =`,
          tail: '} =',
        }
      : { text: inlineHead, tail: inlineHead };

  const inlineInitializer = inlineInitializerOf(initializer);
  const tailColumn = indent.length + expanded.tail.length;

  // The initializer still fits after an expanded pattern's `} =`.
  if (tailColumn + inlineInitializer.length + 2 <= printWidth) {
    return `${expanded.text} ${inlineInitializer};`;
  }

  // Prettier breaks the call's argument before it breaks after the `=`, so long
  // as the call head still fits on the line the `=` sits on.
  const rhsIndent = `${indent}${indentUnit}`;
  if (
    initializer.kind === 'import' &&
    tailColumn + IMPORT_CALL_HEAD.length + 1 <= printWidth
  ) {
    return `${expanded.text} ${IMPORT_CALL_HEAD}\n${rhsIndent}'${initializer.path}'\n${indent});`;
  }

  // Nothing fits beside the `=`: the initializer takes the next line, and
  // breaks its own argument there when even that line overflows. A module path
  // wider than the line it lands on is emitted as is — Prettier cannot break a
  // string literal either, so that is already its output.
  if (
    initializer.kind === 'import' &&
    rhsIndent.length + inlineInitializer.length + 1 > printWidth
  ) {
    return `${expanded.text}\n${rhsIndent}${IMPORT_CALL_HEAD}\n${rhsIndent}${indentUnit}'${initializer.path}'\n${rhsIndent});`;
  }
  return `${expanded.text}\n${rhsIndent}${inlineInitializer};`;
};

const enforceFirebaseImports = createRule<Options, MessageIds>({
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
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDynamicImport:
        'Static import from firebaseCloud path "{{importPath}}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Load it at the call site instead, inside an async function body (e.g., `const { export } = await import(\'{{importPath}}\')`). Keep it out of module scope: a top-level `await import(...)` defers nothing and does not parse once the module is compiled to CommonJS.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    // Derived once per file rather than per fix: every fix in a file shares the
    // author's nesting step.
    let cachedIndentUnit: string | null = null;
    const fileIndentUnit = () => {
      if (cachedIndentUnit === null) {
        cachedIndentUnit = indentUnitOf(sourceCode);
      }
      return cachedIndentUnit;
    };
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

        const destructureEntry = (
          spec: TSESTree.ImportSpecifier,
        ): DestructureProperty =>
          spec.imported.name === spec.local.name
            ? { key: spec.local.name }
            : { key: spec.imported.name, value: spec.local.name };

        /**
         * The declarations to relocate, as structure rather than text: the line
         * they land on is only known at the insertion site, and its width is
         * what decides their printed shape.
         */
        const buildDeclarations = (): Declaration[] => {
          if (namespaceSpecifier) {
            const nsLocal = namespaceSpecifier.local.name;
            const declarations: Declaration[] = [
              {
                binding: { kind: 'name', name: nsLocal },
                initializer: { kind: 'import', path: importPath },
              },
            ];

            if (defaultSpecifier) {
              declarations.push({
                binding: { kind: 'name', name: defaultSpecifier.local.name },
                initializer: {
                  kind: 'expression',
                  text: `${nsLocal}.default`,
                },
              });
            }

            if (namedSpecifiers.length > 0) {
              declarations.push({
                binding: {
                  kind: 'pattern',
                  properties: namedSpecifiers.map(destructureEntry),
                },
                initializer: { kind: 'expression', text: nsLocal },
              });
            }

            return declarations;
          }

          const destructureProperties: DestructureProperty[] = [
            ...(defaultSpecifier
              ? [{ key: 'default', value: defaultSpecifier.local.name }]
              : []),
            ...namedSpecifiers.map(destructureEntry),
          ];

          // A side-effect import binds nothing, so there is no declaration to
          // relocate — the awaited call would have to stay at module scope.
          return destructureProperties.length > 0
            ? [
                {
                  binding: {
                    kind: 'pattern',
                    properties: destructureProperties,
                  },
                  initializer: { kind: 'import', path: importPath },
                },
              ]
            : [];
        };

        const printAt = (
          declarations: readonly Declaration[],
          indent: string,
        ): string[] =>
          declarations.map((declaration) =>
            printDeclaration(declaration, indent, fileIndentUnit(), printWidth),
          );

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
            const enclosing =
              enclosingAsyncBodyOf(reference.identifier) ??
              enclosingConciseAsyncArrowOf(reference.identifier);
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

        /**
         * Gives a concise-bodied arrow the block its declaration needs, turning
         * the returned expression into an explicit `return`.
         *
         * The expression is spliced verbatim out of the source rather than
         * reprinted from the AST: the parentheses around an object literal are
         * not part of its node, and a comment sitting between `=>` and the
         * expression belongs to neither, so both survive only by copying the
         * text the arrow already owns.
         */
        const blockifyConciseBody = (
          fixer: TSESLint.RuleFixer,
          arrow: TSESTree.ArrowFunctionExpression,
          declarations: readonly Declaration[],
        ): TSESLint.RuleFix | null => {
          const arrowToken = sourceCode.getTokenBefore(arrow.body, {
            filter: (token) =>
              token.type === AST_TOKEN_TYPES.Punctuator && token.value === '=>',
          });
          if (!arrowToken) {
            return null;
          }

          const expression = sourceCode
            .getText()
            .slice(arrowToken.range[1], arrow.range[1])
            .trim();
          const indent = indentationAt(arrow.loc.start.line);
          const bodyIndent = `${indent}${fileIndentUnit()}`;
          const lines = [
            ...printAt(declarations, bodyIndent),
            `return ${expression};`,
          ]
            .map((statement) => `\n${bodyIndent}${statement}`)
            .join('');

          return fixer.replaceTextRange(
            [arrowToken.range[1], arrow.range[1]],
            ` {${lines}\n${indent}}`,
          );
        };

        const buildFix: TSESLint.ReportFixFunction = (fixer) => {
          const target = findRelocationTarget();
          const declarations = buildDeclarations();
          if (!target || declarations.length === 0) {
            return null;
          }

          // Type-only specifiers are erased at compile time, so they stay where
          // they are instead of riding along into the function body.
          const importEdit =
            typeOnlySpecifiers.length > 0
              ? fixer.replaceText(
                  node,
                  `import type { ${buildTypeNames()} } from '${importPath}';`,
                )
              : fixer.removeRange([node.range[0], removalEnd()]);

          if (
            target.type === AST_NODE_TYPES.ArrowFunctionExpression &&
            target.body.type !== AST_NODE_TYPES.BlockStatement
          ) {
            const blockified = blockifyConciseBody(fixer, target, declarations);
            return blockified ? [importEdit, blockified] : null;
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

          const bodyIndent = neighbour
            ? indentationAt(neighbour.loc.start.line)
            : `${indentationAt(target.loc.start.line)}${fileIndentUnit()}`;

          // A body written on one line keeps its shape; a multi-line body gets
          // the declaration on its own line at the body's own indentation.
          //
          // The one-line body is the single emission the print width does not
          // govern: a block body holding statements is a shape no formatter
          // prints on one line at all, so there is no width at which the
          // author's layout survives and no wrapped form that would restore it.
          // Breaking the declaration open there would abandon that layout
          // without buying anything. Every other emission lands on a fresh line
          // whose column is known, and is printed against it.
          const insertion =
            following && following.loc.start.line === anchorLine
              ? ` ${declarations.map(printInline).join(' ')}`
              : printAt(declarations, bodyIndent)
                  .map((statement) => `\n${bodyIndent}${statement}`)
                  .join('');

          return [
            importEdit,
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
