import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import {
  importAnchorIndent,
  importAnchorLineStartIfOwned,
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';
import { planOrphanedImportRemoval } from '../utils/importRemoval';
import { createSuppressionChecker } from '../utils/disableDirectives';

/**
 * Type-only, so the reference erases at compile time. The value side of
 * `typescript` stays behind a `require` inside the function that needs it.
 */
type TsType = import('typescript').Type;

const DEEP_COMPARE_MODULE = '@blumintinc/use-deep-compare';
const DEEP_COMPARE_HOOK = 'useDeepCompareMemo';

export type MessageIds = 'preferUseDeepCompareMemo';

type Options = [
  {
    printWidth?: number;
  },
];

type Context = TSESLint.RuleContext<MessageIds, Options>;

/**
 * Prettier's own default. The conversion renames a callee inside a statement a
 * formatter owns, and `useDeepCompareMemo` is eleven characters longer than
 * `useMemo`, so any call written on one line past this width minus eleven is
 * pushed over it — failing `prettier --check` until the next `prettier --write`
 * reformats the fixer's output (#2064).
 */
const DEFAULT_PRINT_WIDTH = 80;

/**
 * Prettier's default `tabWidth`. A call written on one line breaks nothing
 * across lines yet, so it offers no nesting step of its own to copy.
 */
const DEFAULT_INDENT_STEP = '  ';

// Consider these as memoizing hooks producing stable references
const MEMOIZING_HOOKS = new Set([
  'useMemo',
  'useCallback',
  'useDeepCompareMemo',
  'useLatestCallback',
]);

function isUseMemoCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useMemo';
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useMemo';
  }
  return false;
}

function isIdentifierMemoizedAbove(
  name: string,
  memoizedIds: Set<string>,
): boolean {
  return memoizedIds.has(name);
}

function containsJsx(node: TSESTree.Node | null | undefined): boolean {
  if (!node) return false;
  const stack: TSESTree.Node[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    if (
      cur.type === AST_NODE_TYPES.JSXElement ||
      cur.type === AST_NODE_TYPES.JSXFragment
    ) {
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(cur as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (cur as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            stack.push(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }
  }
  return false;
}

function isNonPrimitiveWithoutTypes(expr: TSESTree.Expression): boolean {
  switch (expr.type) {
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.NewExpression:
    case AST_NODE_TYPES.ClassExpression:
      return true;
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.ChainExpression:
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    default:
      return false;
  }
}

/**
 * What a type checker can say about one dependency's primitiveness.
 *
 * The third value is the load-bearing one. A checker running without a
 * `project` still answers every question, but it resolves imported symbols and
 * `lib` types to `any` — so reading that absence of information as "not a
 * primitive" lets a degraded program decide verdicts it knows nothing about
 * (#1972). `unproven` hands the question to the syntactic layers instead of
 * settling it.
 */
type PrimitivenessVerdict = 'primitive' | 'nonPrimitive' | 'unproven';

/**
 * Layer A: what the type checker proves about a dependency expression.
 *
 * Reading the type at the *reference* rather than at the declaration is
 * deliberate: control-flow narrowing is what makes an optional `a?: string`
 * answer `string` at the site React actually compares.
 */
function primitivenessByType(
  context: Context,
  expr: TSESTree.Expression,
): PrimitivenessVerdict {
  const services = context.parserServices;
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) {
    return 'unproven';
  }
  try {
    // Dereferenced inside the function rather than at module scope: reading
    // `ts.TypeFlags` while the module is being loaded takes the whole plugin
    // down wherever `typescript` is not yet resolvable (#1354).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts: typeof import('typescript') = require('typescript');
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(expr);
    if (!tsNode) return 'unproven';

    const primitiveFlags =
      ts.TypeFlags.StringLike |
      ts.TypeFlags.NumberLike |
      ts.TypeFlags.BooleanLike |
      ts.TypeFlags.BigIntLike |
      ts.TypeFlags.ESSymbolLike |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Void;
    // `any` and `unknown` carry no shape, and an unresolved type parameter is
    // whatever its caller supplies, so none of the three is an answer.
    const uninformativeFlags =
      ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter;

    const classify = (candidate: TsType): PrimitivenessVerdict => {
      if (candidate.flags & uninformativeFlags) return 'unproven';
      if (candidate.isUnion()) {
        const verdicts = candidate.types.map(classify);
        if (verdicts.includes('unproven')) return 'unproven';
        return verdicts.every((verdict) => verdict === 'primitive')
          ? 'primitive'
          : 'nonPrimitive';
      }
      return candidate.flags & primitiveFlags ? 'primitive' : 'nonPrimitive';
    };

    return classify(checker.getTypeAtLocation(tsNode));
  } catch {
    return 'unproven';
  }
}

/**
 * Type nodes naming a primitive outright. A `TSTypeReference` is absent by
 * design: an alias resolves only through the checker, which is Layer A's job.
 */
const PRIMITIVE_TYPE_KEYWORDS = new Set<string>([
  AST_NODE_TYPES.TSStringKeyword,
  AST_NODE_TYPES.TSNumberKeyword,
  AST_NODE_TYPES.TSBooleanKeyword,
  AST_NODE_TYPES.TSBigIntKeyword,
  AST_NODE_TYPES.TSSymbolKeyword,
  AST_NODE_TYPES.TSNullKeyword,
  AST_NODE_TYPES.TSUndefinedKeyword,
  AST_NODE_TYPES.TSVoidKeyword,
]);

function isPrimitiveLiteralNode(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) return true;
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    // `-1` and `+1` are literal types spelled across two nodes.
    return (
      (node.operator === '-' || node.operator === '+') &&
      isPrimitiveLiteralNode(node.argument)
    );
  }
  if (node.type !== AST_NODE_TYPES.Literal) return false;
  // A regular expression literal is an object, and its `value` is null in
  // hosts that cannot construct it — the same shape a `null` literal has.
  if ('regex' in node && node.regex) return false;
  const { value } = node;
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

function isPrimitiveTypeNode(node: TSESTree.TypeNode): boolean {
  if (PRIMITIVE_TYPE_KEYWORDS.has(node.type)) return true;
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return isPrimitiveLiteralNode(node.literal);
  }
  // A union is primitive only if nothing in it can carry identity, which is
  // what makes `string | undefined` — the type an optional parameter has —
  // answer the same as `string`.
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.length > 0 && node.types.every(isPrimitiveTypeNode);
  }
  return false;
}

function isUseStateCallee(callee: TSESTree.LeftHandSideExpression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'useState';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'useState'
  );
}

/**
 * Whether a `const [x] = useState(<primitive>)` binding holds a primitive.
 *
 * Only element 0 qualifies: element 1 is the setter, a function. The setter is
 * also the only other writer of element 0, and the initial value types what it
 * accepts, so the state stays whatever kind the initializer made it.
 */
function isPrimitiveUseStateElement(
  declarator: TSESTree.VariableDeclarator,
  bound: TSESTree.Identifier,
): boolean {
  const { id, init } = declarator;
  if (id.type !== AST_NODE_TYPES.ArrayPattern) return false;
  if (id.elements[0] !== bound) return false;
  if (!init || init.type !== AST_NODE_TYPES.CallExpression) return false;
  if (!isUseStateCallee(init.callee)) return false;

  // An explicit type argument overrides whatever the initial value would have
  // inferred, so it answers instead of the initializer.
  const typeArguments = init.typeParameters?.params;
  if (typeArguments && typeArguments.length > 0) {
    return typeArguments.every(isPrimitiveTypeNode);
  }
  const [initial] = init.arguments;
  return initial !== undefined && isPrimitiveLiteralNode(initial);
}

/**
 * Layer B: primitiveness the parser alone can see.
 *
 * This layer exists because Layer A goes blind exactly where the shared rule
 * testers run it — with no `project`, `useState` imported from react resolves
 * to `any`, and so does every `lib` type. Syntax the file spells out does not
 * degrade that way.
 */
function isProvablyPrimitiveBinding(
  definition: TSESLint.Scope.Definition,
): boolean {
  const bound = definition.name;
  if (bound.type !== AST_NODE_TYPES.Identifier) return false;

  // An annotation constrains every assignment to the binding, so it answers for
  // a `let` and a reassigned parameter just as it does for a `const`.
  const annotation = bound.typeAnnotation?.typeAnnotation;
  if (annotation) return isPrimitiveTypeNode(annotation);

  const declarator = definition.node;
  const declaration = definition.parent;
  if (declarator.type !== AST_NODE_TYPES.VariableDeclarator) return false;
  // Without an annotation the initializer is the only evidence, and it only
  // describes the binding for as long as nothing rebinds it.
  if (
    !declaration ||
    declaration.type !== AST_NODE_TYPES.VariableDeclaration ||
    declaration.kind !== 'const'
  ) {
    return false;
  }

  if (declarator.id === bound) {
    return declarator.init !== null && isPrimitiveLiteralNode(declarator.init);
  }
  return isPrimitiveUseStateElement(declarator, bound);
}

/**
 * Members that exist on primitives and on nothing else in ordinary code.
 *
 * `length`, `slice`, `includes`, `indexOf`, `concat`, `at`, `toString` and
 * `valueOf` are deliberately absent: arrays and objects carry them too, so
 * vetoing on one would stop the rule seeing the array dependencies it exists
 * to catch.
 */
const PRIMITIVE_ONLY_MEMBERS = new Set([
  'toUpperCase',
  'toLowerCase',
  'toFixed',
  'toPrecision',
  'trim',
  'trimStart',
  'trimEnd',
  'padStart',
  'padEnd',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'normalize',
  'localeCompare',
  'startsWith',
  'endsWith',
  'repeat',
  'toExponential',
]);

/**
 * The children of a node an identifier can be *referenced* from.
 *
 * A non-computed member's property and a non-computed key spell a name rather
 * than read a binding, so counting them as occurrences would let an unrelated
 * `other.trim` decide what `trim` denotes.
 */
function referencedChildren(node: TSESTree.Node): TSESTree.Node[] {
  const children: TSESTree.Node[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = node as any;
  for (const key of Object.keys(record)) {
    if (key === 'parent') continue;
    if (
      key === 'property' &&
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed
    ) {
      continue;
    }
    if (
      key === 'key' &&
      (node.type === AST_NODE_TYPES.Property ||
        node.type === AST_NODE_TYPES.MethodDefinition ||
        node.type === AST_NODE_TYPES.PropertyDefinition) &&
      !node.computed
    ) {
      continue;
    }
    const child = record[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const element of child) {
        if (element && typeof element === 'object' && 'type' in element) {
          children.push(element as TSESTree.Node);
        }
      }
    } else if (typeof child === 'object' && 'type' in child) {
      children.push(child as TSESTree.Node);
    }
  }
  return children;
}

/**
 * Layer C: every read of the name inside the callback is a member that only a
 * primitive has.
 *
 * The weakest of the three layers, and the only one that reaches a binding the
 * file gives no annotation and no initializer for — `const { asPath } =
 * useRouter()` is the shape the consumer's hooks are written in. It answers
 * only when *every* occurrence agrees: a computed access, a spread, or the bare
 * name passed along says nothing about the value's shape, and one such
 * occurrence withdraws the guess.
 */
function readsOnlyPrimitiveMembers(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  name: string,
): boolean {
  let accesses = 0;
  let proven = true;

  const visit = (node: TSESTree.Node): void => {
    if (!proven) return;

    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === name
    ) {
      if (
        node.computed ||
        node.property.type !== AST_NODE_TYPES.Identifier ||
        !PRIMITIVE_ONLY_MEMBERS.has(node.property.name)
      ) {
        proven = false;
        return;
      }
      accesses += 1;
      return;
    }

    if (node.type === AST_NODE_TYPES.Identifier && node.name === name) {
      proven = false;
      return;
    }

    for (const child of referencedChildren(node)) {
      visit(child);
    }
  };

  visit(callback.body);
  return proven && accesses > 0;
}

/**
 * The one binding a name denotes at a call site, or null when the answer is not
 * a single declaration. A name with several definitions — a redeclared `var`, a
 * merged declaration — describes more than one thing, and no one of them speaks
 * for the reference.
 */
function soleDefinitionOf(
  context: Context,
  node: TSESTree.Node,
  name: string,
): TSESLint.Scope.Definition | null {
  const variable = ASTHelpers.findVariableInScope(
    ASTHelpers.getScope(context, node),
    name,
  );
  if (!variable || variable.defs.length !== 1) return null;
  return variable.defs[0];
}

/**
 * Whether a dependency is *provably* a primitive, across all three layers.
 *
 * The direction is asymmetric on purpose. A missed deep comparison costs a
 * recomputation; a deep comparison wrapped around a `string` costs an injected
 * dependency, a new import and a hook that cannot help, so nothing short of a
 * proof promotes a dependency here (#1979).
 */
function isProvablyPrimitiveDependency(
  context: Context,
  call: TSESTree.CallExpression,
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  dep: TSESTree.Identifier,
): boolean {
  const verdict = primitivenessByType(context, dep);
  if (verdict === 'primitive') return true;

  const definition = soleDefinitionOf(context, call, dep.name);
  if (definition && isProvablyPrimitiveBinding(definition)) return true;

  // Method names are evidence only where nothing better exists: a checker that
  // resolved the type has already answered, and answered from more than a name.
  return (
    verdict === 'unproven' && readsOnlyPrimitiveMembers(callback, dep.name)
  );
}

function collectMemoizedIdentifiers(context: Context): Set<string> {
  const memoized = new Set<string>();
  const sourceCode = context.getSourceCode();
  const program = sourceCode.ast;

  function visit(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.VariableDeclarator) {
      const id = node.id;
      const init = node.init;
      if (!init) return;
      if (init.type === AST_NODE_TYPES.CallExpression) {
        let calleeName: string | null = null;
        if (init.callee.type === AST_NODE_TYPES.Identifier) {
          calleeName = init.callee.name;
        } else if (
          init.callee.type === AST_NODE_TYPES.MemberExpression &&
          !init.callee.computed &&
          init.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          calleeName = init.callee.property.name;
        }
        if (calleeName && MEMOIZING_HOOKS.has(calleeName)) {
          if (id.type === AST_NODE_TYPES.Identifier) {
            memoized.add(id.name);
          }
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(node as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            visit(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        visit(child as TSESTree.Node);
      }
    }
  }

  visit(program as unknown as TSESTree.Node);
  return memoized;
}

/**
 * A specifier that binds the hook as a callable value under the exact name the
 * rewritten call spells. An alias binds the hook to some other name, leaving
 * `useDeepCompareMemo` unresolvable, and a type-only specifier erases at
 * compile time, so neither can carry the call.
 */
function bindsDeepCompareMemo(specifier: TSESTree.ImportClause): boolean {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === DEEP_COMPARE_HOOK &&
    specifier.local.name === DEEP_COMPARE_HOOK
  );
}

/**
 * The hook's import read off `Program.body` rather than off a flag set by an
 * ImportDeclaration visitor, so the answer holds under multi-pass `--fix`
 * wherever the import sits relative to the fix site.
 */
function findDeepCompareMemoImport(
  program: TSESTree.Program,
): TSESTree.ImportClause | null {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      statement.source.value !== DEEP_COMPARE_MODULE ||
      (statement.importKind && statement.importKind !== 'value')
    ) {
      continue;
    }
    const specifier = statement.specifiers.find(bindsDeepCompareMemo);
    if (specifier) return specifier;
  }
  return null;
}

/**
 * Whether the visible `useDeepCompareMemo` binding is the very import this fix
 * would otherwise insert. Reusing that binding is the intended path; any other
 * binding of the name belongs to the file's author.
 */
function bindsHookImport(
  variable: TSESLint.Scope.Variable,
  hookImport: TSESTree.ImportClause | null,
): boolean {
  return (
    hookImport !== null &&
    variable.defs.length > 0 &&
    variable.defs.every((def) => def.node === hookImport)
  );
}

/**
 * A `useMemo(...)` the rule reports, paired with the scope its callee resolves
 * in. The scope is captured during traversal because the fix runs afterwards,
 * when an ESLint version lacking `sourceCode.getScope` can only report the
 * global scope and would miss a narrower shadow.
 */
type ConvertibleCall = {
  node: TSESTree.CallExpression;
  scope: TSESLint.Scope.Scope;
};

/**
 * Whether the name the rewrite spells resolves, at this call site, to nothing or
 * to the very import this fix would insert. Any other binding makes the edit
 * wrong twice over: the inserted import declares the name a second time
 * (TS2440/TS2300), and a shadowing parameter or local silently routes the call
 * to the wrong value with no diagnostic at all. Such a call site keeps its
 * report and stays out of the batch, so the author migrates it deliberately —
 * and, still spelling `useMemo`, it holds the specifier the batch would
 * otherwise unbind.
 */
function emitsResolvableHook(
  call: ConvertibleCall,
  hookImport: TSESTree.ImportClause | null,
): boolean {
  const existing = ASTHelpers.findVariableInScope(
    call.scope,
    DEEP_COMPARE_HOOK,
  );
  return !existing || bindsHookImport(existing, hookImport);
}

/**
 * The leading whitespace of the line a node starts on.
 *
 * Prettier closes a broken argument list at the column the statement opens at,
 * which is this whitespace whether the call leads its line (`useMemo(`) or sits
 * behind an assignment (`const formatted = useMemo(`).
 */
function lineIndentOf(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
): string {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const indent = /^[ \t]*/.exec(line);
  return indent ? indent[0] : '';
}

/**
 * The width the call's line reaches once the callee is renamed.
 *
 * The rename is the only edit that moves this line: the import insertion lands
 * at the file's prologue and the orphan-import removal inside an import
 * declaration, both of which are elsewhere. The delta is read off the callee
 * rather than assumed, because a `React.useMemo` callee is thirteen characters
 * where a bare `useMemo` is seven.
 *
 * A trailing line comment is subtracted and a trailing block comment is not,
 * because that is the asymmetry prettier itself prints: a line comment is
 * emitted as a suffix that never counts toward whether the statement fits —
 * measured, left flat at 124 columns — while a block comment occupies columns
 * like any other text and breaks the same statement at 88. Counting a line
 * comment would break statements prettier leaves alone, which is the mirror of
 * the defect this measurement exists to fix.
 */
function widthAfterRename(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
  batch: readonly TSESTree.CallExpression[],
): number {
  const startLine = call.loc.start.line;
  const line = sourceCode.lines[startLine - 1] ?? '';
  // A line comment runs to the end of its line, so its column is where the
  // printed statement stops.
  const suffix = sourceCode
    .getAllComments()
    .find(
      (comment) =>
        comment.type === AST_TOKEN_TYPES.Line &&
        comment.loc.start.line === startLine,
    );
  const printed = suffix
    ? line.slice(0, suffix.loc.start.column).trimEnd()
    : line;
  // Every callee this one conversion renames within this call moves the line,
  // not just the call's own: `useMemo(() => useMemo(…), …)` grows by twenty-two
  // columns, so measuring the outer eleven alone reads a line that lands at 96
  // as one that lands at 85 (#2121). Only calls sharing a range with this one
  // count, which leaves an unrelated sibling further along the line measured
  // exactly as before.
  const renameDelta = batch
    .filter(
      (other) =>
        other.range[0] < call.range[1] &&
        call.range[0] < other.range[1] &&
        other.callee.loc.start.line === startLine,
    )
    .reduce(
      (total, other) =>
        total +
        DEEP_COMPARE_HOOK.length -
        (other.callee.range[1] - other.callee.range[0]),
      0,
    );
  return printed.length + renameDelta;
}

/**
 * The `(` that opens the argument list.
 *
 * Walked over tokens from the end of the type arguments rather than searched
 * for in the text, because a type argument can spell a parenthesis of its own:
 * `useMemo<(row: Row) => string>(…)`.
 */
function argumentListOpenParen(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.Token | null {
  const afterCallee = call.typeParameters
    ? call.typeParameters.range[1]
    : call.callee.range[1];
  return (
    sourceCode
      .getTokens(call)
      .find(
        (token) =>
          token.range[0] >= afterCallee &&
          token.type === AST_TOKEN_TYPES.Punctuator &&
          token.value === '(',
      ) ?? null
  );
}

/**
 * The comma separating the two arguments.
 *
 * Read off the tokens between the arguments rather than as "the token after the
 * first one", which is the closing parenthesis of a parenthesised argument.
 * Nothing between two complete expressions can be a comma except the one that
 * separates them, so the first is the separator at any nesting depth.
 */
function argumentSeparatorOf(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.Token | null {
  const [first, second] = call.arguments;
  return (
    sourceCode
      .getTokensBetween(first, second)
      .find(
        (token) =>
          token.type === AST_TOKEN_TYPES.Punctuator && token.value === ',',
      ) ?? null
  );
}

/**
 * A span of the source with every callee this conversion renames rewritten.
 *
 * A re-rendered call replaces its whole range, so an inner convertible call's
 * own rename would land inside that replacement — and ESLint drops overlapping
 * fixes outright, taking every report's fix with them. Carrying the inner
 * rename in the outer text is what lets the pair convert as one edit (#2121).
 */
function textWithRenames(
  sourceCode: TSESLint.SourceCode,
  start: number,
  end: number,
  renamed: readonly TSESTree.CallExpression[],
): string {
  const source = sourceCode.getText();
  const callees = renamed
    .map((call) => call.callee.range)
    .filter(
      ([calleeStart, calleeEnd]) => calleeStart >= start && calleeEnd <= end,
    )
    .sort((a, b) => a[0] - b[0]);
  let cursor = start;
  let rendered = '';
  for (const [calleeStart, calleeEnd] of callees) {
    rendered += source.slice(cursor, calleeStart) + DEEP_COMPARE_HOOK;
    cursor = calleeEnd;
  }
  return rendered + source.slice(cursor, end);
}

/**
 * The call re-rendered the way prettier prints an argument list it cannot fit:
 * one argument per line at a single nesting step, a trailing comma on each, and
 * the closing parenthesis back at the statement's own column.
 *
 * Every `null` below is a DELIBERATE decline rather than a fall-through: the
 * in-place rename is emitted instead, leaving a line prettier will rewrap but
 * losing nothing the author wrote. A formatting nicety does not justify
 * relocating a comment or guessing at a layout prettier does not print (#2045).
 */
function reprintCallBroken(
  sourceCode: TSESLint.SourceCode,
  call: TSESTree.CallExpression,
  renamed: readonly TSESTree.CallExpression[],
): string | null {
  // A call already broken across lines carries the author's own breaks inside
  // the argument text this re-render copies verbatim, so every continuation
  // line would keep its original column while its opening line moved.
  if (call.loc.start.line !== call.loc.end.line) return null;

  // Prettier gives an argument list its own line per argument only while the
  // trailing argument is not one it hugs. At three arguments ending in an
  // array it breaks the array open instead and leaves the rest flat, which is
  // a different shape — and `useMemo` is a two-argument hook, so declining
  // there withholds nothing real.
  if (call.arguments.length !== 2) return null;
  const [callback, deps] = call.arguments;
  if (deps.type !== AST_NODE_TYPES.ArrayExpression) return null;

  // A zero-parameter arrow with a block body is prettier's React-hook shape: it
  // keeps the callee, the closing brace and the dependency array on the outer
  // lines and breaks only the block between them. One argument per line is not
  // what it prints there.
  if (
    callback.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    callback.body.type === AST_NODE_TYPES.BlockStatement
  ) {
    return null;
  }

  // The callee is re-emitted from its own name onward, so a parenthesised
  // callee — `(useMemo)(…)` — would have the text between them re-emitted in
  // the wrong order.
  const firstToken = sourceCode.getFirstToken(call);
  if (!firstToken || firstToken.range[0] !== call.callee.range[0]) return null;

  const openParen = argumentListOpenParen(sourceCode, call);
  const separator = argumentSeparatorOf(sourceCode, call);
  const closeParen = sourceCode.getLastToken(call);
  if (!openParen || !separator || !closeParen) return null;

  // A comment between the callee and the opening parenthesis is one prettier
  // MOVES: it prints `useDeepCompareMemo(/* keep */ arg`. Relocating a comment
  // is not this fixer's to do, so the rename stays in place there. Comments
  // written inside the argument list are a different matter — each rides along
  // on the slot it annotates below, which is exactly where prettier leaves it,
  // so they are no reason to decline (#2121).
  const relocatedComment = sourceCode
    .getAllComments()
    .some(
      (comment) =>
        comment.range[0] >= call.callee.range[1] &&
        comment.range[1] <= openParen.range[0],
    );
  if (relocatedComment) return null;

  // A comma the author already wrote before the closing parenthesis is the one
  // this re-render appends itself, so the slot ends ahead of it.
  const beforeClose = sourceCode.getTokenBefore(closeParen);
  const lastSlotEnd =
    beforeClose && beforeClose.value === ','
      ? beforeClose.range[0]
      : closeParen.range[0];

  // Everything between the slots and the closer is re-emitted except the span
  // that trailing comma occupies, so a comment written behind it is the one
  // piece of text this re-render would delete outright.
  const strandedComment = sourceCode
    .getAllComments()
    .some(
      (comment) =>
        comment.range[0] >= lastSlotEnd &&
        comment.range[1] <= closeParen.range[0],
    );
  if (strandedComment) return null;

  // Slots are sliced out of the source rather than rebuilt from each argument's
  // own text, so a comment written between two tokens rides on the slot it
  // annotates. That is what prettier prints, measured on all four positions a
  // single-line call has: a leading comment leads its own line, a trailing one
  // stays ahead of the comma this re-render appends.
  const slots = [
    textWithRenames(
      sourceCode,
      openParen.range[1],
      separator.range[0],
      renamed,
    ),
    textWithRenames(sourceCode, separator.range[1], lastSlotEnd, renamed),
  ].map((slot) => slot.trim());

  const indent = lineIndentOf(sourceCode, call);
  const opener = textWithRenames(
    sourceCode,
    call.callee.range[1],
    openParen.range[1],
    renamed,
  );
  return [
    `${DEEP_COMPARE_HOOK}${opener}`,
    ...slots.map((slot) => `${indent}${DEFAULT_INDENT_STEP}${slot},`),
    `${indent})`,
  ].join('\n');
}

/**
 * What one call site's conversion emits.
 *
 * `absorbed` is the nesting case: an enclosing call is re-rendered, and its
 * replacement already carries this call's rename, so this site contributes no
 * edit of its own.
 */
type CallConversion =
  | { kind: 'rename' }
  | { kind: 'reprint'; text: string }
  | { kind: 'absorbed' };

/**
 * How each call in the batch converts.
 *
 * Renaming in place is the whole conversion wherever the line still fits, and
 * that measurement runs in both directions on purpose: prettier collapses a
 * hand-broken call that fits back onto one line, so wrapping unconditionally
 * would trade one `prettier --check` failure for its mirror image on every
 * short call (#2064).
 */
function planConversions(
  sourceCode: TSESLint.SourceCode,
  batch: readonly TSESTree.CallExpression[],
  printWidth: number,
): Map<TSESTree.CallExpression, CallConversion> {
  const encloses = (
    outer: TSESTree.CallExpression,
    inner: TSESTree.CallExpression,
  ) =>
    outer !== inner &&
    outer.range[0] <= inner.range[0] &&
    inner.range[1] <= outer.range[1];

  // Outermost first: prettier breaks an outer argument list before it reaches
  // an inner one, and the outer re-render is what claims the inner's edit.
  const ordered = [...batch].sort(
    (left, right) =>
      left.range[0] - right.range[0] || right.range[1] - left.range[1],
  );

  const conversions = new Map<TSESTree.CallExpression, CallConversion>();
  for (const call of ordered) {
    if (conversions.get(call)?.kind === 'absorbed') continue;

    // A call nested inside one this pass leaves flat is a call prettier reaches
    // only after breaking that outer list open. Breaking the inner alone inside
    // a flat outer call is a layout prettier prints for neither, so the
    // enclosing decline carries down.
    const insideFlatCall = ordered.some(
      (other) => conversions.has(other) && encloses(other, call),
    );
    const text =
      insideFlatCall || widthAfterRename(sourceCode, call, batch) <= printWidth
        ? null
        : reprintCallBroken(sourceCode, call, batch);

    conversions.set(
      call,
      text === null ? { kind: 'rename' } : { kind: 'reprint', text },
    );
    if (text !== null) {
      for (const inner of ordered) {
        if (encloses(call, inner)) conversions.set(inner, { kind: 'absorbed' });
      }
    }
  }
  return conversions;
}

/**
 * The single fix that converts every call in `calls`, imports the hook once, and
 * unbinds whatever the conversions stop reading.
 *
 * Batching is what makes the unbinding reachable at all. Judged one call at a
 * time, a file with two convertible calls never sees either as the specifier's
 * sole remaining reference, and once both are rewritten the rule no longer
 * reports — so nothing revisits the stranded import. The batch is sound only
 * because it contains exactly the calls this one fix rewrites: siblings the
 * caller has already dropped for being suppressed or unfixable are absent, so no
 * unbinding is ever claimed on the strength of an edit that does not happen.
 */
function convertCallsFixes(
  context: Context,
  fixer: TSESLint.RuleFixer,
  calls: readonly ConvertibleCall[],
  printWidth: number,
): TSESLint.RuleFix[] | null {
  const sourceCode = context.getSourceCode();
  // The callees are the text this fix deletes, so they are also the text
  // whatever carried the hook stops being read from: `useMemo` for a bare call,
  // `React` for a member call. A binding left with no reference at all is
  // unbound here, in this same fix — stripping its last use and keeping the
  // declaration trades this rule's report for an unused-import one, and nothing
  // re-reports that debt once the rewrite has resolved the original violation.
  //
  // A conversion that re-renders its whole call still deletes exactly the same
  // callee, so the removal plan reads the callee ranges either way.
  //
  // The insertions are declared because this same fix writes the replacement
  // import back at the shared anchor — the position of the react import being
  // removed. A planner told nothing about that write reads the file as opening
  // on the statement below the removal and takes the separator blank line with
  // it. Prettier preserves such a blank line but never reinstates one, so the
  // loss is silent and survives every later format (see
  // `RemovalContext.insertions` in `importRemoval.ts`).
  const importRemoval = planOrphanedImportRemoval(
    sourceCode,
    calls.map((call) => call.node.callee.range),
    { insertions: deepCompareImportInsertions(context) },
  );
  // No plan means a binding is orphaned yet cannot be unbound safely, so the
  // rewrite stays too: the report without a fixer is the lesser damage.
  if (!importRemoval) return null;

  const batch = calls.map((call) => call.node);
  const conversions = planConversions(sourceCode, batch, printWidth);
  return [
    ...batch.flatMap((call) => {
      const conversion = conversions.get(call);
      // An absorbed call emits nothing: the enclosing re-render already carries
      // its rename, and a second edit inside that replacement would overlap it.
      if (!conversion || conversion.kind === 'absorbed') return [];
      return conversion.kind === 'reprint'
        ? [fixer.replaceText(call, conversion.text)]
        : [fixer.replaceText(call.callee, DEEP_COMPARE_HOOK)];
    }),
    ...ensureDeepCompareImportFixes(context, fixer),
    ...importRemoval.map((range) => fixer.removeRange([range[0], range[1]])),
  ];
}

/**
 * The offsets `ensureDeepCompareImportFixes` writes at, declared so the removal
 * planner can account for them. An empty list is itself a claim: when the hook
 * is already imported nothing is written, and the planner may treat the
 * removal's surroundings as its own.
 */
function deepCompareImportInsertions(context: Context): number[] {
  const sourceCode = context.getSourceCode();
  if (findDeepCompareMemoImport(sourceCode.ast)) return [];
  const anchor = importAnchorLineStartIfOwned(
    sourceCode,
    importInsertionAnchor(sourceCode),
  );
  return [anchor.kind === 'before' ? anchor.target.range[0] : anchor.index];
}

function ensureDeepCompareImportFixes(
  context: Context,
  fixer: TSESLint.RuleFixer,
): TSESLint.RuleFix[] {
  const sourceCode = context.getSourceCode();
  const program = sourceCode.ast;

  // If already imported anywhere, skip adding
  if (findDeepCompareMemoImport(program)) return [];

  // The shared anchor keeps the insertion below whatever opens the file: text
  // spliced above a `#!` shebang stops the file parsing, and text above a
  // `'use client'` directive or a header comment strips the prologue of the
  // meaning it only carries while it leads.
  const anchor = importInsertionAnchor(sourceCode);
  const indent = importAnchorIndent(sourceCode, anchor);
  const importText = `${indent}import { ${DEEP_COMPARE_HOOK} } from '${DEEP_COMPARE_MODULE}';\n`;

  // Widened to the anchor's line start where the anchor opens it, because the
  // emitted statement carries its own indentation and so leaves the displaced
  // anchor sitting on the original. Where the anchor shares its line the
  // widening is declined: the offset would otherwise fall ahead of the prologue
  // this anchor was chosen to sit below.
  return [
    insertAtImportAnchor(
      sourceCode,
      fixer,
      importAnchorLineStartIfOwned(sourceCode, anchor),
      importText,
    ),
  ];
}

function isImportedIdentifier(context: Context, name: string): boolean {
  const sourceCode = context.getSourceCode();
  const program = sourceCode.ast;
  for (const node of program.body) {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const spec of node.specifiers) {
        if (
          spec.type === AST_NODE_TYPES.ImportSpecifier ||
          spec.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
          spec.type === AST_NODE_TYPES.ImportNamespaceSpecifier
        ) {
          if (spec.local.name === name) return true;
        }
      }
    }
  }
  return false;
}

function identifierUsedAsObjectOrArray(
  callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  name: string,
): boolean {
  const stack: TSESTree.Node[] = [callback.body];
  while (stack.length) {
    const node = stack.pop()!;

    if (node.type === AST_NODE_TYPES.MemberExpression) {
      let base: TSESTree.Expression = node.object as TSESTree.Expression;
      while (base.type === AST_NODE_TYPES.MemberExpression) {
        base = base.object as TSESTree.Expression;
      }
      if (base.type === AST_NODE_TYPES.Identifier && base.name === name) {
        return true; // object/array usage via property access
      }
    }

    if (node.type === AST_NODE_TYPES.ChainExpression) {
      const expr = node.expression as TSESTree.Expression;
      if (expr.type === AST_NODE_TYPES.MemberExpression) {
        let base: TSESTree.Expression = expr.object as TSESTree.Expression;
        while (base.type === AST_NODE_TYPES.MemberExpression) {
          base = base.object as TSESTree.Expression;
        }
        if (base.type === AST_NODE_TYPES.Identifier && base.name === name) {
          return true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.JSXSpreadAttribute) {
      if (
        node.argument.type === AST_NODE_TYPES.Identifier &&
        node.argument.name === name
      ) {
        return true;
      }
    }

    if (node.type === AST_NODE_TYPES.SpreadElement) {
      if (
        node.argument.type === AST_NODE_TYPES.Identifier &&
        node.argument.name === name
      ) {
        return true;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const key of Object.keys(node as any)) {
      if (key === 'parent') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) {
            stack.push(c as TSESTree.Node);
          }
        }
      } else if (typeof child === 'object' && 'type' in child) {
        stack.push(child as TSESTree.Node);
      }
    }
  }
  return false;
}

export const preferUseDeepCompareMemo = createRule<Options, MessageIds>({
  name: 'prefer-use-deep-compare-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays) that are not already memoized. This prevents unnecessary re-renders due to reference changes.',
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
      preferUseDeepCompareMemo:
        'Dependency array for "{{hook}}" includes objects/arrays that change identity each render, so React treats them as changed and reruns the memoized computation, triggering avoidable renders. Use useDeepCompareMemo (or memoize those dependencies first) so comparisons use deep equality and the memo stays stable.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;
    const memoizedIds = collectMemoizedIdentifiers(context);

    // Reporting is deferred to Program:exit because the import rewrite depends
    // on knowing every conversion in the file: the `useMemo` specifier may only
    // be unbound once no reference to it survives the fix, and a file where two
    // call sites convert in the same pass has no later pass to notice that.
    const calls: ConvertibleCall[] = [];

    /**
     * A suppressed report is discarded together with its fix, yet its
     * `useMemo(...)` call stays in the file. Counting such a call as converted
     * would unbind an import the surviving text still spells — trading an unused
     * import for a dangling reference, a lint warning for a compile error.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    return {
      CallExpression(node) {
        if (!isUseMemoCallee(node.callee)) return;
        if (node.arguments.length === 0) return;

        const callback = node.arguments[0];
        if (
          callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression
        ) {
          return;
        }

        // Ignore if JSX is present inside the memo callback
        if (containsJsx(callback)) return;

        // Get dependency array (last argument)
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        // Empty dependency arrays should be ignored
        if (depsArg.elements.length === 0) return;

        // Determine if any dependency is a non-primitive and not already memoized
        let hasUnmemoizedNonPrimitive = false;

        for (const el of depsArg.elements) {
          if (!el) continue; // holes
          if (el.type === AST_NODE_TYPES.SpreadElement) continue;

          const expr = el as TSESTree.Expression;

          // Syntactic classification for literals/arrays/objects/functions
          let isNonPrimitive = isNonPrimitiveWithoutTypes(expr);

          // Identifier-specific heuristic: consider non-primitive only if used as object or function in callback
          if (!isNonPrimitive && expr.type === AST_NODE_TYPES.Identifier) {
            // Imported identifiers are treated as stable
            if (isImportedIdentifier(context, expr.name)) {
              isNonPrimitive = false;
            } else if (
              identifierUsedAsObjectOrArray(callback, expr.name) &&
              !isIdentifierMemoizedAbove(expr.name, memoizedIds) &&
              // Reading a member off a name proves the receiver has members,
              // which every primitive also has: `slug.toUpperCase()` and
              // `cfg.a` are the same shape. The promotion therefore stands only
              // while the receiver is not provably a primitive — a bare
              // Identifier reaches this branch through no other signal, so the
              // veto can withhold nothing the rule established some other way
              // (#1979).
              !isProvablyPrimitiveDependency(context, node, callback, expr)
            ) {
              isNonPrimitive = true;
            }
          }

          if (!isNonPrimitive) continue;

          // If identifier and memoized above, skip
          if (
            expr.type === AST_NODE_TYPES.Identifier &&
            isIdentifierMemoizedAbove(expr.name, memoizedIds)
          ) {
            continue;
          }

          hasUnmemoizedNonPrimitive = true;
          break;
        }

        if (!hasUnmemoizedNonPrimitive) return;

        calls.push({ node, scope: ASTHelpers.getScope(context, node) });
      },
      'Program:exit'() {
        if (calls.length === 0) return;

        const hookImport = findDeepCompareMemoImport(
          context.getSourceCode().ast,
        );
        // Exactly the calls the carrier's fix rewrites: a suppressed report
        // loses its fix, and one whose scope binds the hook name to something
        // else must not be rewritten at all.
        const converted = calls.filter(
          (call) =>
            !isReportSuppressed(call.node) &&
            emitsResolvableHook(call, hookImport),
        );
        // The carrier is the first violation whose fix actually survives, so a
        // suppressed or unfixable leading violation cannot take the batch down
        // with it. Every other report emits without a fixer: the carrier's one
        // pass already resolves them, and a second fixer would either duplicate
        // its edits or contradict them.
        const [carrier] = converted;

        for (const call of calls) {
          context.report({
            node: call.node,
            messageId: 'preferUseDeepCompareMemo',
            data: {
              hook: 'useMemo',
            },
            fix:
              call === carrier
                ? (fixer) =>
                    convertCallsFixes(context, fixer, converted, printWidth)
                : null,
          });
        }
      },
    };
  },
});

export default preferUseDeepCompareMemo;
