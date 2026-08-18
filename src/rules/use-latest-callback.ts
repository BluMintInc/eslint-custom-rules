import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESTree,
} from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { planOrphanedImportRemoval, TextRange } from '../utils/importRemoval';

type MessageIds = 'useLatestCallback';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. Dropping the dependency array lets the call
 * collapse onto one line, so the fixer decides a line break a formatter owns: a
 * line it emits past this width is rewritten on the next `prettier --write`, and
 * fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

type Conversion = {
  node: TSESTree.CallExpression;
  currentHook: string;
  callee: TSESTree.Identifier | null;
  // The scope the rewritten call sits in, captured during traversal because
  // the fix runs from Program:exit, where an ESLint version without
  // sourceCode.getScope would only be able to report the global scope.
  scope: TSESLint.Scope.Scope;
};

const LATEST_CALLBACK_MODULE = 'use-latest-callback';
const LATEST_CALLBACK_HOOK = 'useLatestCallback';

type LatestCallbackImport = {
  specifier: TSESTree.ImportClause;
  /** The local name the rewritten calls must spell to reach the hook. */
  reference: string;
};

/**
 * A specifier that binds the hook itself as a value. The module's sole export
 * is the hook, so a default specifier binds it under any local name. A
 * namespace specifier binds the module object rather than a callable, and a
 * type-only specifier erases at compile time, so neither can carry the call.
 */
const bindsLatestCallback = (specifier: TSESTree.ImportClause): boolean => {
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return true;
  }
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === LATEST_CALLBACK_HOOK
  );
};

/**
 * The hook's import read off `Program.body` rather than off a flag set by an
 * ImportDeclaration visitor, so the answer holds wherever the import sits
 * relative to the fix site. Reading the AST also exposes the shapes a
 * name-only flag conflates with a usable binding: a namespace import, a
 * type-only import, and a reverse alias
 * (`import { other as useLatestCallback }`) each bind a name without binding
 * the hook.
 */
const findLatestCallbackImport = (
  program: TSESTree.Program,
): LatestCallbackImport | null => {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== LATEST_CALLBACK_MODULE ||
      (statement.importKind && statement.importKind !== 'value')
    ) {
      continue;
    }
    const specifier = statement.specifiers.find(bindsLatestCallback);
    if (specifier) {
      return { specifier, reference: specifier.local.name };
    }
  }
  return null;
};

const isComma = (
  token: TSESTree.Token | TSESTree.Comment | null,
): token is TSESTree.Token =>
  !!token && token.type === AST_TOKEN_TYPES.Punctuator && token.value === ',';

/** The leading whitespace of the line the offset sits on. */
const indentationAt = (
  sourceCode: TSESLint.SourceCode,
  offset: number,
): string => {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, offset));
  return match ? match[0] : '';
};

/** The indentation of an offset that starts its own line, else null. */
const ownLineIndentAt = (
  sourceCode: TSESLint.SourceCode,
  offset: number,
): string | null => {
  const text = sourceCode.getText();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lead = text.slice(lineStart, offset);
  return lead.trim() === '' ? lead : null;
};

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
const indentUnitOf = (sourceCode: TSESLint.SourceCode): string => {
  const text = sourceCode.getText();
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry whatever alignment the comment uses
  // — the `*` one column in from its own indentation, or, for commented-out
  // code, the original code's depths. Neither is a nesting step of the file, and
  // counting them makes a JSDoc-heavy file look 1-space indented. Keying on the
  // comment's range rather than a leading `*` also covers a body without them.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') {
      continue;
    }
    if (continuesBlockComment(lineStart)) {
      continue;
    }
    const match = /^[ \t]*/.exec(line);
    const indent = match ? match[0] : '';
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

type PlannedEdit = { range: TSESTree.Range; text: string };

/** The source with every planned edit applied, used to measure emitted lines. */
const applyEdits = (text: string, edits: PlannedEdit[]): string => {
  const ordered = [...edits].sort((a, b) => b.range[0] - a.range[0]);
  let result = text;
  for (const edit of ordered) {
    result = `${result.slice(0, edit.range[0])}${edit.text}${result.slice(
      edit.range[1],
    )}`;
  }
  return result;
};

/** The length of the line `offset` sits on. */
const lineLengthAt = (text: string, offset: number): number => {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineBreak = text.indexOf('\n', offset);
  return (lineBreak === -1 ? text.length : lineBreak) - lineStart;
};

/**
 * Ranges whose interior line breaks carry string data rather than formatting.
 * A multi-line template literal (or a string spliced together with line
 * continuations) evaluates to the whitespace written inside it, so shifting
 * those lines would silently change the value the code produces — the same
 * carve-out `parallelize-async-operations` makes for spliced-in arguments.
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
 * The callback's text with its continuation lines moved from the depth it was
 * written at to `toIndent`, or null when that move is not expressible.
 *
 * Dropping the dependency array changes the nesting level the callback sits at,
 * so emitting it verbatim would leave every interior line indented for a level
 * it no longer occupies (issue #1559). The first line is excluded because it is
 * spliced in directly after the call's open paren (or after a fresh indent when
 * the call is broken open), so it has no indentation of its own left to adjust.
 */
const reindentedText = (
  sourceCode: TSESLint.SourceCode,
  callback: TSESTree.Node,
  fromIndent: string,
  toIndent: string,
): string | null => {
  const text = sourceCode.getText(callback);
  if (!text.includes('\n')) {
    return text;
  }

  const shiftLine = lineShifterBetween(fromIndent, toIndent);
  if (!shiftLine) {
    return null;
  }

  const stringData = stringDataRangesOf(sourceCode, callback);
  const carriesStringData = (offset: number) =>
    stringData.some(([start, end]) => start < offset && offset < end);

  let offset = callback.range[0];
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
 * The callback's text for the collapsed, single-line call form. An indentation
 * delta that cannot be applied leaves the text as the author wrote it, which is
 * still valid code at the depth the formatter will correct it from.
 */
const collapsedCallbackText = (
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
  callback: TSESTree.Node,
): string =>
  reindentedText(
    sourceCode,
    callback,
    indentationAt(sourceCode, callback.range[0]),
    indentationAt(sourceCode, call.range[0]),
  ) ?? sourceCode.getText(callback);

/**
 * Whether Prettier answers an over-long call by breaking the argument list
 * open. It does for an arrow, and for a parameter-less function expression —
 * but a function expression WITH parameters is instead hugged onto the call
 * line with its parameter list broken, a shape this fixer cannot author. Left
 * collapsed, such a call at least keeps the first line Prettier keeps.
 */
const breaksOpenWhenLong = (callback: TSESTree.Node): boolean =>
  callback.type !== AST_NODE_TYPES.FunctionExpression ||
  callback.params.length === 0;

/**
 * Whether the callback's own head — its parameter list, up to where its body
 * begins — is spelled across several lines. An arrow written that way is never
 * hugged onto the call's line, because that would leave the call's open paren
 * and the arrow's dangling at the end of one line; Prettier breaks the argument
 * list open instead however short the collapsed line measures. A function
 * expression is the exception handled above: its broken parameter list IS hugged.
 */
const headSpansLines = (
  sourceCode: TSESLint.SourceCode,
  callback: TSESTree.Node,
): boolean =>
  callback.type === AST_NODE_TYPES.ArrowFunctionExpression &&
  sourceCode
    .getText()
    .slice(callback.range[0], callback.body.range[0])
    .includes('\n');

/**
 * Whether the rewritten call should end its argument list with a comma. The
 * answer is the formatter's `trailingComma` setting, which is read off the call
 * being rewritten whenever it was already broken open — that is exactly the
 * shape the setting governs. A call the author kept on one line says nothing
 * about it, so the modern default (and Prettier's own, from v3) is assumed.
 */
const wantsTrailingComma = (
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
): boolean => {
  const lastArgument = call.arguments[call.arguments.length - 1];
  const closeParen = sourceCode.getLastToken(call);
  if (!lastArgument || !closeParen) {
    return true;
  }
  if (isComma(sourceCode.getTokenBefore(closeParen))) {
    return true;
  }
  return closeParen.loc.start.line === lastArgument.loc.end.line;
};

/**
 * The rewritten call with its argument list broken open — the callee on its own
 * line, the callback one nesting step in, and the closing paren back at the
 * statement's indentation. Null when the callback's lines cannot be moved to
 * that depth, which asks the caller to keep the collapsed form.
 */
const brokenOpenCallText = (
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
  callback: TSESTree.Node,
  head: string,
  indentUnit: string,
): string | null => {
  const callIndent = indentationAt(sourceCode, call.range[0]);
  // A callback the author already broke onto its own line keeps the exact
  // indentation it was written at, so that layout survives byte for byte.
  const ownLineIndent = ownLineIndentAt(sourceCode, callback.range[0]);
  const calleeIndent =
    ownLineIndent !== null &&
    ownLineIndent.length > callIndent.length &&
    ownLineIndent.startsWith(callIndent)
      ? ownLineIndent
      : `${callIndent}${indentUnit}`;

  const moved = reindentedText(
    sourceCode,
    callback,
    indentationAt(sourceCode, callback.range[0]),
    calleeIndent,
  );
  if (moved === null) {
    return null;
  }

  const comma = wantsTrailingComma(sourceCode, call) ? ',' : '';
  return `${head}(\n${calleeIndent}${moved}${comma}\n${callIndent})`;
};

/** Whether a range sits wholly inside one of the ranges a fix deletes. */
const fallsInside = (
  ranges: readonly TSESTree.Range[],
  range: TSESTree.Range,
): boolean =>
  ranges.some(([start, end]) => start <= range[0] && range[1] <= end);

/**
 * Whether the binding belongs to a function rather than to the module. A
 * module-scope binding is left alone because this file cannot settle whether it
 * is dead: it may be exported, re-exported, or declared for a side effect,
 * whereas a binding declared inside a component or hook is reachable only from
 * the references this file spells out.
 */
const isFunctionLocal = (variable: TSESLint.Scope.Variable): boolean => {
  for (
    let scope: TSESLint.Scope.Scope | null = variable.scope;
    scope;
    scope = scope.upper
  ) {
    if (scope.type === 'function') {
      return true;
    }
  }
  return false;
};

/** The bindings a reference inside one of the deleted ranges resolves to. */
const variablesReferencedIn = (
  root: TSESLint.Scope.Scope,
  deletedRanges: readonly TSESTree.Range[],
): Set<TSESLint.Scope.Variable> => {
  const referenced = new Set<TSESLint.Scope.Variable>();
  const walk = (scope: TSESLint.Scope.Scope) => {
    for (const reference of scope.references) {
      if (
        reference.resolved &&
        fallsInside(deletedRanges, reference.identifier.range)
      ) {
        referenced.add(reference.resolved);
      }
    }
    scope.childScopes.forEach(walk);
  };
  walk(root);
  return referenced;
};

/**
 * Whether deleting the given ranges would strip the last read of a binding
 * declared inside a function, leaving a declaration — and whatever imports feed
 * it — that nothing uses.
 *
 * A dependency array can hold the sole reference to a value computed for it
 * alone, which is precisely what `no-array-length-in-deps` produces when it
 * hoists `const listHash = useMemo(() => stableHash(list), [list])` and points
 * the dependency at it. Dropping the array then strands that statement, turning
 * a clean file into one `no-unused-vars` rejects with a violation this plugin
 * cannot itself fix (issue #1652). Only a write left behind counts as no use at
 * all, matching how an unused-variable check reads the result.
 */
const orphansLocalBinding = (
  root: TSESLint.Scope.Scope,
  deletedRanges: readonly TSESTree.Range[],
): boolean =>
  [...variablesReferencedIn(root, deletedRanges)]
    .filter((variable) => variable.defs.length > 0 && isFunctionLocal(variable))
    .some((variable) =>
      variable.references.every(
        (reference) =>
          !reference.isRead() ||
          fallsInside(deletedRanges, reference.identifier.range),
      ),
    );

/**
 * A hook, by React's naming convention. The convention is the only general
 * signal available in one file: a custom hook's body may live anywhere, so no
 * list of hook names (`useFirestore`, `useDocSnapshot`, ...) can be complete.
 */
const HOOK_NAME = /^use[A-Z]/;

/**
 * The name the naming convention applies to. A member callee
 * (`hooks.useThing(...)`) carries it on the property, which is what the author
 * reads as the hook's name.
 */
const calleeNameOf = (call: TSESTree.CallExpression): string | null => {
  const { callee } = call;
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
};

const isHookCall = (call: TSESTree.CallExpression): boolean => {
  const name = calleeNameOf(call);
  return !!name && HOOK_NAME.test(name);
};

/** Wrappers a value passes through without its identity changing. */
const TRANSPARENT_VALUE_WRAPPERS = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);

/**
 * Whether the value written at `node` reaches a hook in a position where the
 * hook can compare it between renders: an element of a dependency array handed
 * to a hook (`useEffect(effect, [handler])`), or a direct argument of one — a
 * custom hook is free to list an argument in a dependency array of its own, and
 * `useFirestore(handler, initial)` does exactly that.
 *
 * Positions that use the value without keying anything on its identity do not
 * qualify: calling it, spelling it as an ordinary JSX prop, or handing it to a
 * plain function all read through to the latest closure a stable wrapper
 * holds, so nothing observes the frozen reference. A `ref` prop is the one JSX
 * position that does compare the reference; registersAsRef answers that.
 */
const feedsHookDependency = (node: TSESTree.Node): boolean => {
  let value: TSESTree.Node = node;
  let parent = value.parent;
  while (parent) {
    if (parent.type === AST_NODE_TYPES.CallExpression) {
      return (
        parent.arguments.some((argument) => argument === value) &&
        isHookCall(parent)
      );
    }
    // An array is followed out to whatever holds it, which is how an element of
    // a dependency array is reached. Everything else — a JSX container, a
    // property, a return, a function body — ends the walk, because the identity
    // stops being an argument the hook itself receives.
    if (
      parent.type !== AST_NODE_TYPES.ArrayExpression &&
      !TRANSPARENT_VALUE_WRAPPERS.has(parent.type)
    ) {
      return false;
    }
    value = parent;
    parent = value.parent;
  }
  return false;
};

/**
 * Whether the value written at `node` is registered as a React ref callback.
 *
 * A ref callback runs on mount and re-runs whenever its identity changes, and
 * that identity change is its only re-registration trigger: a ref carries no
 * dependency array anywhere in the source for a reader to key on. Pinning the
 * reference therefore freezes whatever the callback publishes at the values its
 * first render closed over — a rail that registers its width once keeps
 * reporting that width after the column resizes — which is the same silent
 * breakage a frozen dependency causes (issue #1711).
 */
const registersAsRef = (node: TSESTree.Node): boolean => {
  let value: TSESTree.Node = node;
  let parent = value.parent;
  while (parent && TRANSPARENT_VALUE_WRAPPERS.has(parent.type)) {
    value = parent;
    parent = value.parent;
  }
  if (
    !parent ||
    parent.type !== AST_NODE_TYPES.JSXExpressionContainer ||
    parent.parent?.type !== AST_NODE_TYPES.JSXAttribute
  ) {
    return false;
  }
  const attributeName = parent.parent.name;
  return (
    attributeName.type === AST_NODE_TYPES.JSXIdentifier &&
    attributeName.name === 'ref'
  );
};

/**
 * Whether this position exposes the callback's identity to a consumer that
 * compares it between renders — the two triggers React itself keys on.
 */
const consumesIdentity = (node: TSESTree.Node): boolean =>
  feedsHookDependency(node) || registersAsRef(node);

/**
 * Whether the call's result changes identity between renders. An empty
 * dependency array already pins it for the component's lifetime, so converting
 * the call cannot change what any consumer observes. A missing array, or one
 * spelled as a value this file cannot read, leaves a reference the author may
 * be keying on.
 */
const identityCanChange = (call: TSESTree.CallExpression): boolean => {
  const dependencies = call.arguments[1];
  if (!dependencies) {
    return true;
  }
  if (dependencies.type === AST_NODE_TYPES.ArrayExpression) {
    return dependencies.elements.length > 0;
  }
  return true;
};

/** The declarator binding the call's result, seen through TS wrappers. */
const declaratorOf = (
  call: TSESTree.CallExpression,
): TSESTree.VariableDeclarator | null => {
  let value: TSESTree.Node = call;
  let parent = value.parent;
  while (parent && TRANSPARENT_VALUE_WRAPPERS.has(parent.type)) {
    value = parent;
    parent = value.parent;
  }
  return parent &&
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === value
    ? parent
    : null;
};

/**
 * Whether the callback's identity is load-bearing: it changes between renders
 * AND something in this file compares it — a hook keyed on it, or a ref that
 * re-registers when it changes.
 *
 * `useLatestCallback` returns a permanently stable reference, so a consumer
 * that compares the callback across renders stops seeing it change. An effect
 * keyed on the callback fires once, ever — the callers that deliberately
 * rebuild a handler so a fetch re-runs lose their refresh — and a ref callback
 * publishes its first render's values forever (issue #1711). No compliant
 * remedy exists for such a site: rewriting it as `useMemo` is converted back to
 * `useCallback` by `prefer-usecallback-over-usememo-for-functions`, so the
 * violation is not reported at all rather than reported without a fix.
 *
 * A callback whose identity is exposed some other way — returned from a custom
 * hook, stored on an object — keeps reporting: the consumer is out of this
 * file's sight, and reporting is the direction that preserves the rule.
 */
const identityIsLoadBearing = (
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
  call: TSESTree.CallExpression,
): boolean => {
  if (!identityCanChange(call)) {
    return false;
  }

  const declarator = declaratorOf(call);
  // An unbound call is consumed where it is written, so its own position in the
  // tree answers the question the references would.
  if (!declarator) {
    return consumesIdentity(call);
  }

  return ASTHelpers.getDeclaredVariables(context, declarator).some((variable) =>
    variable.references.some(
      (reference) =>
        reference.isRead() && consumesIdentity(reference.identifier),
    ),
  );
};

export const useLatestCallback = createRule<Options, MessageIds>({
  name: 'use-latest-callback',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useLatestCallback from use-latest-callback instead of React useCallback',
      recommended: 'error',
    },
    fixable: 'code',
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
      useLatestCallback:
        'Replace {{currentHook}} with {{recommendedHook}} from "use-latest-callback" so the callback keeps a stable reference while still reading the latest props/state. useCallback recreates functions whenever dependencies change, which can trigger needless renders and stale closures. Drop the dependency array when switching to {{recommendedHook}}.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    const filename = context.getFilename();
    if (filename.includes('/node_modules/')) {
      return {};
    }

    const useCallbackLocalNames = new Set<string>();
    const reactNamespaceNames = new Set<string>();
    const reactDefaultLikeNames = new Set<string>();
    let hasReactMemberUseCallback = false;

    // Calls queued for conversion. Reporting is deferred to Program:exit because
    // the replacement name depends on whether any reference to react's
    // useCallback binding survives the fix, which is only knowable file-wide:
    // ESLint evaluates a report's fixer eagerly, so a call visited before a
    // later JSX-returning call would otherwise commit to a stale name.
    const conversions: Conversion[] = [];

    const isJSXLikeReturn = (
      node: TSESTree.Node | null | undefined,
    ): boolean => {
      if (!node) return false;

      if (
        node.type === AST_NODE_TYPES.JSXElement ||
        node.type === AST_NODE_TYPES.JSXFragment ||
        node.type === AST_NODE_TYPES.JSXExpressionContainer
      ) {
        return true;
      }

      if ((node as { type: string }).type === 'ParenthesizedExpression') {
        return isJSXLikeReturn(
          (node as { expression?: TSESTree.Node }).expression,
        );
      }

      if (node.type === AST_NODE_TYPES.SequenceExpression) {
        return isJSXLikeReturn(node.expressions[node.expressions.length - 1]);
      }

      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some((el) =>
          isJSXLikeReturn(
            el && el.type === AST_NODE_TYPES.SpreadElement
              ? el.argument
              : (el as TSESTree.Expression | null | undefined),
          ),
        );
      }

      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          isJSXLikeReturn(node.consequent) || isJSXLikeReturn(node.alternate)
        );
      }

      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return isJSXLikeReturn(node.left) || isJSXLikeReturn(node.right);
      }

      if (node.type === AST_NODE_TYPES.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          reactNamespaceNames.has(node.callee.object.name) &&
          node.callee.property.name === 'createElement'
        ) {
          return true;
        }
      }

      return false;
    };

    return {
      // First pass: check imports
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.importKind && node.importKind !== 'value') return;

        if (node.source.value === 'react') {
          // Check if useCallback is imported from React
          const useCallbackSpecifiers = node.specifiers.filter((specifier) => {
            return (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback'
            );
          }) as TSESTree.ImportSpecifier[];

          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier
            ) {
              reactNamespaceNames.add(specifier.local.name);
              reactDefaultLikeNames.add(specifier.local.name);
            }
          });

          if (useCallbackSpecifiers.length > 0) {
            useCallbackSpecifiers.forEach((spec) => {
              useCallbackLocalNames.add(spec.local.name);
            });
          }
        }
      },

      // Check for useCallback usage and identify JSX-returning callbacks
      CallExpression(node: TSESTree.CallExpression) {
        const isUseCallbackIdentifierCall =
          node.callee.type === AST_NODE_TYPES.Identifier &&
          useCallbackLocalNames.has(node.callee.name);

        const isUseCallbackMemberCall =
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.object.type === AST_NODE_TYPES.Identifier &&
          reactDefaultLikeNames.has(node.callee.object.name) &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'useCallback';

        if (
          (isUseCallbackIdentifierCall || isUseCallbackMemberCall) &&
          node.arguments.length >= 1
        ) {
          if (isUseCallbackMemberCall) {
            hasReactMemberUseCallback = true;
          }

          // Check if this is a JSX-returning callback (edge case where we shouldn't replace)
          const callback = node.arguments[0];
          let isJsxReturning = false;

          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // For arrow functions with implicit return
            if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
              if (isJSXLikeReturn(callback.body)) {
                isJsxReturning = true;
              }
            }
            // For functions with block body - check all return statements
            else if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
              const returnStatements = callback.body.body.filter(
                (statement) =>
                  statement.type === AST_NODE_TYPES.ReturnStatement,
              ) as TSESTree.ReturnStatement[];

              // If there are return statements, check if any return JSX
              if (returnStatements.length > 0) {
                isJsxReturning = returnStatements.some(
                  (returnStatement) =>
                    returnStatement.argument &&
                    isJSXLikeReturn(returnStatement.argument),
                );
              }
            }
          }

          // A callback another hook keys on is left alone entirely — see
          // identityIsLoadBearing for why the report itself is withheld rather
          // than just its fix.
          if (!isJsxReturning && !identityIsLoadBearing(context, node)) {
            const currentCallbackName =
              node.callee.type === AST_NODE_TYPES.Identifier
                ? node.callee.name
                : node.callee.type === AST_NODE_TYPES.MemberExpression &&
                  node.callee.property.type === AST_NODE_TYPES.Identifier
                ? node.callee.property.name
                : 'useCallback';

            conversions.push({
              node,
              currentHook: currentCallbackName,
              callee:
                node.callee.type === AST_NODE_TYPES.Identifier
                  ? node.callee
                  : null,
              scope: ASTHelpers.getScope(context, node),
            });
          }
        }
      },

      // Final pass: report the queued calls and touch the react import only
      // when every reference to its useCallback binding is being converted.
      'Program:exit'() {
        if (conversions.length === 0) {
          return; // Don't modify imports if all useCallback calls return JSX
        }

        const sourceCode = context.sourceCode;
        const program = sourceCode.ast;

        const useCallbackSpecifiersOf = (
          declaration: TSESTree.ImportDeclaration,
        ) =>
          declaration.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback',
          );

        const reactImports = program.body.filter(
          (node): node is TSESTree.ImportDeclaration =>
            node.type === AST_NODE_TYPES.ImportDeclaration &&
            node.source.value === 'react' &&
            (!node.importKind || node.importKind === 'value'),
        );

        // The declaration that actually binds useCallback owns the rewrite. The
        // first react import is only a fallback anchor for React.useCallback
        // member calls, which leave the react import itself untouched.
        const statement =
          reactImports.find(
            (declaration) => useCallbackSpecifiersOf(declaration).length > 0,
          ) ?? reactImports[0];

        if (!statement) {
          return;
        }

        const specifiers = useCallbackSpecifiersOf(statement);

        // A conversion nested inside another conversion cannot join the atomic
        // batch: the outer replacement re-emits the inner call's original text,
        // so fixing both at once would produce overlapping edits. The inner
        // call is reported without a fix; because its callee then counts as a
        // surviving reference, the react import is preserved and a later pass
        // converts it against the rewritten text.
        const isNestedConversion = (candidate: Conversion) =>
          conversions.some(
            (other) =>
              other.node !== candidate.node &&
              other.node.range[0] <= candidate.node.range[0] &&
              candidate.node.range[1] <= other.node.range[1],
          );
        const batchedConversions = conversions.filter(
          (conversion) => !isNestedConversion(conversion),
        );
        const deferredConversions = conversions.filter(isNestedConversion);

        // A reference the fix does not rewrite (a JSX-returning call, an
        // argument-less call, or `useCallback` used as a value) keeps needing
        // react's binding, so the import must be preserved verbatim.
        const convertedCallees = new Set<TSESTree.Node>(
          batchedConversions
            .map((conversion) => conversion.callee)
            .filter((callee): callee is TSESTree.Identifier => !!callee),
        );
        const hasSurvivingReference = context
          .getDeclaredVariables(statement)
          .filter((variable) =>
            variable.defs.some((def) =>
              specifiers.some(
                (specifier) => (def.node as TSESTree.Node) === specifier,
              ),
            ),
          )
          .some((variable) =>
            variable.references.some(
              (reference) => !convertedCallees.has(reference.identifier),
            ),
          );

        // React's alias stays bound when a reference survives, so the new
        // import needs a name of its own rather than reusing that alias.
        const freeImportName = () => {
          const taken = new Set<string>();
          const collectNames = (scope: TSESLint.Scope.Scope) => {
            scope.variables.forEach((variable) => taken.add(variable.name));
            scope.childScopes.forEach(collectNames);
          };
          collectNames(ASTHelpers.getScope(context, program));

          let name = LATEST_CALLBACK_HOOK;
          let suffix = 2;
          while (taken.has(name)) {
            name = `${LATEST_CALLBACK_HOOK}${suffix++}`;
          }
          return name;
        };

        const latestCallbackImport = findLatestCallbackImport(program);

        const useCallbackLocalName = specifiers[0]?.local.name ?? 'useCallback';
        const recommendedHook = latestCallbackImport
          ? latestCallbackImport.reference
          : hasSurvivingReference
          ? freeImportName()
          : useCallbackLocalName === 'useCallback'
          ? LATEST_CALLBACK_HOOK
          : useCallbackLocalName;

        const importText = `import ${recommendedHook} from '${LATEST_CALLBACK_MODULE}';`;

        // The react specifiers this fix deletes stop binding their names, so a
        // name that comes only from them is free for the rewritten calls to
        // claim — that is how an aliased `useCallback as uc` hands `uc` over to
        // the new import.
        const releasedSpecifiers: TSESTree.Node[] =
          hasSurvivingReference || specifiers.length === 0 ? [] : specifiers;

        const claimableDefinitions = new Set<TSESTree.Node>(releasedSpecifiers);
        if (latestCallbackImport) {
          claimableDefinitions.add(latestCallbackImport.specifier);
        }

        // Whether the rewritten call reaches the hook rather than an unrelated
        // binding of the same name. Resolving through the scope chain at each
        // rewritten call catches both failure modes: a module-scope binding
        // that the inserted import would redeclare (TS2440, or TS2300 against
        // another import), and a narrower shadow that silently captures the
        // call with no diagnostic at all.
        const reachesHook = (conversion: Conversion) => {
          const existing = ASTHelpers.findVariableInScope(
            conversion.scope,
            recommendedHook,
          );
          if (!existing) {
            return true;
          }
          return (
            existing.defs.length > 0 &&
            existing.defs.every((def) =>
              claimableDefinitions.has(def.node as TSESTree.Node),
            )
          );
        };

        // The react import statement participates in the change set only when
        // it binds useCallback or anchors a React.useCallback member call.
        const touchesImport =
          specifiers.length > 0 || hasReactMemberUseCallback;

        /**
         * Splices out one named specifier and the comma that separates it from
         * the list, touching nothing else. Re-emitting the surviving specifiers
         * as a fresh list destroys everything that sits between them —
         * including an eslint directive governing a specifier that survives,
         * which silently changes which rules report on the file (issue #1446).
         *
         * No comment is ever deleted, not even one that reads as belonging to
         * the removed specifier: a trailing comment can be a directive that
         * governs the NEXT line, so guessing at ownership is exactly the
         * failure this avoids. The comma is dropped separately whenever a
         * comment sits between it and the specifier, which keeps the surviving
         * list syntactically valid without swallowing the comment.
         */
        const removeNamedSpecifier = (
          fixer: TSESLint.RuleFixer,
          specifier: TSESTree.ImportSpecifier,
          survivors: TSESTree.ImportSpecifier[],
        ): TSESLint.RuleFix[] => {
          const hasSurvivorAfter = survivors.some(
            (survivor) => survivor.range[0] > specifier.range[1],
          );

          if (hasSurvivorAfter) {
            const comma = sourceCode.getTokenAfter(specifier);
            if (!isComma(comma)) {
              return [fixer.remove(specifier)];
            }
            const afterSpecifier = sourceCode.getTokenAfter(specifier, {
              includeComments: true,
            });
            if (afterSpecifier && afterSpecifier.range[0] !== comma.range[0]) {
              return [
                fixer.removeRange([
                  specifier.range[0],
                  afterSpecifier.range[0],
                ]),
                fixer.removeRange(comma.range),
              ];
            }
            // Whitespace after the comma is swallowed so a single-line list
            // stays tidy, but it stops at the first comment so nothing but
            // whitespace is consumed.
            const afterComma = sourceCode.getTokenAfter(comma, {
              includeComments: true,
            });
            return [
              fixer.removeRange([
                specifier.range[0],
                afterComma ? afterComma.range[0] : comma.range[1],
              ]),
            ];
          }

          const comma = sourceCode.getTokenBefore(specifier);
          if (!isComma(comma)) {
            return [fixer.remove(specifier)];
          }
          const beforeSpecifier = sourceCode.getTokenBefore(specifier, {
            includeComments: true,
          });
          if (beforeSpecifier && beforeSpecifier.range[0] !== comma.range[0]) {
            return [
              fixer.removeRange(comma.range),
              fixer.removeRange([beforeSpecifier.range[1], specifier.range[1]]),
            ];
          }
          return [fixer.removeRange([comma.range[0], specifier.range[1]])];
        };

        /**
         * Splices out the whole braced group, plus the comma that separates it
         * from a surviving default (or namespace) specifier, once every named
         * specifier in it is removed.
         */
        const removeNamedGroup = (
          fixer: TSESLint.RuleFixer,
          named: TSESTree.ImportSpecifier[],
        ): TSESLint.RuleFix[] => {
          const openBrace = sourceCode.getTokenBefore(
            named[0],
            (token) => token.value === '{',
          );
          const closeBrace = sourceCode.getTokenAfter(
            named[named.length - 1],
            (token) => token.value === '}',
          );
          if (!openBrace || !closeBrace) {
            return named.map((specifier) => fixer.remove(specifier));
          }
          const separator = sourceCode.getTokenBefore(openBrace);
          const start = isComma(separator)
            ? separator.range[0]
            : openBrace.range[0];
          return [fixer.removeRange([start, closeBrace.range[1]])];
        };

        /**
         * The hook's own import, placed at the react import it displaces.
         *
         * The anchor is nudged to the start of any planned deletion that
         * encloses it, because a fix's edits must not overlap: an unbinding
         * that swallows the react declaration's whole line starts before the
         * declaration whenever that line is indented, and inserting inside
         * that span is the one position ESLint rejects outright.
         */
        const insertImportFixes = (
          fixer: TSESLint.RuleFixer,
          unbindings: readonly TextRange[],
        ): TSESLint.RuleFix[] => {
          if (latestCallbackImport) {
            return [];
          }
          let at = statement.range[0];
          for (const [start, end] of unbindings) {
            if (start < at && at < end) {
              at = start;
            }
          }
          return [fixer.insertTextBeforeRange([at, at], `${importText}\n`)];
        };

        const importFixes = (
          fixer: TSESLint.RuleFixer,
          unbindsReactSpecifiers: boolean,
          unbindings: readonly TextRange[],
        ): TSESLint.RuleFix[] => {
          if (!touchesImport) {
            return [];
          }

          // The orphan plan already unbinds every react specifier the rewrite
          // strips, so the only edit left here is the hook's own import.
          if (!unbindsReactSpecifiers) {
            return insertImportFixes(fixer, unbindings);
          }

          // A surviving reference (or a member-only file) leaves the react
          // import untouched; only the new import is added when missing.
          if (hasSurvivingReference || specifiers.length === 0) {
            return insertImportFixes(fixer, unbindings);
          }

          const defaultOrNamespace = statement.specifiers.find(
            (s) =>
              s.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
              s.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
          );

          const namedSpecifiers = statement.specifiers.filter(
            (s): s is TSESTree.ImportSpecifier =>
              s.type === AST_NODE_TYPES.ImportSpecifier,
          );
          // Survivors are whatever the removal set does not contain, so a
          // specifier is kept whatever shape its imported name takes. Deriving
          // them from a name comparison instead drops every specifier whose
          // imported name is not a plain identifier.
          const removed = new Set<TSESTree.Node>(specifiers);
          const remainingNamed = namedSpecifiers.filter((s) => !removed.has(s));

          if (remainingNamed.length === 0 && !defaultOrNamespace) {
            if (!latestCallbackImport) {
              return [fixer.replaceText(statement, importText)];
            }
            return [fixer.remove(statement)];
          }

          const fixes: TSESLint.RuleFix[] = [
            ...insertImportFixes(fixer, unbindings),
          ];
          if (remainingNamed.length === 0) {
            fixes.push(...removeNamedGroup(fixer, namedSpecifiers));
          } else {
            fixes.push(
              ...specifiers.flatMap((specifier) =>
                removeNamedSpecifier(fixer, specifier, remainingNamed),
              ),
            );
          }
          return fixes;
        };

        /**
         * The replacement text for every batched call, collapsed onto one line
         * except where that line would overrun the print width.
         *
         * Prettier hugs a lone function argument onto the call line while it
         * fits, so collapsing is the shape that survives the next write — and
         * over-wrapping is not the safe direction, since a broken-open call
         * short enough to fit is collapsed straight back. Past the width the
         * two swap places, so the emitted line is MEASURED against the source
         * with every collapse already applied, rather than predicted from the
         * call's parts (issue #1579).
         */
        const conversionTexts = (): Map<TSESTree.CallExpression, string> => {
          const headOf = (call: TSESTree.CallExpression) =>
            `${recommendedHook}${
              call.typeParameters ? sourceCode.getText(call.typeParameters) : ''
            }`;

          const collapsed = batchedConversions.map((conversion) => ({
            conversion,
            edit: {
              range: conversion.node.range,
              text: `${headOf(conversion.node)}(${collapsedCallbackText(
                sourceCode,
                conversion.node,
                conversion.node.arguments[0],
              )})`,
            } as PlannedEdit,
          }));

          const source = sourceCode.getText();
          const simulated = applyEdits(
            source,
            collapsed.map(({ edit }) => edit),
          );
          const shiftBefore = (offset: number) =>
            collapsed
              .filter(({ edit }) => edit.range[1] <= offset)
              .reduce(
                (total, { edit }) =>
                  total + edit.text.length - (edit.range[1] - edit.range[0]),
                0,
              );

          const indentUnit = indentUnitOf(sourceCode);
          const texts = new Map<TSESTree.CallExpression, string>();
          for (const { conversion, edit } of collapsed) {
            const { node } = conversion;
            const start = node.range[0] + shiftBefore(node.range[0]);
            const callback = node.arguments[0];
            const overflows =
              lineLengthAt(simulated, start) > printWidth ||
              headSpansLines(sourceCode, callback);
            const broken =
              overflows && breaksOpenWhenLong(callback)
                ? brokenOpenCallText(
                    sourceCode,
                    node,
                    callback,
                    headOf(node),
                    indentUnit,
                  )
                : null;
            texts.set(node, broken ?? edit.text);
          }
          return texts;
        };

        // Everything a rewritten call carries past its callback argument — the
        // dependency array, and any further argument — is absent from the
        // replacement text, so those ranges are what the fix deletes.
        const droppedRanges: TSESTree.Range[] = batchedConversions.map(
          (conversion) =>
            [
              conversion.node.arguments[0].range[1],
              conversion.node.range[1],
            ] as TSESTree.Range,
        );
        const programScope = ASTHelpers.getScope(context, program);

        /**
         * The spans the batched rewrite genuinely erases.
         *
         * Only two parts of a converted call disappear: its callee, which the
         * hook's name replaces, and everything past the callback argument — the
         * dependency array and any further argument. The callback text and the
         * call's type parameters are re-emitted verbatim, so listing them would
         * read every binding they mention as unreferenced and unbind imports the
         * rewritten call still uses.
         *
         * `includeIdentifierCallees` selects which oracle owns the react
         * `useCallback` specifier. Excluded, the specifier's binding has no
         * reference among these spans, so the orphan planner never considers it
         * and {@link importFixes} keeps its comment-preserving splice.
         */
        const erasedSpans = (includeIdentifierCallees: boolean): TextRange[] =>
          batchedConversions.flatMap((conversion) => {
            const { node } = conversion;
            const spans: TextRange[] = [
              [node.arguments[0].range[1], node.range[1]],
            ];
            // A member callee's object is the only binding it reads, and the
            // rule's own import rewrite never touches it.
            if (includeIdentifierCallees || !conversion.callee) {
              spans.push(node.callee.range);
            }
            return spans;
          });

        /**
         * Whether the edits form the single ordered, non-overlapping sequence
         * ESLint demands of one fix.
         *
         * The two import oracles below own disjoint declarations in every shape
         * this rule is written for, but "every shape" is a claim about a file
         * nobody has seen. A file that breaks it — a dependency array reading
         * the same react declaration the specifier splice rewrites — would make
         * ESLint throw out of the whole lint rather than report, so the edit set
         * is checked and withheld instead.
         */
        const editsAreDisjoint = (
          fixes: readonly TSESLint.RuleFix[],
        ): boolean => {
          const ordered = [...fixes].sort(
            (left, right) =>
              left.range[0] - right.range[0] || left.range[1] - right.range[1],
          );
          let previousEnd = -1;
          for (const fix of ordered) {
            if (fix.range[0] < previousEnd) {
              return false;
            }
            previousEnd = fix.range[1];
          }
          return true;
        };

        // Every call-site conversion and the import rewrite ride on ONE fix
        // from ONE report. ESLint discards a multi-part fix wholesale when any
        // part conflicts with another rule's fix and retries it on the next
        // pass against the updated text, whereas fixes split across reports
        // land piecemeal: the disjoint import rewrite would apply even when
        // the call-site conversion is deferred, permanently stranding a
        // `useCallback(...)` call with no import (issue #1400).
        const [fixOwner, ...followers] = batchedConversions;

        context.report({
          node: fixOwner.node,
          messageId: 'useLatestCallback',
          data: {
            currentHook: fixOwner.currentHook,
            recommendedHook,
          },
          fix(fixer) {
            // Withhold the whole edit — nothing before this point mutates
            // state, so a withheld pass cannot leave a later one believing the
            // import is in place. The violation still stands as a report so
            // the author resolves the name clash deliberately. The batch is
            // atomic, so one unreachable call site withholds all of it.
            if (!batchedConversions.every(reachesHook)) {
              return null;
            }

            // Deleting the dependency arrays must not strand a binding that
            // exists only to be listed in one. The batch is atomic, so a single
            // orphaned binding withholds all of it, and the violation still
            // stands as a report: the author drops the dead declaration
            // together with the array.
            if (orphansLocalBinding(programScope, droppedRanges)) {
              return null;
            }

            // Converting every `React.useCallback` call strips the last read of
            // the react default import, and dropping a dependency array strips
            // the last read of whatever was computed for it. Either leaves the
            // file failing `no-unused-vars` and `noUnusedLocals` on a fix that
            // resolved the only report that would have re-raised the debt
            // (issue #1898).
            //
            // Two plans, because the react `useCallback` specifier has two
            // possible owners and only one of them may edit it. The wider plan
            // decides everything, which is what unbinds a mixed
            // `import React, { useCallback }` as a single declaration; when it
            // declines — a comment among the specifiers, a name the planner's
            // second-opinion scan still finds — the narrower plan hands that
            // specifier back to the splice above, which preserves the comments
            // the planner refuses to guess at (issue #1446).
            //
            // A null from BOTH is a demand to withhold: a binding is left
            // unreferenced that neither oracle can unbind safely.
            const wholePlan = planOrphanedImportRemoval(
              sourceCode,
              erasedSpans(true),
            );
            const unbindings =
              wholePlan ??
              planOrphanedImportRemoval(sourceCode, erasedSpans(false));
            if (!unbindings) {
              return null;
            }

            const texts = conversionTexts();
            const fixes = [
              ...batchedConversions.map((conversion) =>
                fixer.replaceText(
                  conversion.node,
                  texts.get(conversion.node) as string,
                ),
              ),
              ...importFixes(fixer, wholePlan === null, unbindings),
              ...unbindings.map((range) =>
                fixer.removeRange([range[0], range[1]]),
              ),
            ];
            return editsAreDisjoint(fixes) ? fixes : null;
          },
        });

        for (const conversion of [...followers, ...deferredConversions]) {
          context.report({
            node: conversion.node,
            messageId: 'useLatestCallback',
            data: {
              currentHook: conversion.currentHook,
              recommendedHook,
            },
          });
        }

        if (!touchesImport) {
          return;
        }

        if (hasSurvivingReference && latestCallbackImport) {
          return; // The react import stays as is and the new import exists
        }

        context.report({
          node: statement,
          messageId: 'useLatestCallback',
          data: {
            currentHook: useCallbackLocalName,
            recommendedHook,
          },
        });
      },
    };
  },
});

export default useLatestCallback;
