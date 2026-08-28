/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

export type NodeWithParent = TSESTree.Node & { parent: NodeWithParent };

export type ComponentNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration;

export type RequireMemoOptions = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. The declaration rewrite authors a line whose
 * length grows with the component's name — the name is spelled twice — so past
 * this width a formatter rewrites the fixed source, and `prettier --check`
 * fails on it in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

const isComponentExplicitlyUnmemoized = (componentName: string) =>
  componentName.toLowerCase().includes('unmemoized');

// React's universal convention: only PascalCase-initial identifiers are
// treated as components. camelCase names are render-prop callbacks or plain
// helper functions that are invoked directly (e.g. MUI's renderCell(params)),
// NOT React components — wrapping them in memo() would break callers.
const startsWithUppercase = (name: string) => /^[A-Z]/.test(name);

function isFunction(
  node: TSESTree.Node,
): node is
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function isHigherOrderFunctionReturningJSX(
  node: TSESTree.Node,
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
): boolean {
  if (isFunction(node)) {
    if (node.body && node.body.type === 'BlockStatement') {
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          const returnsJSX = ASTHelpers.returnsJSX(statement.argument, context);
          const returnsFunction = isFunction(statement.argument);

          return returnsFunction && returnsJSX;
        }
      }
    } else if (node.body && isFunction(node.body)) {
      // Shorthand arrow HOC: (Comp) => (props) => <Comp {...props} />
      // Here node.body is the inner function; check if it returns JSX.
      return ASTHelpers.returnsJSX(node.body, context);
    }
  }
  return false;
}

const isUnmemoizedArrowFunction = (
  node: ComponentNode,
  parentNode: TSESTree.Node,
) => {
  return (
    parentNode.type === 'VariableDeclarator' &&
    parentNode.id.type === 'Identifier' &&
    startsWithUppercase(parentNode.id.name) &&
    !isComponentExplicitlyUnmemoized(parentNode.id.name) &&
    !isMemoizedAtEscape(parentNode.id.name, node)
  );
};

/**
 * The nearest function whose body lexically contains `node`. Climbing from the
 * parent keeps a function from being treated as its own enclosing function.
 */
function enclosingFunctionOf(node: TSESTree.Node): ComponentNode | null {
  let current = node.parent as TSESTree.Node | undefined;
  while (current) {
    if (isFunction(current)) {
      return current;
    }
    current = current.parent as TSESTree.Node | undefined;
  }
  return null;
}

/**
 * Return arguments belonging to `fn` itself. Descent stops at a nested
 * function, whose returns belong to it rather than to `fn`.
 */
function ownReturnArguments(fn: ComponentNode): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }

  const args: TSESTree.Node[] = [];
  const visit = (node: TSESTree.Node) => {
    if (isFunction(node)) {
      return;
    }
    if (node.type === AST_NODE_TYPES.ReturnStatement) {
      if (node.argument) {
        args.push(node.argument);
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (ASTHelpers.isNode(item)) {
            visit(item);
          }
        }
      } else if (ASTHelpers.isNode(value)) {
        visit(value);
      }
    }
  };

  fn.body.body.forEach(visit);
  return args;
}

/** Strips type-level wrappers so `return Row as ComponentType<P>` still reads as `Row`. */
function unwrapValue(node: TSESTree.Node): TSESTree.Node {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    // ESTree wraps a whole optional chain in a ChainExpression, so `memo?.(Row)`
    // and `React?.memo(Row)` reach here as something other than a CallExpression.
    node.type === AST_NODE_TYPES.ChainExpression
  ) {
    return unwrapValue(node.expression);
  }
  return node;
}

/**
 * Whether `node` spells React's memoization helper in callee position: the bare
 * `memo` binding or a member access ending in `.memo` (`React.memo`).
 */
function isMemoCallee(node: TSESTree.Node): boolean {
  const callee = unwrapValue(node);
  return (
    (callee.type === AST_NODE_TYPES.Identifier && callee.name === MEMO_NAME) ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === MEMO_NAME)
  );
}

/** Whether `componentName` appears in `node`'s (possibly nested) call arguments. */
function callArgumentsMention(
  node: TSESTree.Node,
  componentName: string,
): boolean {
  const value = unwrapValue(node);
  if (
    value.type === AST_NODE_TYPES.Identifier &&
    value.name === componentName
  ) {
    return true;
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return value.arguments.some((argument) =>
      callArgumentsMention(argument, componentName),
    );
  }
  return false;
}

/**
 * The values a container hands to its caller: object property values and array
 * elements. A component reaches callers through one exactly as it does through
 * a bare return — `{ __esModule: true, default: <component> }` is the shape
 * every `jest.mock()` factory returns for a default export — so both questions
 * the carve-out asks read through containers, at any depth.
 *
 * A property KEY is not a carried value: `{ Row: memo(Row) }` names the export
 * with the same identifier it memoizes, and reading the key would call that a
 * bare escape. A spread is excluded in both directions, so `{ ...Row }`, which
 * copies a component's own properties rather than handing the component back,
 * keeps the verdict it has.
 */
function containedValues(node: TSESTree.Node): TSESTree.Node[] {
  const value = unwrapValue(node);
  if (value.type === AST_NODE_TYPES.ObjectExpression) {
    return value.properties
      .filter(
        (property): property is TSESTree.Property =>
          property.type === AST_NODE_TYPES.Property,
      )
      .map((property) => property.value);
  }
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.filter(
      (element): element is TSESTree.Expression =>
        !!element && element.type !== AST_NODE_TYPES.SpreadElement,
    );
  }
  return [];
}

/**
 * Whether `node` hands `componentName` to memo(), possibly through another
 * wrapper — `memo(Row)`, `memo(forwardRef(Inner))`, `forwardRef(memo(Inner))` —
 * or inside a container, `{ __esModule: true, default: memo(Row) }`.
 */
function memoizesComponent(
  node: TSESTree.Node,
  componentName: string,
): boolean {
  const value = unwrapValue(node);
  if (value.type === AST_NODE_TYPES.CallExpression) {
    if (
      isMemoCallee(value.callee) &&
      value.arguments.some((argument) =>
        callArgumentsMention(argument, componentName),
      )
    ) {
      return true;
    }
    return value.arguments.some((argument) =>
      memoizesComponent(argument, componentName),
    );
  }
  return containedValues(value).some((carried) =>
    memoizesComponent(carried, componentName),
  );
}

/**
 * Whether this hand-back lets a caller receive `componentName` un-memoized —
 * returned bare, or carried bare inside a container.
 *
 * Kept in step with {@link memoizesComponent} by design: a container that the
 * memo question reads but this one does not would turn `return { default: Row }`
 * from a report into a silent escape, trading a false positive for a false
 * negative. Call arguments are deliberately not descended into, because
 * `wrap(Row)` hands back whatever `wrap` returns rather than `Row` itself.
 */
function escapesUnmemoized(
  node: TSESTree.Node,
  componentName: string,
): boolean {
  const value = unwrapValue(node);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return value.name === componentName;
  }
  return containedValues(value).some((carried) =>
    escapesUnmemoized(carried, componentName),
  );
}

/**
 * Whether `componentName` is already memoized at the point it escapes its
 * enclosing function: every hand-back to callers goes through `memo(...)`
 * (`return memo(Row)`, `return memo(forwardRef(Inner))`, or the same call
 * carried in a container as in `return { __esModule: true, default: memo(Row) }`),
 * so a second wrapper at the declaration would be redundant. A bare hand-back on
 * ANY return path (`return Row`, `return { default: Row }`) defeats the
 * carve-out — callers can receive the un-memoized function, and memoizing it
 * where it is declared is exactly the remedy.
 *
 * This is the one lifetime question the rule asks, and it is asked of BOTH
 * spellings: a carve-out keyed to one function syntax is a detection asymmetry,
 * not a design (#1774). Nesting in particular is NOT a carve-out — a component
 * declared inside a render body is also claimed by
 * `memo-nested-react-components`, whose hoist-it-out remedy repairs the
 * remount-per-render damage; this rule's memo() wrapper is the complementary
 * step that keeps the (hoisted) component's consumers from re-rendering.
 */
function isMemoizedAtEscape(
  componentName: string,
  node: ComponentNode,
): boolean {
  const enclosing = enclosingFunctionOf(node);
  if (!enclosing) {
    return false;
  }
  const handBacks = ownReturnArguments(enclosing);
  if (
    handBacks.some((argument) => escapesUnmemoized(argument, componentName))
  ) {
    return false;
  }
  return handBacks.some((argument) =>
    memoizesComponent(argument, componentName),
  );
}

const isUnmemoizedFunctionComponent = (node: TSESTree.Node) => {
  return (
    node.type === 'FunctionDeclaration' &&
    !!node.id &&
    startsWithUppercase(node.id.name) &&
    !isComponentExplicitlyUnmemoized(node.id.name) &&
    !isMemoizedAtEscape(node.id.name, node)
  );
};

/**
 * Statement positions where the rewritten `const X = memo(...)` is legal. A
 * function declaration is also grammatical as the lone body of an `if` or a
 * labelled statement, where a lexical declaration is not, so the report there
 * stands without an edit.
 */
const CONST_HOSTING_PARENTS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
  AST_NODE_TYPES.TSModuleBlock,
]);

const canHostConstDeclaration = (parentNode: TSESTree.Node) =>
  CONST_HOSTING_PARENTS.has(parentNode.type);

const MEMO_NAME = 'memo';

function isMemoImport(importPath: string): boolean {
  // Match both absolute and relative paths ending with util/memo
  return /(?:^|\/|\\)util\/memo$/.test(importPath);
}

/**
 * Value `util/memo` import declarations in source order. A type-only
 * declaration (`import type { MemoOptions } from '../util/memo'`) is excluded
 * because a specifier appended to one erases at compile time, leaving the
 * emitted `memo(...)` call unbound at runtime.
 */
function memoValueImports(
  program: TSESTree.Program,
): TSESTree.ImportDeclaration[] {
  return program.body.filter(
    (statement): statement is TSESTree.ImportDeclaration =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      statement.importKind !== 'type' &&
      isMemoImport(statement.source.value),
  );
}

/**
 * A named specifier that binds `memo` under its own name — the only shape that
 * makes the emitted `memo(...)` call reach the helper. An alias in either
 * direction (`memo as m`, `createMemo as memo`) or a type-only specifier binds
 * something else, or nothing at all, at runtime.
 */
function isMemoSpecifier(
  specifier: TSESTree.Node,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.name === MEMO_NAME &&
    specifier.local.name === MEMO_NAME
  );
}

/**
 * Import state is read off `Program.body` at fix time rather than from a
 * traversal flag: a component that precedes the import declaration in source
 * order is fixed before an `ImportDeclaration` visitor would have run, so a
 * flag would call the import missing and insert a duplicate.
 */
function importsMemo(program: TSESTree.Program): boolean {
  return memoValueImports(program).some((declaration) =>
    declaration.specifiers.some(isMemoSpecifier),
  );
}

/**
 * Whether every declaration of a visible `memo` binding is the helper import.
 * A const/let/function/class, a parameter, a namespace or default import, an
 * alias, or a named import from another module all mean the emitted `memo(...)`
 * call would resolve somewhere other than the helper.
 */
function bindsMemoHelper(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isMemoSpecifier(specifier)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        isMemoImport(declaration.source.value)
      );
    })
  );
}

/**
 * The whitespace opening the line `node` starts on, or null when other tokens
 * precede it there — the caller then has no line indent to mirror.
 */
function lineIndentBefore(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): string | null {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const prefix = line.slice(0, node.loc.start.column);
  return /^\s*$/.test(prefix) ? prefix : null;
}

/**
 * Whether extending `declaration` with `addition` still fits the print width
 * on one line. Prettier prints the terminating semicolon whether or not the
 * source spells it, so a missing one still costs a column.
 */
function extendedImportFits(
  sourceCode: TSESLint.SourceCode,
  declaration: TSESTree.ImportDeclaration,
  indent: string,
  addition: string,
  printWidth: number,
): boolean {
  const declText = sourceCode.getText(declaration);
  const semicolonDebt = declText.endsWith(';') ? 0 : 1;
  return (
    indent.length + declText.length + addition.length + semicolonDebt <=
    printWidth
  );
}

/**
 * Re-lays a single-line named import into Prettier's one-specifier-per-line
 * form with `memo` appended, touching only the separator gaps between the
 * braces and the specifiers. Each specifier's own text is carried verbatim, so
 * a comment INSIDE a specifier survives; a comment in a replaced gap would be
 * silently deleted by the rewrite, so its presence withholds this layout
 * entirely (null) and the caller falls back to a separate declaration that
 * touches none of the existing bytes.
 */
function buildExpandedImportFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  named: TSESTree.ImportSpecifier[],
  declIndent: string,
): TSESLint.RuleFix[] | null {
  const openBrace = sourceCode.getTokenBefore(named[0], {
    filter: (token) => token.value === '{',
  });
  const closeBrace = sourceCode.getTokenAfter(named[named.length - 1], {
    filter: (token) => token.value === '}',
  });
  if (!openBrace || !closeBrace) return null;
  const specIndent = `${declIndent}  `;
  const gaps: [number, number, string][] = [
    [openBrace.range[1], named[0].range[0], `\n${specIndent}`],
  ];
  for (let i = 0; i < named.length - 1; i++) {
    gaps.push([named[i].range[1], named[i + 1].range[0], `,\n${specIndent}`]);
  }
  gaps.push([
    named[named.length - 1].range[1],
    closeBrace.range[0],
    `,\n${specIndent}${MEMO_NAME},\n${declIndent}`,
  ]);
  const fixes: TSESLint.RuleFix[] = [];
  for (const [start, end, replacement] of gaps) {
    const gapText = sourceCode.text.slice(start, end);
    if (!/^[\s,]*$/.test(gapText)) return null;
    fixes.push(fixer.replaceTextRange([start, end], replacement));
  }
  return fixes;
}

/**
 * Extends an existing value `util/memo` import with a `memo` specifier instead
 * of adding a second declaration, in the layout Prettier keeps. Measure, do
 * not always-append: joining `, memo` onto a line that then exceeds the print
 * width hands Prettier a line it re-wraps, so the --fix output churns on the
 * next format. Three layouts cover what Prettier does with an import:
 *
 * - the extended declaration fits on one line: append in place;
 * - the declaration is already multi-line (Prettier's own overflow layout):
 *   the new specifier gets its own line at the specifiers' indent;
 * - a single-line declaration stops fitting: re-lay it one specifier per line,
 *   unless a comment occupies a separator gap the re-layout would own.
 *
 * Namespace imports cannot host a named specifier — neither `* as ns` alone
 * nor the `d, * as ns` pair leaves a grammatical slot for `{ memo }` — so
 * those fall through to a separate declaration (null), as does a
 * side-effect-only declaration.
 */
function buildImportExtensionFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  printWidth: number,
): TSESLint.RuleFix[] | null {
  for (const declaration of memoValueImports(sourceCode.ast)) {
    if (
      declaration.specifiers.some(
        (specifier) =>
          specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
      )
    ) {
      continue;
    }
    const declIndent = lineIndentBefore(sourceCode, declaration) ?? '';
    const named = declaration.specifiers.filter(
      (specifier): specifier is TSESTree.ImportSpecifier =>
        specifier.type === AST_NODE_TYPES.ImportSpecifier,
    );
    if (named.length > 0) {
      const last = named[named.length - 1];
      if (declaration.loc.start.line !== declaration.loc.end.line) {
        const specIndent =
          lineIndentBefore(sourceCode, last) ?? `${declIndent}  `;
        return [fixer.insertTextAfter(last, `,\n${specIndent}${MEMO_NAME}`)];
      }
      if (
        extendedImportFits(
          sourceCode,
          declaration,
          declIndent,
          `, ${MEMO_NAME}`,
          printWidth,
        )
      ) {
        return [fixer.insertTextAfter(last, `, ${MEMO_NAME}`)];
      }
      const expansion = buildExpandedImportFix(
        fixer,
        sourceCode,
        named,
        declIndent,
      );
      if (expansion) return expansion;
      continue;
    }
    const defaultSpecifier = declaration.specifiers.find(
      (specifier) => specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
    );
    if (defaultSpecifier) {
      const addition = `, { ${MEMO_NAME} }`;
      if (
        declaration.loc.start.line === declaration.loc.end.line &&
        !extendedImportFits(
          sourceCode,
          declaration,
          declIndent,
          addition,
          printWidth,
        )
      ) {
        return [
          fixer.insertTextAfter(
            defaultSpecifier,
            `, {\n${declIndent}  ${MEMO_NAME},\n${declIndent}}`,
          ),
        ];
      }
      return [fixer.insertTextAfter(defaultSpecifier, addition)];
    }
  }
  return null;
}

/**
 * An `async` or generator function cannot be a React component — React renders
 * neither a promise nor an iterator — so memoizing one would enshrine a shape
 * that never renders. The report stands, the edit is withheld.
 */
const isRewritableFunction = (node: ComponentNode) =>
  !node.async && !(node as any).generator;

/**
 * Whether the call registers the one module factory jest hoists.
 *
 * `jest.mock` alone: `babel-plugin-jest-hoist` carries no case for `doMock` or
 * `setMock`, which exist precisely to run in place, so a factory passed to
 * either keeps its access to the module's bindings and needs no carve-out.
 */
function isHoistedMockCall(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const { object, property } = callee;
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === 'jest' &&
    property.type === AST_NODE_TYPES.Identifier &&
    property.name === 'mock'
  );
}

/**
 * Whether the node sits inside the factory jest hoists — the second argument of
 * the call. The module specifier that precedes it is evaluated in place and
 * keeps its access to the file's imports, so only the factory subtree is out of
 * reach.
 */
function isInsideMockFactory(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments[1] === child &&
      isHoistedMockCall(parent)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/**
 * Whether the emitted `memo(...)` call can reach the helper, and the import edit
 * that makes it so (null when the helper is already imported).
 *
 * `available: false` withholds the whole rewrite. `memo` is resolved through the
 * scope chain at the rewritten component because a binding that is not the
 * helper import breaks the edit two ways: the inserted import collides with the
 * existing declaration (TS2440, or TS2300 when that declaration is itself an
 * import), and a binding visible at the fix site captures the emitted call with
 * no compile error at all. Declining leaves the report standing so the author
 * resolves the clash deliberately. `React.memo` is a member access on the
 * default import rather than a `memo` binding, so it never reaches this path.
 */
function planMemoBinding(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  fixer: TSESLint.RuleFixer,
  node: ComponentNode,
  printWidth: number,
): { available: boolean; importFix: TSESLint.RuleFix[] | null } {
  // Jest hoists a `jest.mock()` factory above the module's imports, so the
  // helper is unbound when the factory runs and jest rejects the reference
  // outright ("Invalid variable access: memo"). This holds whether the import
  // is injected here or already present, so it is decided before the
  // already-imported shortcut below. The report stands because legal spellings
  // exist: `import { memo as mockMemo }`, or `jest.requireActual` in-factory.
  if (isInsideMockFactory(node)) {
    return { available: false, importFix: null };
  }

  const existingMemo = ASTHelpers.findVariableInScope(
    ASTHelpers.getScope(context, node),
    MEMO_NAME,
  );
  if (existingMemo && !bindsMemoHelper(existingMemo)) {
    return { available: false, importFix: null };
  }

  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  if (importsMemo(program)) {
    return { available: true, importFix: null };
  }

  const extensionFix = buildImportExtensionFix(fixer, sourceCode, printWidth);
  if (extensionFix) {
    return { available: true, importFix: extensionFix };
  }

  const importPath = calculateImportPath(context.getFilename());
  const importStatement = `import { memo } from '${importPath}';`;
  const firstImport = program.body.find(
    (statement) => statement.type === AST_NODE_TYPES.ImportDeclaration,
  );

  // An existing import hosts the helper import directly after it, keeping the
  // module's imports contiguous. With none to follow, the shared anchor keeps
  // the file's prologue in place: a `'use client'` directive only counts as one
  // while it is the first statement, and a `#!` shebang only parses at
  // character 0.
  return {
    available: true,
    importFix: [
      firstImport
        ? fixer.insertTextAfter(firstImport, `\n${importStatement}`)
        : insertAtImportAnchor(
            sourceCode,
            fixer,
            importInsertionAnchor(sourceCode),
            `${importStatement}\n`,
          ),
    ],
  };
}

/**
 * Whether `memo(...)` can be wrapped around the initializer of `declarator`
 * without changing what the binding means.
 *
 * A type annotation on the binding is the decisive exclusion: the wrapper's
 * return type is the memo helper's, which need not be assignable to the
 * declared type (`const Row: FC<Props> = ...`), so the edit would trade a
 * lint report for a type error. A lone `const` declarator is the shape whose
 * initializer is the binding's only definition — `let`/`var` can be reassigned
 * afterwards, leaving the name bound to an unmemoized value that the edit only
 * appears to have fixed, and a shared declaration's other declarators may carry
 * reports of their own whose edits then compete for the same import anchor.
 */
function isWrappableInitializer(declarator: TSESTree.VariableDeclarator) {
  if (
    declarator.id.type !== AST_NODE_TYPES.Identifier ||
    declarator.id.typeAnnotation
  ) {
    return false;
  }
  const declaration = declarator.parent;
  return (
    declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
    declaration.kind === 'const' &&
    declaration.declarations.length === 1
  );
}

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps the appended
 * wrapper in the author's units instead of assuming a two-space file.
 */
function indentUnitOf(sourceCode: TSESLint.SourceCode): string {
  const text = sourceCode.getText();
  // A block comment's interior lines carry the comment's own alignment — the
  // `*` one column in from its indentation — which is not a nesting step of the
  // file. Counting them makes a JSDoc-heavy file look one-space indented.
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') {
      continue;
    }
    if (
      blockComments.some(([start, end]) => start < lineStart && lineStart < end)
    ) {
      continue;
    }
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const step = indent.slice(previous.length);
      frequencies.set(step, (frequencies.get(step) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [step, count] of frequencies) {
    if (count > best) {
      unit = step;
      best = count;
    }
  }
  return unit;
}

/** The `export`/`export default` declaration wrapping `node`, if any. */
function exportWrapperOf(node: ComponentNode & NodeWithParent) {
  return node.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration ||
    node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
    ? node.parent
    : null;
}

/**
 * The memo binding the split shape appends below the declaration.
 *
 * Prettier keeps `const X = memo(XUnmemoized);` on one line while it fits and
 * breaks the sole argument out past the width — and collapses the broken form
 * back onto one line when it fits — so the two spellings are chosen by
 * measurement. A blanket break would land the mirror-image defect on every
 * short name.
 */
function memoWrapperStatement(
  name: string,
  indent: string,
  exported: boolean,
  printWidth: number,
  indentStep: string,
): string {
  const keyword = exported ? 'export const' : 'const';
  const inline = `${keyword} ${name} = ${MEMO_NAME}(${name}Unmemoized);`;
  if (indent.length + inline.length <= printWidth) {
    return `${indent}${inline}`;
  }
  return (
    `${indent}${keyword} ${name} = ${MEMO_NAME}(\n` +
    `${indent}${indentStep}${name}Unmemoized,\n` +
    `${indent});`
  );
}

/**
 * Whether the declaration should become a renamed declaration plus a separate
 * memo binding rather than the in-place `const X = memo(function XUnmemoized`.
 *
 * The in-place shape splices two copies of the component's name into the
 * declaration's first line, so that line grows by 24 + len(name) columns — 96
 * for a 20-character exported name whose parameters are already broken one per
 * line. Past the print width a formatter rewrites the whole declaration and
 * re-indents its body, so a `--fix` run leaves the tree failing
 * `prettier --check`. Splitting the wrapper onto its own statement puts one
 * identifier per line instead, which no width can overflow.
 *
 * The switch is a measurement, not a default: the split shape moves the
 * wrapper below the body, detaching a leading JSDoc comment from the exported
 * binding, so it is only taken where the in-place header does not fit.
 *
 * Only the in-place width is measured, because the split shape is the better
 * answer even when its own first line overflows. A formatter resolves an
 * over-wide `function XUnmemoized(<params>)` by breaking the parameter list
 * alone, which leaves the body at the depth the author wrote it; an over-wide
 * in-place header instead forces the `memo(` call open and re-indents every
 * line of the body. Comparing the two shapes' widths would trade the second
 * outcome for the first on exactly the declarations that suffer most from it.
 */
function shouldSplitDeclaration(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  node: ComponentNode & NodeWithParent,
  printWidth: number,
): boolean {
  const name = node.id!.name;
  // A name spelled across two lines has no single header to measure, and the
  // rename's landing column is not the one this arithmetic assumes.
  if (node.id!.loc.start.line !== node.loc.start.line) {
    return false;
  }

  // The split shape introduces `<Name>Unmemoized` as a real binding in the
  // enclosing scope, where the in-place shape only names a function
  // expression. An existing binding of that name would be redeclared, or
  // shadowed out from under the code that reads it.
  if (
    ASTHelpers.findVariableInScope(
      ASTHelpers.getScope(context, node),
      `${name}Unmemoized`,
    )
  ) {
    return false;
  }

  const text = context.sourceCode.getText();
  const exportWrapper = exportWrapperOf(node);
  const start = (exportWrapper ?? node).range[0];
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const indent = text.slice(lineStart, start);
  // A declaration sharing its line with other code has no indentation of its
  // own to give the appended statement.
  if (!/^[ \t]*$/.test(indent)) {
    return false;
  }

  // The split shape drops the export keywords from the declaration. Anything
  // else between them and `function` — a comment — would be dropped with them.
  const droppedPrefix = text.slice(start, node.range[0]);
  if (!/^(?:export\s+(?:default\s+)?)?$/.test(droppedPrefix)) {
    return false;
  }

  // The header is what precedes the body's opening brace: a formatter always
  // breaks a non-empty function body onto its own lines, so whatever a
  // compressed source keeps on the declaration's line after `{` is text the
  // formatter moves regardless of which shape the fix takes. Measuring to the
  // brace — or to the first line break, whichever comes first, since broken
  // parameters end the line earlier — is therefore the emitted first line of a
  // formatted file.
  const lineBreak = text.indexOf('\n', node.id!.range[1]);
  const headerEnd = Math.min(
    lineBreak === -1 ? text.length : lineBreak,
    node.body.range[0] + 1,
  );
  const tail = text.slice(node.id!.range[1], headerEnd);

  // A default export is the one form the in-place shape also relocates: the
  // keywords cannot precede a `const`, so they are dropped here and re-emitted
  // as a trailing `export default X;`. A named export's keyword stays on the
  // line and counts toward its width.
  const inlinePrefix =
    exportWrapper?.type === AST_NODE_TYPES.ExportDefaultDeclaration
      ? indent
      : text.slice(lineStart, node.range[0]);
  const inlineWidth =
    inlinePrefix.length +
    `const ${name} = ${MEMO_NAME}(function ${name}Unmemoized`.length +
    tail.length;
  return inlineWidth > printWidth;
}

/**
 * Rewrites a function declaration into a memoized `const`, renaming the function
 * itself to `<Name>Unmemoized` so the wrapped component keeps a display name.
 *
 * Two shapes carry that rewrite. The in-place one splices the wrapper into the
 * declaration's own header; the split one leaves the (renamed) declaration
 * where it stands and appends the memo binding as its own statement, which is
 * the width-safe spelling for a long name. See {@link shouldSplitDeclaration}.
 */
function memoizeDeclaration(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  node: ComponentNode & NodeWithParent,
  printWidth: number,
): TSESLint.ReportFixFunction {
  return function fix(fixer) {
    if (!isRewritableFunction(node)) {
      return null;
    }

    const { available, importFix } = planMemoBinding(
      context,
      fixer,
      node,
      printWidth,
    );
    if (!available) {
      return null;
    }

    // `export default const X = memo(...)` is a syntax error, so a
    // default-exported declaration becomes a memoized const plus a trailing
    // `export default X;`. The local binding is preserved because other
    // statements in the module may reference it.
    const defaultExport =
      node.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
        ? node.parent
        : null;

    const fixes = shouldSplitDeclaration(context, node, printWidth)
      ? splitFixes(context, fixer, node, printWidth, defaultExport)
      : inlineFixes(fixer, node, defaultExport);

    if (importFix) {
      fixes.push(...importFix);
    }

    return fixes;
  };
}

/** `export const X = memo(function XUnmemoized(<params>) { ... });` */
function inlineFixes(
  fixer: TSESLint.RuleFixer,
  node: ComponentNode & NodeWithParent,
  defaultExport: TSESTree.Node | null,
): TSESLint.RuleFix[] {
  const name = node.id!.name;
  const functionKeywordRange: Readonly<[number, number]> = [
    node.range[0],
    node.range[0] + 'function'.length,
  ];

  const fixes = [
    fixer.replaceTextRange(
      functionKeywordRange,
      `const ${name} = ${MEMO_NAME}(`,
    ),
    fixer.insertTextAfterRange(
      [node.range[1], node.range[1]],
      defaultExport ? `);\nexport default ${name};` : ');',
    ),
    fixer.replaceTextRange(
      [node.id!.range[0] - 1, node.id!.range[1]],
      `function ${name}Unmemoized`,
    ),
  ];

  if (defaultExport) {
    fixes.push(fixer.removeRange([defaultExport.range[0], node.range[0]]));
  }

  return fixes;
}

/**
 * `function XUnmemoized(<params>) { ... }` followed by the memo binding as its
 * own statement.
 *
 * The declaration and its body are left exactly where the author put them, so
 * nothing is re-indented and the appended statement carries one identifier per
 * line. The export keywords move with the binding: a named export re-exports
 * the const, and a default export keeps the local binding plus a trailing
 * `export default X;`, matching the in-place shape.
 */
function splitFixes(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  fixer: TSESLint.RuleFixer,
  node: ComponentNode & NodeWithParent,
  printWidth: number,
  defaultExport: TSESTree.Node | null,
): TSESLint.RuleFix[] {
  const name = node.id!.name;
  const text = context.sourceCode.getText();
  const exportWrapper = exportWrapperOf(node);
  const start = (exportWrapper ?? node).range[0];
  const indent = text.slice(text.lastIndexOf('\n', start - 1) + 1, start);

  const wrapper = memoWrapperStatement(
    name,
    indent,
    !!exportWrapper && !defaultExport,
    printWidth,
    indentUnitOf(context.sourceCode),
  );
  const trailer = defaultExport ? `\n${indent}export default ${name};` : '';

  const fixes = [
    fixer.replaceTextRange(node.id!.range, `${name}Unmemoized`),
    fixer.insertTextAfterRange(
      [node.range[1], node.range[1]],
      `\n${wrapper}${trailer}`,
    ),
  ];

  if (exportWrapper) {
    fixes.push(fixer.removeRange([exportWrapper.range[0], node.range[0]]));
  }

  return fixes;
}

/**
 * Wraps a `const X = <function>` initializer in `memo(...)` where it stands.
 *
 * The binding, its name and the function's own text are left untouched, so
 * every reference to the component keeps resolving to the same name and an
 * anonymous initializer is not forced into a spelling it did not have.
 */
function memoizeInitializer(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  node: ComponentNode,
  printWidth: number,
): TSESLint.ReportFixFunction {
  return function fix(fixer) {
    if (!isRewritableFunction(node)) {
      return null;
    }

    const { available, importFix } = planMemoBinding(
      context,
      fixer,
      node,
      printWidth,
    );
    if (!available) {
      return null;
    }

    const fixes = [
      fixer.insertTextBefore(node, `${MEMO_NAME}(`),
      fixer.insertTextAfter(node, ')'),
    ];

    if (importFix) {
      fixes.push(...importFix);
    }

    return fixes;
  };
}

function checkFunction(
  context: Readonly<RuleContext<'requireMemo', RequireMemoOptions>>,
  node: ComponentNode & NodeWithParent,
  printWidth: number,
) {
  const fileName = context.getFilename();
  if (!fileName.endsWith('.tsx')) {
    return;
  }
  if (isHigherOrderFunctionReturningJSX(node, context)) {
    return;
  }
  const parentNode = node.parent;
  if (node.parent.type === 'CallExpression') {
    return;
  }

  // The FUNCTION is the subject, not its body: handing the body makes a
  // concise arrow's body arrive as the handed node, which returnsJSX unwraps
  // when it is itself a function rather than reading it as a value (#2186).
  if (ASTHelpers.returnsJSX(node, context) && ASTHelpers.hasParameters(node)) {
    const isDeclarationComponent = isUnmemoizedFunctionComponent(node);
    const isArrowComponent = isUnmemoizedArrowFunction(node, parentNode);
    if (isDeclarationComponent || isArrowComponent) {
      const componentName =
        (node.type === 'FunctionDeclaration' && node.id?.name) ||
        (parentNode.type === 'VariableDeclarator' &&
          parentNode.id.type === 'Identifier' &&
          parentNode.id.name) ||
        'component';

      // Both spellings of a component carry the same remedy, so both carry an
      // edit: the declaration one becomes a memoized const, and an initializer
      // is wrapped in place.
      const fixDeclaration =
        isDeclarationComponent && canHostConstDeclaration(parentNode);
      const fixInitializer =
        isArrowComponent &&
        parentNode.type === AST_NODE_TYPES.VariableDeclarator &&
        isWrappableInitializer(parentNode);

      context.report({
        node,
        messageId: 'requireMemo',
        data: {
          name: componentName,
        },
        fix: fixDeclaration
          ? memoizeDeclaration(context, node, printWidth)
          : fixInitializer
          ? memoizeInitializer(context, node, printWidth)
          : undefined,
      });
    }
  }
}

function calculateImportPath(currentFilePath: string): string {
  // Default to absolute path if we can't calculate relative path
  if (!currentFilePath) return 'src/util/memo';

  // Split the current file path into parts and normalize
  const parts = currentFilePath.split(/[\\/]/); // Handle both Unix and Windows paths
  const srcIndex = parts.indexOf('src');

  if (srcIndex === -1) {
    // If we're not in a src directory, use absolute path
    return 'src/util/memo';
  }

  // Calculate relative path based on current file depth from src
  // Subtract 1 from depth to exclude the filename itself
  const depth = parts.length - (srcIndex + 1) - 1;
  return depth > 0 ? '../'.repeat(depth) + 'util/memo' : './util/memo';
}

export const requireMemo = createRule<RequireMemoOptions, 'requireMemo'>({
  name: 'require-memo',
  create: (context, [options]) => {
    const printWidth =
      typeof options?.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    return {
      ArrowFunctionExpression(node) {
        checkFunction(context, node as any, printWidth);
      },
      FunctionDeclaration(node) {
        checkFunction(context, node as any, printWidth);
      },
      FunctionExpression(node) {
        checkFunction(context, node as any, printWidth);
      },
    };
  },
  meta: {
    type: 'problem',
    docs: {
      description: 'React components must be memoized',
      recommended: 'error',
    },
    messages: {
      requireMemo:
        'Component "{{name}}" renders JSX with props but is not wrapped in memo(). ' +
        'Without memo the component function is recreated on every parent render, breaking referential equality and causing avoidable child re-renders. ' +
        'Wrap the component with memo from util/memo so callers receive a stable reference; rename to "{{name}}Unmemoized" if it must stay un-memoized.',
    },
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
    fixable: 'code',
  },
  defaultOptions: [{}],
});
