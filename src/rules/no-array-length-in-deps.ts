import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createSuppressionChecker } from '../utils/disableDirectives';
import { encodesTypeMarker } from '../utils/hungarianNaming';
import {
  importInsertionAnchor,
  insertAtImportAnchor,
} from '../utils/importInsertion';

// React hooks to check
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

const REACT_MODULE = 'react';
const MEMO_HOOK_NAME = 'useMemo';

// Name of the rule
export type MessageIds = 'noArrayLengthInDeps';

type Options = [
  {
    hashImport?: {
      source?: string;
      importName?: string;
    };
    printWidth?: number;
  }?,
];

const DEFAULT_HASH_IMPORT = {
  source: 'functions/src/util/hash/stableHash',
  importName: 'stableHash',
};

/**
 * Matches Prettier's own default. The fixer authors a whole statement whose
 * length grows with the source — the base expression is emitted twice, and the
 * binding name is derived from it — so a line it leaves past this width is
 * rewritten on the next `prettier --write`, and fails `prettier --check` in the
 * meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isLengthMemberExpression(
  node: TSESTree.Expression,
): node is TSESTree.MemberExpression {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'length'
    );
  }
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isLengthMemberExpression(node.expression as TSESTree.Expression);
  }
  return false;
}

function getLengthMember(
  node: TSESTree.Expression,
): TSESTree.MemberExpression | null {
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    isLengthMemberExpression(node)
  ) {
    return node;
  }
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    const expr = node.expression as TSESTree.Expression;
    return getLengthMember(expr);
  }
  return null;
}

function getBaseExpression(
  member: TSESTree.MemberExpression,
): TSESTree.Expression {
  // For foo?.bar.length we want foo?.bar as base
  return member.object as TSESTree.Expression;
}

function getLastPropertyName(expr: TSESTree.Expression): string | null {
  let current: TSESTree.Expression = expr;
  while (current.type === AST_NODE_TYPES.ChainExpression) {
    current = current.expression as TSESTree.Expression;
  }
  if (current.type === AST_NODE_TYPES.Identifier) {
    return current.name;
  }
  if (current.type === AST_NODE_TYPES.MemberExpression) {
    if (
      !current.computed &&
      current.property.type === AST_NODE_TYPES.Identifier
    ) {
      return current.property.name;
    }
    // Fallback to walking further up the chain
    return getLastPropertyName(current.object as TSESTree.Expression);
  }
  return null;
}

/**
 * The name used when the base contributes nothing spellable. Free of any type
 * marker by construction, and the concept the memo actually stands for — the
 * hash of the dependency's CONTENT, which is what depending on `.length`
 * failed to track.
 */
const BASE_FREE_HASH_NAME = 'contentHash';

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Names for the memo binding, in descending order of how much of the base they
 * keep. `no-hungarian` ships as an error and is NOT fixable, so a name it
 * rejects turns this fixer's work into a manual rename in a file that was clean
 * beforehand (#1997) — every candidate is therefore checked against the same
 * predicate that rule applies, and the first acceptable one wins.
 *
 * Which candidate that is follows from what `no-hungarian` rejects:
 *
 * - `<base>Hash` reads as the domain concept for almost every base and is the
 *   preferred spelling.
 * - A single-letter `b`/`i` base makes `bHash`/`iHash` look like a Hungarian
 *   type prefix (b=boolean, i=integer) glued to a capital. `hashOf<Base>` says
 *   the same thing with the base out of the leading position.
 * - A base that IS a type word or its abbreviation (`obj`, `arr`, `str`,
 *   `array`, `number`, ...) taints every name that carries it as a segment, so
 *   no base-preserving candidate can succeed. Dropping the type-coded base is
 *   exactly the rename `no-hungarian` asks for.
 */
function baseDerivedNames(base: string): string[] {
  return [`${base}Hash`, `hashOf${capitalize(base)}`];
}

function generateUniqueName(base: string, taken: Set<string>): string {
  const candidate =
    baseDerivedNames(base).find((name) => !encodesTypeMarker(name)) ??
    BASE_FREE_HASH_NAME;
  if (!taken.has(candidate)) return candidate;
  // A numeric suffix disambiguates without reopening the naming question: it
  // adds no word boundary, so it cannot turn an accepted name into a marker.
  let i = 2;
  while (taken.has(`${candidate}${i}`)) {
    i++;
  }
  return `${candidate}${i}`;
}

function collectAllTakenNames(sourceCode: TSESLint.SourceCode): Set<string> {
  const names = new Set<string>();
  const scopeManager = sourceCode.scopeManager;
  const visit = (scope: any) => {
    if (!scope) return;
    for (const v of scope.variables) {
      names.add(v.name);
    }
    if (Array.isArray(scope.childScopes)) {
      for (const child of scope.childScopes) visit(child);
    }
  };
  visit(scopeManager?.globalScope);
  return names;
}

function findEnclosingFunction(node: TSESTree.Node): TSESTree.Node | null {
  let current: TSESTree.Node | null = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current;
    }
    current = current.parent as TSESTree.Node | null;
  }
  return null;
}

type InsertionPoint = {
  statement: TSESTree.Statement;
  block: TSESTree.BlockStatement;
};

/**
 * The memo declaration must land immediately before the statement containing
 * the hook call, inside the innermost enclosing block. Module scope is never
 * a valid target: useMemo is only legal inside a component/hook, and the
 * tracked array is typically function-local, so a top-level insertion would
 * reference an unbound variable and violate the rules of hooks.
 */
function findInsertionPoint(
  node: TSESTree.CallExpression,
): InsertionPoint | null {
  const enclosingFunction = findEnclosingFunction(node);
  if (!enclosingFunction) return null;
  let current: TSESTree.Node = node;
  while (current.parent) {
    // Reaching the function before any block means an expression-bodied
    // arrow: there is no statement position to hold the declaration.
    if (current === enclosingFunction) return null;
    const parent = current.parent as TSESTree.Node;
    if (parent.type === AST_NODE_TYPES.BlockStatement) {
      return { statement: current as TSESTree.Statement, block: parent };
    }
    current = parent;
  }
  return null;
}

/**
 * Whether an optional link sits at or below `expr` on its member/call spine,
 * making everything further right in the chain unreachable when that link is
 * nullish. `a?.b.run(x)` short-circuits at `a?.b`, so the optional flag the
 * check needs is not the outer call's own.
 */
function hasOptionalLink(expr: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = expr;
  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.MemberExpression:
        if (current.optional) return true;
        current = current.object;
        break;
      case AST_NODE_TYPES.CallExpression:
        if (current.optional) return true;
        current = current.callee;
        break;
      case AST_NODE_TYPES.ChainExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
        current = current.expression;
        break;
      default:
        return false;
    }
  }
  return false;
}

/**
 * Whether `child` sits in a position of `parent` that control flow may skip.
 * Positions evaluated regardless of the branch taken — an `if` test, a `&&`
 * left operand, a `switch` discriminant, a `do` body, an optional chain's
 * object spine — are excluded, since hoisting above them preserves evaluation.
 */
function isSkippableBranch(
  child: TSESTree.Node,
  parent: TSESTree.Node,
): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.ConditionalExpression:
      return parent.consequent === child || parent.alternate === child;
    case AST_NODE_TYPES.LogicalExpression:
      return parent.right === child;
    case AST_NODE_TYPES.SwitchStatement:
      return parent.discriminant !== child;
    // A case's test and body are both reached only once the switch selects it.
    case AST_NODE_TYPES.SwitchCase:
      return true;
    // A loop body may run zero times; a `do` body always runs once, so it is
    // not listed here.
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
      return parent.body === child;
    // Arguments and computed keys of an optional chain go unevaluated when the
    // chain short-circuits, so they guard their subtree exactly as an `if` does.
    case AST_NODE_TYPES.MemberExpression:
      return parent.object !== child && hasOptionalLink(parent);
    case AST_NODE_TYPES.CallExpression:
      return parent.callee !== child && hasOptionalLink(parent);
    default:
      return false;
  }
}

/**
 * Whether the climb from the hook call to the insertion statement escapes a
 * position that control flow may skip. A guard that wraps the hook without a
 * block of its own gives the climb no in-branch statement position, so the memo
 * lands above the guard while its dependency array `[<base>]` dereferences the
 * guarded value on every render — turning code that does not throw into code
 * that does. The dereference was safe only because of the surrounding
 * narrowing, which the hoisted position no longer enjoys, so the fix is
 * withheld and the report stands alone. A braced guard needs no bail: the
 * insertion block is then the guarded block itself.
 */
function crossesConditionalGuard(
  node: TSESTree.CallExpression,
  insertion: InsertionPoint,
): boolean {
  let current: TSESTree.Node = node;
  while (current !== insertion.statement) {
    const parent = current.parent as TSESTree.Node | undefined;
    // An insertion statement absent from the hook's ancestor chain contradicts
    // how it was derived; decline rather than guess at the geometry.
    if (!parent) return true;
    if (isSkippableBranch(current, parent)) return true;
    current = parent;
  }
  return false;
}

/**
 * Collects the identifiers a hoisted `stableHash(<base>)` expression would
 * read: the root object of the member chain plus any computed keys. Property
 * names are not variable references. Returns false for shapes that cannot be
 * hoisted verbatim (this-expressions, calls, casts) so the fixer bails.
 */
function collectBaseReferences(
  expr: TSESTree.Node,
  out: TSESTree.Identifier[],
): boolean {
  switch (expr.type) {
    case AST_NODE_TYPES.Identifier:
      out.push(expr);
      return true;
    case AST_NODE_TYPES.MemberExpression:
      if (!collectBaseReferences(expr.object, out)) return false;
      if (expr.computed) return collectBaseReferences(expr.property, out);
      return true;
    case AST_NODE_TYPES.ChainExpression:
      return collectBaseReferences(expr.expression, out);
    case AST_NODE_TYPES.TSNonNullExpression:
      return collectBaseReferences(expr.expression, out);
    case AST_NODE_TYPES.Literal:
      return true;
    default:
      return false;
  }
}

/**
 * A base is safe to memoize at the insertion point only when every variable
 * it reads is provably bound there: declared in a scope that encloses the
 * insertion block, and (for lexical declarations) positioned before the
 * consuming statement so the hoisted read cannot hit the temporal dead zone.
 * Unresolvable or ambient names are rejected — a report without a fix is
 * always preferable to generated code that references an unbound variable.
 */
function isBaseSafeToHoist(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  baseExpr: TSESTree.Expression,
  insertion: InsertionPoint,
): boolean {
  const identifiers: TSESTree.Identifier[] = [];
  if (!collectBaseReferences(baseExpr, identifiers)) return false;
  if (identifiers.length === 0) return false;

  for (const identifier of identifiers) {
    const scope = ASTHelpers.getScope(context, identifier);
    const variable = ASTHelpers.findVariableInScope(scope, identifier.name);
    if (!variable || variable.defs.length === 0) return false;

    // Visibility: the variable's scope must enclose the insertion block.
    // Because the insertion point shares the hook's scope chain, an enclosing
    // scope here guarantees the same binding resolves at both positions.
    const scopeBlock = variable.scope.block as TSESTree.Node;
    if (!rangeContains(scopeBlock, insertion.block)) return false;

    for (const def of variable.defs) {
      if (def.type === 'Parameter' || def.type === 'ImportBinding') continue;
      if (
        def.type === 'FunctionName' &&
        def.node.type === AST_NODE_TYPES.FunctionDeclaration
      ) {
        continue;
      }
      // Lexical declarations must precede the insertion point textually.
      if (def.name.range[1] > insertion.statement.range[0]) return false;
    }
  }
  return true;
}

/**
 * An `eslint-disable-next-line` comment directly above the hook statement
 * targets the hook, so the memo declaration must go above the comment —
 * inserting between them would silently re-point the suppression at the memo.
 */
function findDeclarationAnchor(
  sourceCode: TSESLint.SourceCode,
  statement: TSESTree.Statement,
): TSESTree.Statement | TSESTree.Comment {
  let anchor: TSESTree.Statement | TSESTree.Comment = statement;
  const comments = sourceCode.getCommentsBefore(statement);
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (
      comment.loc.end.line === anchor.loc.start.line - 1 &&
      /^\s*eslint-disable-next-line\b/.test(comment.value)
    ) {
      anchor = comment;
    } else {
      break;
    }
  }
  return anchor;
}

function getAnchorIndent(
  sourceCode: TSESLint.SourceCode,
  anchor: TSESTree.Statement | TSESTree.Comment,
): string {
  const line = sourceCode.lines[anchor.loc.start.line - 1] ?? '';
  const prefix = line.slice(0, anchor.loc.start.column);
  return /^\s*$/.test(prefix) ? prefix : '';
}

/**
 * Whether every line of `text` fits the print width once the first one is
 * offset by the column the insertion starts at. Continuation lines already
 * carry their own indentation, so only the first needs the offset.
 */
function fitsWidth(text: string, indent: string, printWidth: number): boolean {
  return text
    .split('\n')
    .every(
      (line, index) =>
        (index === 0 ? indent.length : 0) + line.length <= printWidth,
    );
}

/**
 * The memo declaration in the layout Prettier gives it, or null when no layout
 * this emitter can author fits.
 *
 * Measure, do not always-wrap: Prettier collapses a hand-broken
 * `useMemo(\n  () => stableHash(items),\n  [items],\n)` straight back onto one
 * line, so wrapping unconditionally would trade this overflow for its mirror
 * image on every short dependency. Two layouts are authored, verified against
 * the repo's own Prettier at widths 60/72/80/100/120 and indents 0-10:
 *
 * - the statement fits: keep it on one line;
 * - it does not: break the `useMemo` argument list, one argument per line with
 *   a trailing comma.
 *
 * Past that, Prettier's answer depends on which line overflowed — it breaks
 * after the `=`, or splits the arrow body, or opens the `stableHash(...)`
 * argument list, and those spellings compose. Rather than fall through to a
 * line `prettier --check` rejects, the fixer declines and lets the report stand
 * alone, exactly as it does for a base it cannot hoist. That region needs a
 * base expression of ~58 characters or more at a two-space indent, since both
 * gating lines are `indent + 21 + len(base)` columns wide.
 */
function buildMemoDeclaration(
  varName: string,
  hashName: string,
  baseText: string,
  indent: string,
  printWidth: number,
): string | null {
  const oneLine = `const ${varName} = ${MEMO_HOOK_NAME}(() => ${hashName}(${baseText}), [${baseText}]);`;
  if (fitsWidth(oneLine, indent, printWidth)) {
    return oneLine;
  }
  const broken = [
    `const ${varName} = ${MEMO_HOOK_NAME}(`,
    `  () => ${hashName}(${baseText}),`,
    `  [${baseText}],`,
    `);`,
  ].join(`\n${indent}`);
  return fitsWidth(broken, indent, printWidth) ? broken : null;
}

function ensureWeakMapEntry<K extends object, V>(
  map: WeakMap<K, V>,
  key: K,
  factory: () => V,
): V {
  const existing = map.get(key);
  if (existing) return existing;
  const next = factory();
  map.set(key, next);
  return next;
}

function getValueImports(
  sourceCode: TSESLint.SourceCode,
  source: string,
): TSESTree.ImportDeclaration[] {
  return sourceCode.ast.body.filter(
    (node): node is TSESTree.ImportDeclaration =>
      node.type === AST_NODE_TYPES.ImportDeclaration &&
      node.source.value === source &&
      node.importKind !== 'type',
  );
}

/**
 * The generated code calls the helper by its canonical name, so an aliased
 * specifier (`useMemo as um`) or a type-only specifier does not count — the
 * value binding under the exact local name must exist.
 */
function isNamedValueSpecifier(
  specifier: TSESTree.Node,
  name: string,
): specifier is TSESTree.ImportSpecifier {
  return (
    specifier.type === AST_NODE_TYPES.ImportSpecifier &&
    specifier.importKind !== 'type' &&
    specifier.imported.type === AST_NODE_TYPES.Identifier &&
    specifier.imported.name === name &&
    specifier.local.name === name
  );
}

/**
 * Import presence is read off the AST at fix time rather than from a traversal
 * flag: a hook call that precedes the import declaration in source order would
 * otherwise be judged against a flag the `ImportDeclaration` visitor has not
 * set yet, duplicating the import.
 */
function hasNamedValueImport(
  sourceCode: TSESLint.SourceCode,
  source: string,
  name: string,
): boolean {
  for (const declaration of getValueImports(sourceCode, source)) {
    for (const spec of declaration.specifiers) {
      if (isNamedValueSpecifier(spec, name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether every declaration of a visible binding is the value import this fix
 * intends to add. A local const/function/class, a parameter, a namespace or
 * default import, an alias, or a named import from any other module all mean
 * the emitted `useMemo(() => stableHash(...))` would resolve somewhere other
 * than the helper — so the binding cannot be reused.
 */
function bindsIntendedImport(
  variable: TSESLint.Scope.Variable,
  name: string,
  source: string,
): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every((def) => {
      const specifier = def.node as TSESTree.Node;
      if (!isNamedValueSpecifier(specifier, name)) {
        return false;
      }
      const declaration = specifier.parent;
      return (
        declaration?.type === AST_NODE_TYPES.ImportDeclaration &&
        declaration.importKind !== 'type' &&
        declaration.source.value === source
      );
    })
  );
}

/**
 * Extends an existing import from `source` with `name` instead of prepending
 * a duplicate declaration. Namespace-only imports cannot host a named
 * specifier, so those fall through to a separate declaration (null).
 */
function buildImportExtensionFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  source: string,
  name: string,
): TSESLint.RuleFix | null {
  for (const declaration of getValueImports(sourceCode, source)) {
    const named = declaration.specifiers.filter(
      (spec): spec is TSESTree.ImportSpecifier =>
        spec.type === AST_NODE_TYPES.ImportSpecifier,
    );
    if (named.length > 0) {
      return fixer.insertTextAfter(named[named.length - 1], `, ${name}`);
    }
    const defaultSpec = declaration.specifiers.find(
      (spec) => spec.type === AST_NODE_TYPES.ImportDefaultSpecifier,
    );
    if (defaultSpec) {
      return fixer.insertTextAfter(defaultSpec, `, { ${name} }`);
    }
  }
  return null;
}

/**
 * Hook callback = first function-typed argument (the effect/factory/memo fn).
 * Deps array is the LAST argument; the callback precedes it.
 */
function getHookCallback(
  node: TSESTree.CallExpression,
): TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | null {
  for (const arg of node.arguments) {
    if (
      arg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      arg.type === AST_NODE_TYPES.FunctionExpression
    ) {
      return arg;
    }
  }
  return null;
}

function rangeContains(outer: TSESTree.Node, inner: TSESTree.Node): boolean {
  return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
}

/**
 * True when `identifier` is the object of a non-computed `.length` access,
 * i.e. the reference reads only the array's length, not its contents.
 */
function isLengthAccessOf(
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): boolean {
  const parent = identifier.parent as TSESTree.Node | undefined;
  return (
    !!parent &&
    parent.type === AST_NODE_TYPES.MemberExpression &&
    !parent.computed &&
    parent.object === (identifier as TSESTree.Expression) &&
    parent.property.type === AST_NODE_TYPES.Identifier &&
    parent.property.name === 'length'
  );
}

/**
 * Decide whether a `<array>.length` dependency is safe to keep (suppress the
 * report) by inspecting how the hook callback body uses the array binding.
 *
 * Safe (suppress) only when the array is referenced at least once inside the
 * callback body AND every such reference is the object of a `.length` access —
 * then depending on `.length` correctly avoids reruns on content changes.
 *
 * Returns false (keep reporting) for any non-`.length` use (element access,
 * spread, iteration/method calls, bare reference, passed as an argument), when
 * the array is never referenced in the body, and whenever the base cannot be
 * confidently resolved (complex member-chain bases) — never hide a real bug.
 */
function isLengthOnlyUsage(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  callback: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  baseExpr: TSESTree.Expression,
): boolean {
  // Only resolvable for a bare identifier base (e.g. `items` in `items.length`).
  // Member-chain bases (`a.b`, `data?.items`) have no single binding to track.
  if (baseExpr.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }

  // Resolve the binding the DEP refers to (from the deps-array identifier's
  // scope), so a binding shadowed inside the callback body is not mistaken for
  // it — the outer binding then has zero body references and we keep reporting.
  const scope = ASTHelpers.getScope(context, baseExpr);
  const variable = ASTHelpers.findVariableInScope(scope, baseExpr.name);
  if (!variable) {
    return false;
  }

  const bodyReferences = variable.references.filter((ref) =>
    rangeContains(callback.body as TSESTree.Node, ref.identifier),
  );

  // No body usage → not the content-vs-length bug, but keep current behavior.
  if (bodyReferences.length === 0) {
    return false;
  }

  return bodyReferences.every((ref) => isLengthAccessOf(ref.identifier));
}

export const noArrayLengthInDeps = createRule<Options, MessageIds>({
  name: 'no-array-length-in-deps',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Detects array.length entries in React hook dependency arrays because length ignores content changes; auto-fixes by memoizing stableHash(array) with useMemo and depending on the hash instead.',
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
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noArrayLengthInDeps:
        'Dependency array includes length-based entries ({{dependencies}}). Array length only changes when items are added or removed, so hooks miss updates when array contents change at the same size. Memoize a stableHash of each array with useMemo and depend on that hash so the hook reruns when contents change.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options = {}] = context.options;
    const { hashImport } = options;
    const hashImportConfig = {
      source: hashImport?.source ?? DEFAULT_HASH_IMPORT.source,
      importName: hashImport?.importName ?? DEFAULT_HASH_IMPORT.importName,
    };
    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    // Track planned file-wide changes to avoid overlapping fixers. Bases are
    // deduplicated per insertion block: a memo declared in one block is not
    // visible in a sibling block, so sharing across a whole function would
    // strand references.
    let importsPlanned = false;
    const perBlockDeclaredBases = new WeakMap<
      TSESTree.BlockStatement,
      Set<string>
    >();
    const perBlockBaseToVar = new WeakMap<
      TSESTree.BlockStatement,
      Map<string, string>
    >();

    /**
     * `useMemo` and the hash helper are imported by a single violation's fix,
     * making that violation the file's import carrier. ESLint builds fixes
     * before it applies inline disable directives, so a suppressed carrier
     * takes both imports down with it while the surviving violations still
     * emit `useMemo(() => stableHash(...))` — two unbound identifiers that no
     * number of `--fix` passes can repair.
     */
    const isReportSuppressed = createSuppressionChecker(context);

    return {
      CallExpression(node) {
        if (!isHookCall(node)) return;
        if (node.arguments.length < 2) return;
        const depsArg = node.arguments[node.arguments.length - 1];
        if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) return;

        // Collect .length deps
        const lengthDeps: {
          element: TSESTree.Expression;
          member: TSESTree.MemberExpression;
        }[] = [];
        const callback = getHookCallback(node);
        for (const el of depsArg.elements) {
          if (!el) continue;
          if (el.type === AST_NODE_TYPES.SpreadElement) continue;
          const member = getLengthMember(el as TSESTree.Expression);
          if (!member) continue;
          // Suppress when the callback body reads only `<array>.length`, never
          // the array's contents — then `.length` is the correct dependency.
          if (
            callback &&
            isLengthOnlyUsage(context, callback, getBaseExpression(member))
          ) {
            continue;
          }
          lengthDeps.push({ element: el as TSESTree.Expression, member });
        }

        if (lengthDeps.length === 0) return;

        const sourceCode = context.getSourceCode();
        const dependencies = lengthDeps
          .map(({ element }) => sourceCode.getText(element))
          .join(', ');

        // Report once on the dependency array. The report is emitted even when
        // suppressed: ESLint discards it, and reporting keeps the user's
        // disable directive "used" so `--report-unused-disable-directives`
        // does not flag it.
        context.report({
          node: depsArg,
          messageId: 'noArrayLengthInDeps',
          data: {
            dependencies,
          },
          fix(fixer) {
            // A suppressed report is dropped together with its fix. Declining
            // to fix — and leaving the imports and the per-block declarations
            // unclaimed — passes the carrier slot to the first violation that
            // actually survives. Checked against the reported node so the
            // resolution matches ESLint's own, and before every other bail so
            // no shared state is touched.
            if (isReportSuppressed(depsArg)) {
              return null;
            }

            // All bail checks precede any shared-state mutation so a skipped
            // fix cannot make a later fix believe imports or declarations are
            // already handled.

            // The generated declaration spells both helper names bare and
            // imports both, so a binding of either name breaks the edit two
            // ways: the inserted import collides with a declaration of that
            // name (TS2440, or TS2300 when the binding is itself an import),
            // and a shadowing parameter or block-scoped binding captures the
            // emitted call with no compile error at all. Resolving through the
            // scope chain at the hook call catches both, since the insertion
            // point shares that scope. Because the emitted code needs BOTH
            // names, a clash on either withholds the whole edit — a partial
            // one would still be broken. The report stands so the author
            // resolves the clash deliberately.
            const scope = ASTHelpers.getScope(context, node);
            const collides = [
              { name: MEMO_HOOK_NAME, source: REACT_MODULE },
              {
                name: hashImportConfig.importName,
                source: hashImportConfig.source,
              },
            ].some(({ name, source }) => {
              const existing = ASTHelpers.findVariableInScope(scope, name);
              return !!existing && !bindsIntendedImport(existing, name, source);
            });
            if (collides) return null;

            const insertion = findInsertionPoint(node);
            if (!insertion) return null;
            if (crossesConditionalGuard(node, insertion)) return null;
            for (const { member } of lengthDeps) {
              if (
                !isBaseSafeToHoist(
                  context,
                  getBaseExpression(member),
                  insertion,
                )
              ) {
                return null;
              }
            }

            const fixes: TSESLint.RuleFix[] = [];
            const declaredBases = ensureWeakMapEntry(
              perBlockDeclaredBases,
              insertion.block,
              () => new Set<string>(),
            );
            const baseToVar = ensureWeakMapEntry(
              perBlockBaseToVar,
              insertion.block,
              () => new Map<string, string>(),
            );

            // Prepare variable names (consistent across file) and taken names (across all scopes)
            const allTaken = collectAllTakenNames(sourceCode);
            for (const name of baseToVar.values()) {
              allTaken.add(name);
            }

            // Names are resolved into a local map first. A declaration with no
            // layout inside the print width withholds the whole edit, and a
            // name already committed to the block's map would then stay
            // reserved for a declaration that never got emitted.
            const plannedNames = new Map<string, string>();
            const nameFor = (baseText: string) =>
              baseToVar.get(baseText) ?? plannedNames.get(baseText);
            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (!nameFor(baseText)) {
                const lastPropName = getLastPropertyName(baseExpr) || 'array';
                const varName = generateUniqueName(lastPropName, allTaken);
                plannedNames.set(baseText, varName);
                allTaken.add(varName);
              }
            }

            // Build declaration lines (one per base) that land immediately
            // before the statement consuming the hook, inside the same block
            // as the tracked variable.
            const anchor = findDeclarationAnchor(
              sourceCode,
              insertion.statement,
            );
            const indent = getAnchorIndent(sourceCode, anchor);
            const pendingBases: string[] = [];
            let declText = '';
            for (const { member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              if (
                declaredBases.has(baseText) ||
                pendingBases.includes(baseText)
              )
                continue;
              const declaration = buildMemoDeclaration(
                nameFor(baseText)!,
                hashImportConfig.importName,
                baseText,
                indent,
                printWidth,
              );
              if (declaration === null) return null;
              declText += `${declaration}\n${indent}`;
              pendingBases.push(baseText);
            }

            for (const [baseText, varName] of plannedNames) {
              baseToVar.set(baseText, varName);
            }
            for (const baseText of pendingBases) {
              declaredBases.add(baseText);
            }
            if (declText) {
              fixes.push(fixer.insertTextBeforeRange(anchor.range, declText));
            }

            if (!importsPlanned) {
              const newImportLines: string[] = [];
              if (
                !hasNamedValueImport(sourceCode, REACT_MODULE, MEMO_HOOK_NAME)
              ) {
                const extension = buildImportExtensionFix(
                  fixer,
                  sourceCode,
                  REACT_MODULE,
                  MEMO_HOOK_NAME,
                );
                if (extension) fixes.push(extension);
                else {
                  newImportLines.push(
                    `import { ${MEMO_HOOK_NAME} } from '${REACT_MODULE}';`,
                  );
                }
              }
              if (
                !hasNamedValueImport(
                  sourceCode,
                  hashImportConfig.source,
                  hashImportConfig.importName,
                )
              ) {
                const extension = buildImportExtensionFix(
                  fixer,
                  sourceCode,
                  hashImportConfig.source,
                  hashImportConfig.importName,
                );
                if (extension) fixes.push(extension);
                else {
                  newImportLines.push(
                    `import { ${hashImportConfig.importName} } from '${hashImportConfig.source}';`,
                  );
                }
              }
              if (newImportLines.length > 0) {
                const importText = `${newImportLines.join('\n')}\n`;
                const firstImport = sourceCode.ast.body.find(
                  (n) => n.type === AST_NODE_TYPES.ImportDeclaration,
                );
                if (firstImport) {
                  fixes.push(fixer.insertTextBefore(firstImport, importText));
                } else {
                  // A file's first import may cross only the whitespace the
                  // source opens with. The shared anchor is the floor of that
                  // climb: text spliced above a `#!` shebang leaves the file
                  // unparseable, and text above a `'use client'` directive or
                  // a header comment strips the prologue of the meaning it
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
              }
              importsPlanned = true;
            }

            // Replace each .length dep with the corresponding var name
            for (const { element, member } of lengthDeps) {
              const baseExpr = getBaseExpression(member);
              const baseText = sourceCode.getText(baseExpr);
              const varName = baseToVar.get(baseText)!;
              fixes.push(fixer.replaceText(element, varName));
            }

            return fixes;
          },
        });
      },
    };
  },
});
