import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  ASTUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { createSuppressionChecker } from '../utils/disableDirectives';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

type MessageIds = 'wrapSpreadPropsWithStableHash';

type Options = [
  {
    hashImport?: {
      source?: string;
      importName?: string;
    };
    allowedHashFunctions?: string[];
    hookNames?: string[];
  }?,
];

const DEFAULT_HASH_IMPORT = {
  source: 'functions/src/util/hash/stableHash',
  importName: 'stableHash',
};

const DEFAULT_HOOKS = new Set([
  'useEffect',
  'useLayoutEffect',
  'useCallback',
  'useInsertionEffect',
]);

const IGNORED_MEMO_HOOKS = new Set(['useMemo', 'useDeepCompareMemo']);

type FunctionLike =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type FunctionContext = {
  node: FunctionLike;
  isComponent: boolean;
  restNames: Set<string>;
  propsIdentifiers: Set<string>;
};

function getFunctionName(node: FunctionLike): string | null {
  if ('id' in node && node.id?.name) {
    return node.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    node.parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return node.parent.id.name;
  }

  return null;
}

function isProbablyComponent(
  node: FunctionLike,
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
): boolean {
  const name = getFunctionName(node);

  if (name && /^[A-Z]/.test(name)) {
    return true;
  }

  if (ASTHelpers.returnsJSX(node.body, context)) {
    return true;
  }

  return false;
}

function collectRestNamesFromPattern(
  pattern: TSESTree.Node,
  restNames: Set<string>,
): void {
  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    for (const prop of pattern.properties) {
      if (
        prop.type === AST_NODE_TYPES.RestElement &&
        prop.argument.type === AST_NODE_TYPES.Identifier
      ) {
        restNames.add(prop.argument.name);
      } else if (
        prop.type === AST_NODE_TYPES.Property &&
        prop.value.type === AST_NODE_TYPES.ObjectPattern
      ) {
        collectRestNamesFromPattern(prop.value, restNames);
      }
    }
  } else if (pattern.type === AST_NODE_TYPES.RestElement) {
    if (pattern.argument.type === AST_NODE_TYPES.Identifier) {
      restNames.add(pattern.argument.name);
    }
  } else if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
    collectRestNamesFromPattern(pattern.left, restNames);
  }
}

function collectPropsIdentifiersFromParam(
  param: TSESTree.Parameter,
  propsIdentifiers: Set<string>,
): void {
  if (param.type === AST_NODE_TYPES.Identifier) {
    propsIdentifiers.add(param.name);
  } else if (
    param.type === AST_NODE_TYPES.AssignmentPattern &&
    param.left.type === AST_NODE_TYPES.Identifier
  ) {
    propsIdentifiers.add(param.left.name);
  }
}

function getHookName(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }

  return null;
}

function stripTypeWrappers(
  expression: TSESTree.Expression,
): TSESTree.Expression {
  if (expression.type === AST_NODE_TYPES.TSNonNullExpression) {
    return stripTypeWrappers(expression.expression as TSESTree.Expression);
  }
  if (expression.type === AST_NODE_TYPES.TSAsExpression) {
    return stripTypeWrappers(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.TSTypeAssertion) {
    return stripTypeWrappers(expression.expression);
  }
  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return stripTypeWrappers(expression.expression as TSESTree.Expression);
  }
  if ((expression as any).type === 'ParenthesizedExpression') {
    return stripTypeWrappers((expression as any).expression);
  }
  return expression;
}

function isWrappedWithAllowedHash(
  expression: TSESTree.Expression,
  allowedHashes: Set<string>,
): boolean {
  const unwrapped = stripTypeWrappers(expression);

  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped.callee;
    if (
      callee.type === AST_NODE_TYPES.Identifier &&
      allowedHashes.has(callee.name)
    ) {
      return true;
    }
    if (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      !callee.computed &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      allowedHashes.has(callee.property.name)
    ) {
      return true;
    }
  }

  return false;
}

function getIdentifierFromExpression(
  expression: TSESTree.Expression,
): TSESTree.Identifier | null {
  const unwrapped = stripTypeWrappers(expression);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return unwrapped;
  }
  return null;
}

function getStableHashLocalNames(
  sourceCode: TSESLint.SourceCode,
  hashImport: { source: string; importName: string },
): string[] {
  const localNames: string[] = [];
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === hashImport.source
    ) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier &&
          spec.imported.name === hashImport.importName
        ) {
          localNames.push(spec.local.name);
        }
      }
    }
  }
  return localNames;
}

function isStableHashImported(
  sourceCode: TSESLint.SourceCode,
  hashImport: { source: string; importName: string },
): boolean {
  return getStableHashLocalNames(sourceCode, hashImport).length > 0;
}

/**
 * Whether every declaration of a resolved binding is the configured hash import
 * itself. A namespace import, an import of another name or module, a parameter,
 * or a local declaration all mean the emitted call would resolve somewhere other
 * than the intended hash function.
 */
function bindsHashImport(
  variable: TSESLint.Scope.Variable,
  hashImport: { source: string; importName: string },
): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (
        specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
        specifier.imported.name !== hashImport.importName
      ) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.source.value === hashImport.source
      );
    })
  );
}

function getIndentBeforeNode(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): string {
  const lineText = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const match = lineText.match(/^[ \t]*/);
  return match ? match[0] : '';
}

const EXHAUSTIVE_DEPS_DISABLE =
  '// eslint-disable-next-line react-hooks/exhaustive-deps';

/**
 * One level of indentation, spelled because the fixer prints an argument list
 * rather than nudging the existing one. Two spaces is prettier's `tabWidth`
 * default and this repo's and its consumers' setting; a tab-indented region is
 * declined below instead of being indented with a mixture of the two.
 */
const INDENT_STEP = '  ';

/**
 * Wrappers that sit between a call and its statement without changing where
 * prettier indents the call's arguments.
 */
const TRANSPARENT_PARENTS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);

type ExpansionAnchor = {
  /** The statement whose indentation the expanded list is measured against. */
  statement: TSESTree.Node;
  /**
   * Whether the call is the concise body of an arrow, which prettier prints on
   * its own line one step past the statement once the argument list breaks.
   */
  followsArrow: boolean;
};

/**
 * Where an expanded argument list is measured from, or null where that cannot
 * be resolved.
 *
 * Giving an argument a leading own-line comment forces prettier to print one
 * argument per line — the decision is the comment's, not the line width's —
 * indented one step past the enclosing statement, with the closing paren back
 * at the statement's indentation. That holds while the call is the whole of a
 * statement. A call nested inside another expression sits in a group prettier
 * may break as well, and its arguments then indent against that break rather
 * than against the line the call starts on, so those positions are declined
 * rather than guessed at.
 *
 * A concise arrow body is the one nested position with a settled answer, and it
 * has to be handled rather than declined because it is the same call spelled
 * another way: `() => useCallback(…)` and `() => { return useCallback(…); }`
 * are one function, and a fixer that remedies only one of them reports a
 * violation it will not fix. Measured at the repo's prettier settings, the
 * break lands after the final `=>` with the call one step past the statement,
 * whatever the length of the arrow chain ahead of it.
 */
function expandedArgumentAnchor(
  node: TSESTree.CallExpression,
): ExpansionAnchor | null {
  const skipTransparent = (from: TSESTree.Node): TSESTree.Node => {
    let current = from;
    while (current.parent && TRANSPARENT_PARENTS.has(current.parent.type)) {
      current = current.parent;
    }
    return current;
  };

  let current = skipTransparent(node);
  let followsArrow = false;
  while (
    current.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    current.parent.body === current
  ) {
    followsArrow = true;
    current = skipTransparent(current.parent);
  }

  const parent = current.parent;
  if (!parent) {
    return null;
  }

  if (
    parent.type === AST_NODE_TYPES.ExpressionStatement ||
    parent.type === AST_NODE_TYPES.ReturnStatement
  ) {
    return { statement: parent, followsArrow };
  }

  // A second declarator is a break of its own, which moves the indentation the
  // argument list is measured from off the declaration's line.
  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
    parent.parent.declarations.length === 1
  ) {
    return { statement: parent.parent, followsArrow };
  }

  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.parent?.type === AST_NODE_TYPES.ExpressionStatement
  ) {
    return { statement: parent.parent, followsArrow };
  }

  return null;
}

/**
 * Source lines whose leading whitespace belongs to a string's value rather than
 * to the file's indentation. Re-indenting one of them would change what the
 * program prints, and prettier leaves them alone for the same reason.
 */
function stringContinuationLines(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): Set<number> {
  const lines = new Set<number>();
  for (const token of sourceCode.getTokens(node)) {
    if (
      token.type !== AST_TOKEN_TYPES.String &&
      token.type !== AST_TOKEN_TYPES.Template
    ) {
      continue;
    }
    for (
      let line = token.loc.start.line + 1;
      line <= token.loc.end.line;
      line += 1
    ) {
      lines.add(line);
    }
  }
  return lines;
}

/**
 * Moves a span of source text by `shift` columns, leaving its first line alone
 * because that line's indentation is written by the caller.
 *
 * Returns null when a line carries a tab, since a shift expressed in spaces
 * cannot preserve a tab-indented line's column.
 */
function shiftIndentation(
  text: string,
  shift: number,
  firstLine: number,
  protectedLines: ReadonlySet<number>,
): string | null {
  if (shift === 0) {
    return text;
  }

  const shifted: string[] = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    // A blank line gets no indentation: padding one is exactly the trailing
    // whitespace this fixer exists to stop emitting.
    if (index === 0 || protectedLines.has(firstLine + index) || !line.trim()) {
      shifted.push(line);
      continue;
    }
    if (line.startsWith('\t')) {
      return null;
    }
    shifted.push(
      shift > 0
        ? `${' '.repeat(shift)}${line}`
        : line.slice(Math.min(-shift, line.length - line.trimStart().length)),
    );
  }
  return shifted.join('\n');
}

/**
 * Whether an argument that spans several lines keeps the layout prettier gave
 * it once the expansion moves it to `argumentIndent`.
 *
 * Prettier breaks an argument for one of two reasons: the construct forces it,
 * or it did not fit the room it had. Only the first survives the move, because
 * the expansion hands every argument a different amount of room — an argument
 * broken purely for width may fit on one line where it lands, and prettier would
 * join it back up over text this fixer had copied verbatim.
 *
 * Two cases qualify. An argument already sitting alone at the target indent has
 * lost no room at all. And a function with a non-empty block body is the shape
 * prettier never prints on one line, whatever room it is given, provided
 * everything ahead of the body already fits on one line.
 */
function keepsItsLayoutWhenMoved(
  sourceCode: TSESLint.SourceCode,
  argument: TSESTree.Node,
  argumentIndent: string,
  currentIndent: string,
): boolean {
  if (argument.loc.start.line === argument.loc.end.line) {
    return true;
  }

  if (
    currentIndent === argumentIndent &&
    argument.loc.start.column === currentIndent.length
  ) {
    return true;
  }

  if (
    argument.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    argument.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }

  const { body } = argument;
  return (
    body.type === AST_NODE_TYPES.BlockStatement &&
    body.loc.start.line === argument.loc.start.line &&
    (body.body.length > 0 || sourceCode.getCommentsInside(body).length > 0)
  );
}

type TextRewrite = { range: TSESTree.Range; text: string };

/**
 * The text of `node` with the rewrites that fall inside it already applied, so
 * that a caller re-emitting the surrounding span carries them along instead of
 * overlapping them with a second edit.
 */
function applyRewrites(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
  rewrites: readonly TextRewrite[],
): string {
  const inside = rewrites
    .filter(
      ({ range }) => range[0] >= node.range[0] && range[1] <= node.range[1],
    )
    .sort((left, right) => left.range[0] - right.range[0]);

  let cursor = node.range[0];
  let text = '';
  for (const rewrite of inside) {
    text += sourceCode.text.slice(cursor, rewrite.range[0]) + rewrite.text;
    cursor = rewrite.range[1];
  }
  return text + sourceCode.text.slice(cursor, node.range[1]);
}

/**
 * Re-emits a call's argument list in the one-argument-per-line shape prettier
 * prints once an argument carries an own-line comment, with `comment` placed
 * above `commentTarget` and `rewrites` folded into the arguments they fall in.
 *
 * Inserting the comment in place instead leaves two marks of the pre-image on
 * the file: the separator whitespace the inserted line break strands at the end
 * of the preceding line, and the arguments' pre-expansion indentation. Owning
 * the whole span between the parentheses settles both, at the cost of having to
 * reproduce every argument — so a span this cannot reproduce faithfully returns
 * null and the caller declines the fix outright.
 */
function expandArgumentList(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.CallExpression,
  commentTarget: TSESTree.Node,
  comment: string,
  rewrites: readonly TextRewrite[],
): TextRewrite[] | null {
  const anchor = expandedArgumentAnchor(node);
  if (!anchor) {
    return null;
  }

  const { statement, followsArrow } = anchor;
  const lineStart = sourceCode.getIndexFromLoc({
    line: statement.loc.start.line,
    column: 0,
  });
  const statementIndent = sourceCode.text.slice(lineStart, statement.range[0]);
  if (!/^ *$/.test(statementIndent)) {
    return null;
  }

  const edits: TextRewrite[] = [];
  let callIndent = statementIndent;

  if (followsArrow) {
    // The arrow chain ahead of the body stays on the statement's line, so the
    // break the expansion forces is the one after the final `=>` — and the
    // whitespace across that break is the fixer's to write, for the same reason
    // the separator between two arguments is.
    const arrowToken = sourceCode.getTokenBefore(node);
    if (
      !arrowToken ||
      arrowToken.value !== '=>' ||
      arrowToken.loc.end.line !== statement.loc.start.line ||
      !/^\s*$/.test(sourceCode.text.slice(arrowToken.range[1], node.range[0]))
    ) {
      return null;
    }
    callIndent = `${statementIndent}${INDENT_STEP}`;
    edits.push({
      range: [arrowToken.range[1], node.range[0]],
      text: `\n${callIndent}`,
    });
  } else if (statement.loc.start.line !== node.loc.start.line) {
    return null;
  }

  const openParen = sourceCode.getTokenAfter(
    node.typeParameters ?? node.callee,
    {
      filter: ASTUtils.isOpeningParenToken,
    },
  );
  const closeParen = sourceCode.getLastToken(node);
  if (!openParen || !closeParen || !ASTUtils.isClosingParenToken(closeParen)) {
    return null;
  }

  // A comment written between the arguments belongs to no argument, so the
  // re-emitted list has nowhere to carry it and would delete it. Declining is
  // the deliberate choice here: a formatting correction does not justify
  // dropping a comment (#1877).
  const strandsAComment = sourceCode
    .getCommentsInside(node)
    .some(
      (existing) =>
        existing.range[0] >= openParen.range[1] &&
        existing.range[1] <= closeParen.range[0] &&
        !node.arguments.some(
          (argument) =>
            existing.range[0] >= argument.range[0] &&
            existing.range[1] <= argument.range[1],
        ),
    );
  if (strandsAComment) {
    return null;
  }

  const argumentIndent = `${callIndent}${INDENT_STEP}`;
  const protectedLines = stringContinuationLines(sourceCode, node);
  const parts: string[] = [];

  for (const argument of node.arguments) {
    const base = getIndentBeforeNode(sourceCode, argument);
    if (!/^ *$/.test(base)) {
      return null;
    }
    if (!keepsItsLayoutWhenMoved(sourceCode, argument, argumentIndent, base)) {
      return null;
    }
    // Wrapping an element in a call adds no line terminator, so each line of
    // the rewritten text still stands for the source line at the same offset
    // and the protected-line numbering survives the rewrite.
    const shifted = shiftIndentation(
      applyRewrites(sourceCode, argument, rewrites),
      argumentIndent.length - base.length,
      argument.loc.start.line,
      protectedLines,
    );
    if (shifted === null) {
      return null;
    }
    if (argument === commentTarget) {
      parts.push(`${argumentIndent}${comment}\n`);
    }
    parts.push(`${argumentIndent}${shifted},\n`);
  }

  edits.push({
    range: [openParen.range[1], closeParen.range[0]],
    text: `\n${parts.join('')}${callIndent}`,
  });
  return edits;
}

function hasExhaustiveDepsDisable(
  sourceCode: TSESLint.SourceCode,
  callNode: TSESTree.CallExpression,
  depsNode: TSESTree.ArrayExpression,
): boolean {
  const [start, end] = [callNode.range[0], depsNode.range[1]];
  const callStartLine = callNode.loc.start.line;
  const depsStartLine = depsNode.loc.start.line;
  return sourceCode
    .getAllComments()
    .some(
      (comment) =>
        comment.value.includes('react-hooks/exhaustive-deps') &&
        ((comment.range[0] >= start && comment.range[1] <= end) ||
          comment.loc.end.line === callStartLine - 1 ||
          comment.loc.end.line === depsStartLine - 1),
    );
}

export const enforceStableHashSpreadProps = createRule<Options, MessageIds>({
  name: 'enforce-stable-hash-spread-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require stableHash wrapping when spread props rest objects are used in React hook dependency arrays to avoid re-renders triggered by new object references on every render.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          hashImport: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              importName: { type: 'string' },
            },
            additionalProperties: false,
          },
          allowedHashFunctions: {
            type: 'array',
            items: { type: 'string' },
          },
          hookNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrapSpreadPropsWithStableHash:
        'Rest props object(s) "{{names}}" are recreated on every render, so using them directly in a dependency array makes React rerun the hook on every render. Wrap each in stableHash() (or a memoized hash) and depend on that stable value instead to avoid noisy re-renders.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const sourceCode = context.getSourceCode();
    const [options = {}] = context.options;
    const hashImport = {
      source: options.hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
      importName:
        options.hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
    };
    const existingHashLocalNames = getStableHashLocalNames(
      sourceCode,
      hashImport,
    );
    const userHookNames = new Set<string>(options.hookNames ?? []);
    const allowedHashes = new Set<string>([
      ...existingHashLocalNames,
      hashImport.importName,
      ...(options.allowedHashFunctions ?? []),
    ]);
    const hookNames = new Set<string>([...DEFAULT_HOOKS, ...userHookNames]);

    // The `import { stableHash }` statement rides on a single violation's fix,
    // so that violation is the file's import carrier. A suppressed carrier
    // would take the import down with it while the surviving violations still
    // emit `stableHash(...)`, leaving calls to an unbound identifier.
    let importPlanned = false;
    const isReportSuppressed = createSuppressionChecker(context);
    const functionStack: FunctionContext[] = [];

    function getCurrentComponentContext(): FunctionContext | undefined {
      for (let i = functionStack.length - 1; i >= 0; i -= 1) {
        if (functionStack[i].isComponent) {
          return functionStack[i];
        }
      }
      return undefined;
    }

    return {
      ':function'(node: FunctionLike) {
        const restNames = new Set<string>();
        const propsIdentifiers = new Set<string>();

        for (const param of node.params) {
          collectRestNamesFromPattern(param, restNames);
          collectPropsIdentifiersFromParam(param, propsIdentifiers);
        }

        functionStack.push({
          node,
          isComponent: isProbablyComponent(node, context),
          restNames,
          propsIdentifiers,
        });
      },
      'FunctionDeclaration:exit'() {
        functionStack.pop();
      },
      'FunctionExpression:exit'() {
        functionStack.pop();
      },
      'ArrowFunctionExpression:exit'() {
        functionStack.pop();
      },
      VariableDeclarator(node) {
        const current = getCurrentComponentContext();
        if (!current || !current.isComponent) return;

        if (
          node.id.type === AST_NODE_TYPES.ObjectPattern &&
          node.init &&
          node.init.type === AST_NODE_TYPES.Identifier &&
          current.propsIdentifiers.has(node.init.name)
        ) {
          collectRestNamesFromPattern(node.id, current.restNames);
        }
      },
      CallExpression(node) {
        const current = getCurrentComponentContext();
        if (!current || !current.isComponent) return;
        const hookName = getHookName(node);
        if (!hookName || !hookNames.has(hookName)) return;
        if (IGNORED_MEMO_HOOKS.has(hookName) && !userHookNames.has(hookName))
          return;
        if (node.arguments.length < 2) return;

        const depsArg = node.arguments[node.arguments.length - 1];
        if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        const offendingElements: {
          node: TSESTree.Expression;
          name: string;
        }[] = [];

        for (const element of depsArg.elements) {
          if (!element || element.type === AST_NODE_TYPES.SpreadElement) {
            continue;
          }

          if (isWrappedWithAllowedHash(element, allowedHashes)) {
            continue;
          }

          const identifier = getIdentifierFromExpression(element);
          if (!identifier) {
            continue;
          }

          if (current.restNames.has(identifier.name)) {
            offendingElements.push({ node: element, name: identifier.name });
          }
        }

        if (offendingElements.length === 0) return;

        const offendingNames = Array.from(
          new Set(offendingElements.map(({ name }) => name)),
        );

        // The report is emitted even when suppressed: ESLint discards it, and
        // reporting keeps the user's disable directive "used" so that
        // `--report-unused-disable-directives` does not flag it.
        context.report({
          node: depsArg,
          messageId: 'wrapSpreadPropsWithStableHash',
          data: { names: offendingNames.join(', ') },
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Producing
            // no fix — and leaving the import unscheduled — passes the import
            // to the first violation that survives. The check runs on the
            // reported node so it resolves the same location ESLint does.
            if (isReportSuppressed(depsArg)) {
              return null;
            }

            // Derive the emitted name from the file's imports rather than from
            // traversal state: `--fix` re-lints between passes, so an import a
            // previous pass landed must be reused, and an alias it introduced
            // must be honoured.
            const hashIdentifier =
              getStableHashLocalNames(sourceCode, hashImport)[0] ??
              hashImport.importName;

            // The fix writes a bare `hashIdentifier` call into the dependency
            // array and may add a top-level import for it. Another binding of
            // that name, visible from the array, makes both halves wrong: a
            // module-scope binding collides with the inserted import
            // (TS2440/TS2300), and a narrower shadow silently resolves the
            // emitted call to the wrong value with no TypeScript diagnostic at
            // all. Resolving through the scope chain of the reported node — the
            // exact position the call lands in — covers both, while a binding
            // that already is the desired import is the reuse path. Declining
            // leaves the report for the author to resolve deliberately.
            const existingBinding = ASTHelpers.findVariableInScope(
              ASTHelpers.getScope(context, depsArg),
              hashIdentifier,
            );
            if (
              existingBinding &&
              !bindsHashImport(existingBinding, hashImport)
            ) {
              return null;
            }

            const seen = new Set<number>();
            const rewrites: TextRewrite[] = [];
            for (const { node: targetNode } of offendingElements) {
              if (seen.has(targetNode.range[0])) continue;
              seen.add(targetNode.range[0]);
              const original = sourceCode.getText(targetNode);
              rewrites.push({
                range: targetNode.range,
                text: `${hashIdentifier}(${original})`,
              });
            }

            // The disable comment and the `stableHash(...)` wraps are one edit
            // whenever the comment lands: an own-line comment forces prettier
            // to expand the argument list, and the expansion re-emits the very
            // span the wraps live in, which ESLint rejects as two overlapping
            // fixes. Where the comment is already there, the wraps stand alone
            // and the call's layout is left as the author wrote it.
            const needsDisable = !hasExhaustiveDepsDisable(
              sourceCode,
              node,
              depsArg,
            );
            const expansion = needsDisable
              ? expandArgumentList(
                  sourceCode,
                  node,
                  depsArg,
                  EXHAUSTIVE_DEPS_DISABLE,
                  rewrites,
                )
              : null;

            // A call whose argument list cannot be reproduced still needs the
            // disable, since the wrapped dependency is what makes
            // `react-hooks/exhaustive-deps` fire. Emitting the wraps without it
            // would trade this rule's report for that one, so the whole fix is
            // declined and the report stands for the author. The decision is
            // taken before any fix is scheduled: `importPlanned` claims the
            // file's import for this violation, and a later `return null` would
            // strand the surviving violations with no import at all.
            if (needsDisable && !expansion) {
              return null;
            }

            const fixes: TSESLint.RuleFix[] = (expansion ?? rewrites).map(
              ({ range, text }) => fixer.replaceTextRange(range, text),
            );

            if (
              !isStableHashImported(sourceCode, hashImport) &&
              !importPlanned
            ) {
              const importText = `import { ${hashImport.importName} } from '${hashImport.source}';\n`;
              const firstImport = sourceCode.ast.body.find(
                (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
              );
              if (firstImport) {
                fixes.push(fixer.insertTextBefore(firstImport, importText));
              } else {
                // A file's first import may cross only the whitespace the
                // source opens with. The shared anchor is the floor of that
                // climb: text spliced above a `#!` shebang leaves the file
                // unparseable, and text above a `'use client'` directive or a
                // header comment strips the prologue of the meaning it
                // carries only while it leads.
                const anchor = importInsertionAnchor(sourceCode);
                const anchorIndex =
                  anchor.kind === 'before'
                    ? anchor.target.range[0]
                    : anchor.index;
                const opensFile =
                  sourceCode.text.slice(0, anchorIndex).trim() === '';
                fixes.push(
                  insertAtImportAnchor(
                    sourceCode,
                    fixer,
                    opensFile ? { kind: 'index', index: 0 } : anchor,
                    importText,
                  ),
                );
              }
              importPlanned = true;
            }

            return fixes;
          },
        });
      },
    };
  },
});
