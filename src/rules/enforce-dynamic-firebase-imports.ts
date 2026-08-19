import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  joinSegmentBody,
  requiresLineBreakAfter,
  requiresOwnLine,
} from '../utils/replacementSegments';
import type { ReplacementSegment } from '../utils/replacementSegments';

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
 * A per-line transform moving text written at `fromIndent` to `toIndent`, or
 * null when neither indentation is a prefix of the other (tabs against spaces),
 * where no delta can be applied without corrupting the layout.
 */
const lineShifterBetween = (
  fromIndent: string,
  toIndent: string,
): ((line: string) => string) | null => {
  if (fromIndent === toIndent) {
    return (line) => line;
  }
  if (fromIndent.startsWith(toIndent)) {
    const removed = fromIndent.slice(toIndent.length);
    return (line) =>
      line.startsWith(removed) ? line.slice(removed.length) : line;
  }
  if (toIndent.startsWith(fromIndent)) {
    const added = toIndent.slice(fromIndent.length);
    return (line) => `${added}${line}`;
  }
  return null;
};

/**
 * Ranges whose interior line breaks carry string data rather than formatting.
 * A multi-line template literal evaluates to the whitespace written inside it,
 * so shifting those lines would silently change the value the code produces.
 */
const stringDataRangesOf = (
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): TSESTree.Range[] =>
  sourceCode
    .getTokens(node)
    .filter(
      (token) =>
        (token.type === AST_TOKEN_TYPES.Template ||
          token.type === AST_TOKEN_TYPES.String) &&
        token.loc.start.line !== token.loc.end.line,
    )
    .map((token) => token.range);

/**
 * The source spanned by `range` with its continuation lines moved from the
 * depth they were written at to `toIndent`, or null when that move is not
 * expressible.
 *
 * An expression spliced out of a concise body lands one nesting level deeper
 * once the arrow gains a block, so every line after the first would otherwise
 * keep the column it had at the shallower depth (issue #2057). The first line
 * is excluded because it is spliced in directly after `return `, where it has
 * no indentation of its own left to adjust.
 */
const reindentedRange = (
  sourceCode: TSESLint.SourceCode,
  range: TSESTree.Range,
  stringData: readonly TSESTree.Range[],
  fromIndent: string,
  toIndent: string,
): string | null => {
  const text = sourceCode.getText().slice(range[0], range[1]);
  if (!text.includes('\n')) {
    return text;
  }

  const shiftLine = lineShifterBetween(fromIndent, toIndent);
  if (!shiftLine) {
    return null;
  }

  const carriesStringData = (offset: number) =>
    stringData.some(([start, end]) => start < offset && offset < end);

  let offset = range[0];
  return text
    .split('\n')
    .map((line, index) => {
      const lineStart = offset;
      offset += line.length + 1;
      if (index === 0 || line.trim() === '' || carriesStringData(lineStart)) {
        return line;
      }
      return shiftLine(line);
    })
    .join('\n');
};

/**
 * Type syntax that wraps an expression without changing where its parentheses
 * are needed, so an object literal behind one is still an object literal for
 * the purposes of {@link wrapsObjectLiteral}.
 */
const TYPE_WRAPPER_EXPRESSIONS = new Set<string>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

/**
 * Whether the parentheses around a concise body exist only to keep its leading
 * brace from parsing as a block.
 *
 * Those are the parentheses `return` makes dead, since a return argument is
 * already an expression position. Every other parenthesized body keeps them:
 * a broken-open binary expression or a multi-line JSX element is printed
 * parenthesized in return position too, so dropping them there would trade one
 * formatter rewrite for another.
 */
const wrapsObjectLiteral = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node = node;
  while (TYPE_WRAPPER_EXPRESSIONS.has(current.type)) {
    current = (current as unknown as { expression: TSESTree.Expression })
      .expression;
  }
  return current.type === AST_NODE_TYPES.ObjectExpression;
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

        const commentSegment = (
          comment: TSESTree.Comment,
        ): ReplacementSegment => ({
          text: sourceCode.getText().slice(comment.range[0], comment.range[1]),
          breakAfter: requiresLineBreakAfter(comment),
        });

        /**
         * The comments written inside the import, as one run of text to
         * re-emit ahead of the relocated declaration.
         *
         * The declaration is removed — or, in the type-only branch, re-authored
         * from its parts — wholesale, so a comment inside it has no anchor in
         * the replacement. Its subject survives, though: every value specifier
         * reappears in the emitted destructuring pattern, so the comment has
         * somewhere to go and dropping it would be the fixer writing text it
         * does not own. Declining instead would only let a comment decide
         * whether the rewrite happens at all, which is the same violation seen
         * from the other side (#1877), so the comments are carried (#2056).
         *
         * A `//` comment swallows whatever follows it on its line, so the run
         * breaks wherever `requiresLineBreakAfter` says it must, and the
         * declaration always begins on the line after it.
         */
        const carriedImportComments = (indent: string): string | null => {
          const comments = sourceCode.getCommentsInside(node);
          if (comments.length === 0) {
            return null;
          }
          return joinSegmentBody(comments.map(commentSegment), indent);
        };

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
         * The span of source the concise body's `return` takes as its argument.
         *
         * It is copied out of the file rather than reprinted from the AST,
         * because the parentheses around an object literal are not part of the
         * literal's node and a broken-open expression's own line breaks are not
         * recoverable from it. The one thing left behind is a parenthesis pair
         * that exists solely to keep a leading brace from parsing as a block:
         * `return` already supplies an expression position, so those are dead
         * and a formatter strips them (#2057). Any other parenthesized body
         * keeps its parentheses — a broken-open binary expression and a
         * multi-line JSX element are printed parenthesized in return position
         * too.
         */
        const returnedExpressionRange = (
          arrow: TSESTree.ArrowFunctionExpression,
          arrowToken: TSESTree.Token,
        ): TSESTree.Range => {
          const first = sourceCode.getTokenAfter(arrowToken);
          const last = sourceCode.getLastToken(arrow);
          const disambiguatingParens =
            !!first &&
            !!last &&
            first.type === AST_TOKEN_TYPES.Punctuator &&
            first.value === '(' &&
            last.type === AST_TOKEN_TYPES.Punctuator &&
            last.value === ')' &&
            first.range[1] <= arrow.body.range[0] &&
            last.range[0] >= arrow.body.range[1] &&
            wrapsObjectLiteral(arrow.body);
          return disambiguatingParens
            ? [arrow.body.range[0], arrow.body.range[1]]
            : [first ? first.range[0] : arrowToken.range[1], arrow.range[1]];
        };

        /**
         * Gives a concise-bodied arrow the block its declaration needs, turning
         * the returned expression into an explicit `return`.
         *
         * The expression moves one nesting level deeper on the way in, so its
         * continuation lines are shifted by that delta rather than spliced at
         * the column they were written at — everything a multi-line concise
         * body holds would otherwise land under-indented inside the block it
         * gains (#2057). Lines whose breaks belong to a template literal are
         * left alone: their whitespace is the string's own value.
         *
         * A comment written between `=>` and the expression annotates neither
         * node, so it is carried across explicitly. One that cannot share a
         * line with what follows takes a line of its own ABOVE the `return`:
         * after `return` a line break — or a block comment carrying one, which
         * the grammar reads as a line terminator — triggers ASI and silently
         * replaces the returned value with `undefined` (#1963).
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

          const indent = indentationAt(arrow.loc.start.line);
          const bodyIndent = `${indent}${fileIndentUnit()}`;
          const range = returnedExpressionRange(arrow, arrowToken);
          const expression = reindentedRange(
            sourceCode,
            range,
            stringDataRangesOf(sourceCode, arrow),
            indentationAt(sourceCode.getLocFromIndex(range[0]).line),
            bodyIndent,
          );
          // Tab-indented source under a space-indented block, or the reverse,
          // admits no expressible delta; the body would land mangled, so the
          // fix is withheld and the report stands.
          if (expression === null) {
            return null;
          }

          const outer = sourceCode
            .getCommentsInside(arrow)
            .filter(
              (comment) =>
                comment.range[0] >= arrowToken.range[1] &&
                (comment.range[1] <= range[0] || comment.range[0] >= range[1]),
            );
          const leading = outer.filter(
            (comment) => comment.range[1] <= range[0],
          );
          const trailing = outer.filter(
            (comment) => comment.range[0] >= range[1],
          );
          const hoisted = leading.filter(requiresOwnLine);

          const statement = `return ${joinSegmentBody(
            [
              ...leading
                .filter((comment) => !requiresOwnLine(comment))
                .map(commentSegment),
              { text: `${expression};`, breakAfter: false },
              ...trailing.map(commentSegment),
            ],
            bodyIndent,
          )}`;

          const carried = carriedImportComments(bodyIndent);
          const lines = [
            ...(carried === null ? [] : [carried]),
            ...printAt(declarations, bodyIndent),
            ...hoisted.map((comment) => commentSegment(comment).text),
            statement,
          ]
            .map((emitted) => `\n${bodyIndent}${emitted}`)
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
          const inlineBody = Boolean(
            following && following.loc.start.line === anchorLine,
          );
          const bodyIndent =
            neighbour && !inlineBody
              ? indentationAt(neighbour.loc.start.line)
              : `${indentationAt(target.loc.start.line)}${fileIndentUnit()}`;

          // A carried comment forces the multi-line form even for a one-line
          // body: a `//` comment appended to that line would swallow the rest
          // of it, and the comment-free emission is unchanged either way.
          const carried = carriedImportComments(bodyIndent);
          const insertion =
            inlineBody && carried === null
              ? ` ${declarations.map(printInline).join(' ')}`
              : [
                  ...(carried === null ? [] : [carried]),
                  ...printAt(declarations, bodyIndent),
                ]
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
