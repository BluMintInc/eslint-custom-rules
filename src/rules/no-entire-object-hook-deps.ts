import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import {
  SymbolFlags,
  TypeFlags,
  isArrayTypeNode,
  isTupleTypeNode,
} from 'typescript';
import type { TypeChecker, Node } from 'typescript';

type MessageIds = 'avoidEntireObject' | 'removeUnusedDependency';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

/**
 * Hooks that run for their side effects rather than producing a value. An
 * unread dependency means something different here than in useMemo/useCallback
 * — see `callsCorrespondingSetter`.
 */
const EFFECT_HOOK_NAMES = new Set(['useEffect']);

/**
 * Hooks that do not run their callback: they hand it back as a value, so the
 * body executes only if — and when — the consumer invokes it.
 *
 * why: the dependency array is evaluated on every render, while such a body may
 * never run at all, or run only once the data it reads has arrived. A path the
 * body dereferences is therefore not licensed to appear in the array; see
 * `collectGuardedPaths`.
 */
const DEFERRED_BODY_HOOK_NAMES = new Set(['useCallback']);

/**
 * A string key quoted the way a formatter quotes it.
 *
 * `JSON.stringify` always emits double quotes, while this repo and agora both
 * format with `singleQuote`. A formatter also picks whichever quote needs FEWER
 * escapes, so a key carrying an apostrophe stays double-quoted even then.
 * Emitting the other spelling is text the formatter rewrites on its next run,
 * and agora runs the formatter and `--fix` over the same tree — so that is a
 * diff which never settles (#2118).
 */
function quoteKey(value: string): string {
  const singles = (value.match(/'/g) ?? []).length;
  const doubles = (value.match(/"/g) ?? []).length;
  const json = JSON.stringify(value);
  if (singles > doubles) {
    return json;
  }
  // `JSON.stringify` has already escaped the control characters and
  // backslashes; only the quote character itself has to change hands.
  const body = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${body}'`;
}

function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name)
  );
}

function isEffectHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    EFFECT_HOOK_NAMES.has(callee.name)
  );
}

function isDeferredBodyHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === AST_NODE_TYPES.Identifier &&
    DEFERRED_BODY_HOOK_NAMES.has(callee.name)
  );
}

/**
 * The rule whose suppression marks a dependency array as hand-maintained.
 */
const EXHAUSTIVE_DEPS_RULE = 'react-hooks/exhaustive-deps';

/**
 * Matches the keyword of an `eslint-disable`, `eslint-disable-next-line` or
 * `eslint-disable-line` directive, leaving the rule list as the remainder. The
 * lookahead keeps `eslint-disabled-something` (and prose that merely opens with
 * the same letters) from parsing as a directive.
 */
const DISABLE_DIRECTIVE = /^\s*eslint-disable(-next-line|-line)?(?![\w-])/u;

/**
 * ESLint splits a directive's rule list from its ` -- justification` suffix on
 * this separator, so the rule list must be read the same way.
 */
const JUSTIFICATION_SEPARATOR = /\s-{2,}\s/u;

/**
 * The line an exhaustive-deps disable comment covers, `'file'` for the
 * whole-file form, or null when the comment is not such a directive.
 *
 * why: `eslint-disable-next-line` covers the line after the comment ends, while
 * `eslint-disable-line` covers the comment's own line. Only the block form of
 * the bare `eslint-disable` is a file-level directive to ESLint, so a line
 * comment starting with it is not treated as one here either. The file form
 * counts for the whole file rather than from its own position onward: erring
 * toward exempting a hook keeps a hand-managed array intact, which is the safe
 * direction for a deleting fixer.
 */
function readExhaustiveDepsDisable(
  comment: TSESTree.Comment,
): 'file' | number | null {
  const [directive] = comment.value.split(JUSTIFICATION_SEPARATOR);
  const match = DISABLE_DIRECTIVE.exec(directive);
  if (!match) {
    return null;
  }

  // why: a bare directive with no rule list says nothing about dependency
  // management, so only an explicit mention of exhaustive-deps counts.
  const namesExhaustiveDeps = directive
    .slice(match[0].length)
    .split(',')
    .some((ruleId) => ruleId.trim() === EXHAUSTIVE_DEPS_RULE);
  if (!namesExhaustiveDeps) {
    return null;
  }

  const scope = match[1];
  if (scope === '-next-line') {
    return comment.loc.end.line + 1;
  }
  if (scope === '-line') {
    return comment.loc.start.line;
  }
  return comment.type === AST_TOKEN_TYPES.Block ? 'file' : null;
}

/** `channelGroupActive` -> `setChannelGroupActive`, `a` -> `setA`. */
function toSetterName(dependencyName: string): string {
  return `set${dependencyName.charAt(0).toUpperCase()}${dependencyName.slice(
    1,
  )}`;
}

function isArrayOrPrimitive(
  checker: TypeChecker,
  esTreeNode: TSESTree.Node,
  nodeMap: { get(node: TSESTree.Node): Node | undefined },
): boolean {
  try {
    const tsNode = nodeMap.get(esTreeNode);
    if (!tsNode) return false;

    const type = checker.getTypeAtLocation(tsNode);

    // Check if it's a primitive type
    if (
      type.flags &
      (TypeFlags.String |
        TypeFlags.StringLike |
        TypeFlags.StringLiteral |
        TypeFlags.Number |
        TypeFlags.Boolean |
        TypeFlags.Null |
        TypeFlags.Undefined |
        TypeFlags.Void |
        TypeFlags.Never |
        TypeFlags.BigInt |
        TypeFlags.ESSymbol)
    ) {
      return true;
    }

    // Check if it's an array type
    const typeNode = checker.typeToTypeNode(type, undefined, undefined);
    if (
      type.symbol?.name === 'Array' ||
      type.symbol?.escapedName === 'Array' ||
      (typeNode && (isArrayTypeNode(typeNode) || isTupleTypeNode(typeNode)))
    ) {
      return true;
    }

    // Check if it's a string type with methods (like String object)
    if (
      type.symbol?.name === 'String' ||
      type.symbol?.escapedName === 'String'
    ) {
      return true;
    }

    // Be more conservative - if we can't determine the type clearly, assume it's an object
    // This prevents false positives where complex objects are incorrectly identified as primitives
    if (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
      return false; // Treat Any/Unknown as potential objects
    }

    // If it's not a primitive or array, and has properties, it's an object
    return false;
  } catch (error) {
    // If there's any error in type checking, assume it's an object to be safe
    return false;
  }
}

/**
 * The type-checker handles `getObjectUsagesInHook` needs. Absent when the
 * consumer has no `parserOptions.project`, in which case every decision falls
 * back to the syntactic heuristics below.
 */
type TypeInfo = {
  checker: TypeChecker;
  nodeMap: { get(node: TSESTree.Node): Node | undefined };
};

/**
 * Whether a member access reads a method — a function declared as a member of
 * a class or interface, which lives on the prototype.
 *
 * why: such a reference is one shared value across every instance of the type
 * (`new Set().has === new Set().has`, `f1.call === f2.call`). Narrowing a
 * dependency from `set` to `set.has` therefore pins a constant: the hook never
 * invalidates again and serves a stale value forever, so the whole object has
 * to stay the dependency. This is the checker-driven generalisation of the
 * `ARRAY_METHODS`/`STRING_METHODS` name lists, which recognise the identical
 * hazard for two built-ins only; `Map`, `Set`, `Promise`, `Date`, `Intl.*` and
 * every user-defined class come for free.
 *
 * The discriminator is how the member is *declared*, not merely "the type is
 * callable". A function-valued data property (`{ getName?: () => string }`, or
 * a class field holding an arrow function) is per-instance state: it genuinely
 * changes when the object carrying it is rebuilt, so narrowing to it is correct
 * and stays allowed.
 *
 * The question is asked of the symbol's flags rather than its declarations'
 * `SyntaxKind`, because a rule must survive a version skew between the
 * TypeScript this package resolves and the one the consumer's parser built the
 * program with. `SyntaxKind` is renumbered whenever a kind is inserted —
 * `MethodSignature` is 170 under 5.0 and 174 under 5.9 — so a `ts.isMethodX`
 * guard imported here silently answers `false` for every node of a consumer on
 * a different minor, making the carve-out a no-op in exactly the place it
 * matters. `SymbolFlags` is an append-only bit set (`Method` has been 8192
 * throughout), so the flag test holds across versions.
 */
function isMethodMember(
  checker: TypeChecker,
  esTreeNode: TSESTree.Node,
  nodeMap: { get(node: TSESTree.Node): Node | undefined },
): boolean {
  try {
    const tsNode = nodeMap.get(esTreeNode);
    if (!tsNode) return false;

    // why: an unresolved member (an `any` receiver, a missing type) yields no
    // symbol, so the check stays inert rather than guessing — matching the
    // conservative stance `isArrayOrPrimitive` takes on Any/Unknown.
    const symbol = checker.getSymbolAtLocation(tsNode);
    if (!symbol) return false;

    return (symbol.flags & SymbolFlags.Method) !== 0;
  } catch (error) {
    // A type-checker failure must not change what the rule reports.
    return false;
  }
}

type PathSegment = {
  /** Rendered link text: an identifier name (`foo`) or bracket key (`[0]`, `['key']`). */
  text: string;
  computed: boolean;
  /** Whether this link is accessed via optional chaining (`?.`). */
  optional: boolean;
};

function renderPathSegments(
  baseName: string,
  segments: readonly PathSegment[],
): string {
  let path = baseName;
  for (const segment of segments) {
    if (segment.computed) {
      // why: an optional computed access must render as `?.[` — a bare `?`
      // before `[` parses as a conditional expression, so `state?[0]` is a
      // syntax error while `state?.[0]` is the valid optional element access.
      path += segment.optional ? `?.${segment.text}` : segment.text;
    } else {
      path += segment.optional ? `?.${segment.text}` : `.${segment.text}`;
    }
  }
  return path;
}

function unwrapExpression(expr: TSESTree.Node): TSESTree.Node {
  let current = expr;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression;
  }
  return current;
}

/** Applies `visitChild` to every AST child of `node`, skipping `parent` links. */
function forEachChildNode(
  node: TSESTree.Node,
  visitChild: (child: TSESTree.Node) => void,
): void {
  for (const key in node) {
    if (key === 'parent') continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child = (node as any)[key];
    if (!child || typeof child !== 'object') continue;

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          visitChild(item);
        }
      }
    } else if ('type' in child) {
      visitChild(child);
    }
  }
}

/**
 * Whether `node` is the callee of a call — `u.date.toISOString` in
 * `u.date.toISOString()` — looking through the wrappers that can sit between
 * the member expression and its call (`?.` chains, `!`, `as T`).
 */
function isCallCallee(node: TSESTree.MemberExpression): boolean {
  let current: TSESTree.Node = node;
  let parent = node.parent;
  while (
    parent &&
    (parent.type === AST_NODE_TYPES.TSAsExpression ||
      parent.type === AST_NODE_TYPES.TSTypeAssertion ||
      parent.type === AST_NODE_TYPES.ChainExpression ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression)
  ) {
    current = parent;
    parent = parent.parent;
  }
  return (
    !!parent &&
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.callee === current
  );
}

/**
 * The links of `node`'s access path when the chain is rooted at `objectName`,
 * or null when it is rooted elsewhere or holds a link with no stable rendering.
 *
 * why: guard collection asks a different question than `buildAccessPath` —
 * "which value did this condition establish something about?" rather than
 * "which dependency should replace the object?" — so it must not apply that
 * function's narrowing policy (method carve-outs, whole-object escalation) nor
 * its side effects on the usage set.
 */
function memberPathSegmentsIfRootedAt(
  node: TSESTree.MemberExpression,
  objectName: string,
): PathSegment[] | null {
  const segments: PathSegment[] = [];
  let current: TSESTree.Node = node;

  while (current.type === AST_NODE_TYPES.MemberExpression) {
    const memberExpr = current;

    if (memberExpr.computed) {
      const literalValue =
        memberExpr.property.type === AST_NODE_TYPES.Literal
          ? memberExpr.property.value
          : undefined;
      if (
        typeof literalValue !== 'number' &&
        typeof literalValue !== 'string'
      ) {
        return null;
      }
      segments.unshift({
        text:
          typeof literalValue === 'number'
            ? `[${literalValue}]`
            : `[${quoteKey(literalValue)}]`,
        computed: true,
        optional: memberExpr.optional,
      });
    } else {
      if (memberExpr.property.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }
      segments.unshift({
        text: memberExpr.property.name,
        computed: false,
        optional: memberExpr.optional,
      });
    }

    current = unwrapExpression(memberExpr.object);
  }

  const base = unwrapExpression(current);
  if (
    segments.length === 0 ||
    base.type !== AST_NODE_TYPES.Identifier ||
    base.name !== objectName
  ) {
    return null;
  }
  return segments;
}

function renderMemberPathIfRootedAt(
  node: TSESTree.MemberExpression,
  objectName: string,
): string | null {
  const segments = memberPathSegmentsIfRootedAt(node, objectName);
  return segments ? renderPathSegments(objectName, segments) : null;
}

/**
 * How many links of `segments` a dependency array may evaluate on a render that
 * never reaches the position the path was read in.
 *
 * why: the array already dereferences the dependency object, so its first link
 * is as safe as the entry it replaces. Every further link dereferences a value
 * whose existence only the skipped position established, unless it is spelled
 * `?.` — an optional link short-circuits instead of throwing and so extends the
 * prefix.
 */
function eagerlyReachableLength(segments: readonly PathSegment[]): number {
  let length = 1;
  while (length < segments.length && segments[length].optional) {
    length += 1;
  }
  return length;
}

/**
 * Every path of `objectName` whose dereferenceability the hook body establishes
 * with a guard rather than with the plain shape of the source.
 *
 * why: a dependency array is an array literal, so every element is evaluated
 * eagerly on every render — outside the `if`, the `&&`, the ternary and the
 * `!` assertion that made the access safe inside the body. Extending a
 * dependency path *through* such a link therefore turns guarded code into an
 * unconditional `TypeError`. The paths collected here mark where a path must
 * stop; see `safePrefixOf`.
 *
 * A condition is not the only licence a body can hold. A `try`/`catch` swallows
 * the very `TypeError` a deep dereference raises, and a body that runs later —
 * an inner callback, the function a `useCallback` hands back — may not run at
 * all on the render whose array is being evaluated. Neither licence travels
 * into the array, so both stop a path exactly as a condition does.
 *
 * The collection is deliberately over-broad — it accepts any member path
 * appearing anywhere in a condition, not only one that provably governs the
 * access. Over-collecting costs a coarser dependency (the memo recomputes more
 * often than strictly needed); under-collecting is the crash.
 *
 * `bodyIsDeferred` says the hook itself never runs the body it was handed.
 */
function collectGuardedPaths(
  hookBody: TSESTree.Node,
  objectName: string,
  bodyIsDeferred: boolean,
): Set<string> {
  const guarded = new Set<string>();
  const visited = new Set<TSESTree.Node>();
  const deferredVisited = new Set<TSESTree.Node>();

  function markConditionPaths(node: TSESTree.Node | null | undefined): void {
    if (!node) return;

    if (node.type === AST_NODE_TYPES.MemberExpression) {
      const path = renderMemberPathIfRootedAt(node, objectName);
      if (path) {
        guarded.add(path);
        // why: only the outermost link of the chain is what the condition
        // established. `if (a.b.c)` dereferences `a.b` unconditionally, so it
        // proves nothing about `a.b` and must not truncate paths there. A
        // computed key can still hold a condition-worthy read of its own.
        if (node.computed) {
          markConditionPaths(node.property);
        }
        return;
      }
    }

    forEachChildNode(node, markConditionPaths);
  }

  /**
   * Records where every path read inside a position the array cannot reach —
   * a protected `try` block, a body that runs later — has to stop.
   *
   * Unlike a condition, such a position licenses the whole dereference chain
   * rather than one link of it, so the stopping point is derived from the path
   * itself: everything the array can evaluate on its own is kept, and the first
   * link that would have to trust the skipped code ends it.
   */
  function markDeferredPaths(node: TSESTree.Node | null | undefined): void {
    if (!node || deferredVisited.has(node)) return;
    deferredVisited.add(node);

    if (node.type === AST_NODE_TYPES.MemberExpression) {
      const segments = memberPathSegmentsIfRootedAt(node, objectName);
      if (segments) {
        const reachable = eagerlyReachableLength(segments);
        if (reachable < segments.length) {
          guarded.add(
            renderPathSegments(objectName, segments.slice(0, reachable)),
          );
        }
        // A computed key can still hold a read of its own.
        if (node.computed) {
          markDeferredPaths(node.property);
        }
        return;
      }
    }

    forEachChildNode(node, markDeferredPaths);
  }

  function walk(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    if (
      node.type === AST_NODE_TYPES.IfStatement ||
      node.type === AST_NODE_TYPES.ConditionalExpression ||
      node.type === AST_NODE_TYPES.WhileStatement ||
      node.type === AST_NODE_TYPES.DoWhileStatement ||
      node.type === AST_NODE_TYPES.ForStatement
    ) {
      // Covers `if (a.b)`, `a.b ? x : y`, and the early-return form
      // `if (!a.b) return;` — the `!` is reached by walking the test.
      markConditionPaths(node.test);
    } else if (node.type === AST_NODE_TYPES.LogicalExpression) {
      // `a.b && a.b.c`, `a.b || fallback`, `a.b ?? fallback`: the left operand
      // decides whether the right one runs at all.
      markConditionPaths(node.left);
    } else if (node.type === AST_NODE_TYPES.UnaryExpression) {
      if (node.operator === '!' || node.operator === 'typeof') {
        markConditionPaths(node.argument);
      }
    } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
      if (node.operator === 'instanceof') {
        markConditionPaths(node.left);
      } else if (node.operator === 'in') {
        markConditionPaths(node.right);
      }
    } else if (node.type === AST_NODE_TYPES.TSNonNullExpression) {
      // `a.b!.c` — the assertion is the author's guard, and it exists only in
      // the type system. The emitted dependency has to stop at `a.b`.
      //
      // Unlike a condition, an assertion speaks about exactly one value, so
      // this does NOT descend: in `load(a.b)!` the `!` covers the call's
      // result and says nothing about `a.b`.
      const asserted = unwrapExpression(node.expression);
      if (asserted.type === AST_NODE_TYPES.MemberExpression) {
        markConditionPaths(asserted);
      }
    } else if (node.type === AST_NODE_TYPES.TryStatement) {
      // A `catch` is a licence to dereference: the author writes the deep
      // access knowing the TypeError it can raise is swallowed. The array
      // evaluates the same access outside the `try`, where the throw is
      // uncaught, so the path stops before the link the `catch` covers.
      //
      // The handler is what makes the difference: a `try`/`finally` with no
      // handler re-raises, so its block reads like ordinary code. The handler's
      // own body is deferred instead — it runs only if something threw.
      if (node.handler) {
        markDeferredPaths(node.block);
        markDeferredPaths(node.handler.body);
      }
    } else if (
      node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionDeclaration
    ) {
      // An inner callback runs on someone else's schedule — an event, a
      // resolved promise, an iteration over an array that may be empty — so a
      // path it reads says nothing about the render evaluating the array.
      markDeferredPaths(node.body);
    }

    forEachChildNode(node, walk);
  }

  if (bodyIsDeferred) {
    markDeferredPaths(hookBody);
  }
  walk(hookBody);
  return guarded;
}

/**
 * Whether the hook body anywhere calls the state setter that corresponds to
 * `dependencyName` (dep `count` -> `setCount(...)`).
 *
 * why: for an effect, an unread dependency is React's reset-on-scope-change
 * idiom — a deliberate re-run trigger. The one shape where an unread dependency
 * is genuinely wrong is the circular dependency, where the effect writes the
 * very value it depends on and so re-triggers itself. The setter call is that
 * signature. It can sit arbitrarily deep (inside an inner async function, a
 * `startTransition` callback, a `.then()`), so the whole body is searched.
 */
function callsCorrespondingSetter(
  hookBody: TSESTree.Node,
  dependencyName: string,
): boolean {
  const setterName = toSetterName(dependencyName);
  const visited = new Set<TSESTree.Node>();

  function visit(node: TSESTree.Node): boolean {
    if (!node || visited.has(node)) return false;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrapExpression(node.callee);
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === setterName
      ) {
        return true;
      }
    }

    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (!child || typeof child !== 'object') continue;

      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in item) {
            if (visit(item)) return true;
          }
        }
      } else if ('type' in child) {
        if (visit(child)) return true;
      }
    }

    return false;
  }

  return visit(hookBody);
}

/**
 * The single property a member expression reads, or null when the key is
 * dynamic.
 *
 * A literal string key is the same read as the dotted spelling — `ref['current']`
 * and `ref.current` reach the identical slot — so both answer with the name.
 */
function staticPropertyName(node: TSESTree.MemberExpression): string | null {
  if (!node.computed) {
    return node.property.type === AST_NODE_TYPES.Identifier
      ? node.property.name
      : null;
  }
  return node.property.type === AST_NODE_TYPES.Literal &&
    typeof node.property.value === 'string'
    ? node.property.value
    : null;
}

/** The one property a React ref object carries. */
const REF_PROPERTY = 'current';

/**
 * Whether every read of `objectName` inside the hook body goes through
 * `.current` — the syntactic signature of a React ref object.
 *
 * why: a ref is the one dependency a hook is meant to list whole. React writes
 * `ref.current` during commit, after the render that evaluated the dependency
 * array, so narrowing `[ref]` to `[ref.current]` pins the value the renderer
 * has not written yet and the hook never re-runs when it later does — the
 * mount-time registration effect silently registers nothing. React's own
 * `react-hooks/exhaustive-deps` rejects that narrowed array outright ("Mutable
 * values like 'ref.current' aren't valid dependencies"), so emitting it puts
 * two recommended rules in direct contradiction and `--fix` oscillates between
 * them (#2170).
 *
 * The rule's motivation also lapses here: it warns that a sibling property
 * changing re-runs the hook needlessly, and a ref object has no sibling
 * property. Recognising the ref by its access shape rather than by its type
 * covers a ref arriving through a prop type no program can resolve, which is
 * the shape the `RuleTester` and every untyped consumer actually see.
 *
 * A chain rooted at `.current` (`ref.current.scrollTop`) counts as a ref read:
 * every link past the first is reachable only once the commit has populated the
 * ref, so narrowing there is the same defect one link deeper — and it would
 * additionally throw when the array dereferences a null `current` on the first
 * render.
 */
function readsObjectOnlyAsRef(
  hookBody: TSESTree.Node,
  objectName: string,
): boolean {
  const visited = new Set<TSESTree.Node>();
  let readsCurrent = false;
  let readsAnythingElse = false;

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node) || readsAnythingElse) return;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.Identifier && node.name === objectName) {
      // The wrappers that can sit between the identifier and the access it
      // belongs to — `(ref as RefObject<T>).current`, `ref!.current`,
      // `ref?.current` — are skipped so the read is attributed to its real
      // context, exactly as the usage collector does.
      let wrapperNode: TSESTree.Node = node;
      let effectiveParent = node.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        wrapperNode = effectiveParent;
        effectiveParent = effectiveParent.parent;
      }

      // `other.objectName` and `{ objectName: value }` name a different slot
      // and a label respectively, so neither is a read of this dependency.
      const isMemberProperty =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.property === wrapperNode &&
        !effectiveParent.computed;
      const isPropertyKey =
        effectiveParent?.type === AST_NODE_TYPES.Property &&
        effectiveParent.key === wrapperNode &&
        !effectiveParent.computed &&
        !effectiveParent.shorthand;

      if (!isMemberProperty && !isPropertyKey) {
        if (
          effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
          effectiveParent.object === wrapperNode &&
          staticPropertyName(effectiveParent) === REF_PROPERTY
        ) {
          readsCurrent = true;
        } else {
          // Any other read — a second property, a bare reference handed to a
          // call, a spread — proves the value is not a ref, so the ordinary
          // narrowing applies.
          readsAnythingElse = true;
        }
      }
    }

    forEachChildNode(node, visit);
  }

  visit(hookBody);
  return readsCurrent && !readsAnythingElse;
}

function getObjectUsagesInHook(
  hookBody: TSESTree.Node,
  objectName: string,
  typeInfo?: TypeInfo,
  bodyIsDeferred = false,
): { usages: Set<string>; needsEntireObject: boolean; notUsed: boolean } {
  const usages = new Map<string, number>(); // Track usage and its position
  // why: derived dependency paths (first-optional intermediate, array base)
  // must be re-rendered from structured links — string surgery on the
  // rendered path cannot place `?.` markers correctly.
  const pathSegments = new Map<string, PathSegment[]>();
  const visited = new Set<TSESTree.Node>();
  const guardedPaths = collectGuardedPaths(
    hookBody,
    objectName,
    bodyIsDeferred,
  );
  let needsEntireObject = false;
  let isUsed = false;

  /**
   * The longest prefix of `segments` that a dependency array may evaluate
   * unconditionally.
   *
   * why: the hook body reaches a deep path under guards the array cannot
   * carry, so the deepest path the body reads is not always a legal dependency.
   * Truncating at the first unsafe link yields a coarser dependency — the memo
   * recomputes whenever the parent object's identity changes rather than only
   * when the leaf does — which can only cost precision, never correctness, and
   * still delivers the narrowing this rule exists for.
   */
  function safePrefixOf(segments: readonly PathSegment[]): PathSegment[] {
    let limit = segments.length;

    // A link the source reached with `?.` is one the author expects to be
    // nullish. When the very next link is spelled *without* `?.`, the source
    // only survives because something outside the expression established the
    // value — a guard, a narrowing assertion, an invariant. The dependency
    // array inherits none of it, so the path stops at the optional link.
    // A trailing optional link (`a.b?.[0]`, `state?.[0]`) is safe as written
    // and keeps its full rendering.
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (segments[index].optional && !segments[index + 1].optional) {
        limit = index + 1;
        break;
      }
    }

    // A prefix whose dereferenceability a condition established is unusable in
    // the array for the same reason. The shortest such prefix wins, since it is
    // the most conservative stopping point.
    for (let index = 1; index < limit; index += 1) {
      if (
        guardedPaths.has(
          renderPathSegments(objectName, segments.slice(0, index)),
        )
      ) {
        limit = index;
        break;
      }
    }

    return segments.slice(0, limit);
  }

  // Built-in array methods that indicate usage of the entire array
  const ARRAY_METHODS = new Set([
    'map',
    'filter',
    'reduce',
    'forEach',
    'some',
    'every',
    'find',
    'findIndex',
    'includes',
    'indexOf',
    'join',
    'slice',
    'splice',
    'concat',
    'push',
    'pop',
    'shift',
    'unshift',
    'sort',
    'reverse',
    'flat',
    'flatMap',
  ]);

  // Built-in string methods that indicate usage of the entire string
  const STRING_METHODS = new Set([
    'charAt',
    'charCodeAt',
    'concat',
    'indexOf',
    'lastIndexOf',
    'localeCompare',
    'match',
    'replace',
    'search',
    'slice',
    'split',
    'substr',
    'substring',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'trimStart',
    'trimEnd',
    'padStart',
    'padEnd',
    'repeat',
    'startsWith',
    'endsWith',
    'includes',
  ]);

  function buildAccessPath(node: TSESTree.MemberExpression): string | null {
    // why: optionality belongs to individual links, not the whole chain.
    // Rendering from per-link segments keeps `?.` markers at their real
    // position (a.b?.[0] stays a.b?.[0], not a?.b[0]) and forms the mandatory
    // `?.[` for optional computed access (state?.[0], never state?[0]).
    const segments: PathSegment[] = [];
    let current: TSESTree.Node = node;

    // Collect all links from leaf to root
    while (current.type === AST_NODE_TYPES.MemberExpression) {
      const memberExpr = current as TSESTree.MemberExpression;

      // A member called through a chain never terminates a dependency path:
      // depend on the receiver instead.
      //
      // why: two reasons converge. A method reached through a chain
      // (`u.date.toISOString`) is a prototype-shared reference — the same value
      // for every receiver of that type — so pinning it in the array makes the
      // hook stop invalidating and serve a stale value forever. And it is the
      // link that dereferences the receiver, so a receiver whose safety came
      // from a guard (`if (u.date)`, `u.date!`) throws when the array is
      // evaluated on a render that never entered the guard.
      //
      // Two conditions bound this. The link must be spelled without `?.`: a
      // fully optional chain (`userData?.date?.toISOString`) short-circuits
      // instead of throwing, which is exactly the per-link rendering this rule
      // already gets right. And the receiver must itself be a member path —
      // where it is the dependency object (`userData?.getName?.()`), falling
      // back to it would surrender the narrowing entirely, and a function held
      // directly on a plain dependency object is per-instance state whose
      // identity legitimately changes; `isMethodMember` decides that case with
      // the type checker.
      if (!memberExpr.optional && isCallCallee(memberExpr)) {
        const receiver = unwrapExpression(memberExpr.object);
        if (receiver.type === AST_NODE_TYPES.MemberExpression) {
          const receiverPath = buildAccessPath(receiver);
          if (receiverPath) {
            usages.set(receiverPath, memberExpr.range?.[0] || 0);
          }
          return null;
        }
      }

      // Handle computed properties (like array indices)
      if (memberExpr.computed) {
        // why: only a *literal* string/number computed key (obj[0],
        // obj['special-key']) narrows to a single, stable field. EVERY other
        // computed key — Identifier (obj[i]), CallExpression
        // (obj[assertSafe(i)]), BinaryExpression (obj[i+1]), MemberExpression
        // (obj[keys[j]]), TSAsExpression (obj[k as K]), TemplateLiteral
        // (obj[`row-${i}`]), etc. — is a dynamic access that can read
        // arbitrary elements across an iteration. Remaining literal kinds
        // (boolean/null/regex/bigint keys) have no rendering the fixer can
        // guarantee round-trips, so they decline narrowing too rather than
        // emit unreliable text. In every declined case the whole object is a
        // legitimate dependency: resolve the base and mark it accordingly.
        const literalValue =
          memberExpr.property.type === AST_NODE_TYPES.Literal
            ? memberExpr.property.value
            : undefined;
        if (
          typeof literalValue !== 'number' &&
          typeof literalValue !== 'string'
        ) {
          // Check if this is accessing our target object
          let currentBase = unwrapExpression(memberExpr.object);
          while (currentBase.type === AST_NODE_TYPES.MemberExpression) {
            currentBase = unwrapExpression(
              (currentBase as TSESTree.MemberExpression).object,
            );
          }
          if (
            currentBase.type === AST_NODE_TYPES.Identifier &&
            currentBase.name === objectName
          ) {
            // No narrowable field exists, so the entire object is required.
            needsEntireObject = true;
          }
          return null;
        }

        segments.unshift({
          text:
            typeof literalValue === 'number'
              ? `[${literalValue}]`
              : `[${quoteKey(literalValue)}]`,
          computed: true,
          optional: memberExpr.optional,
        });
      } else {
        // Regular property access
        if (memberExpr.property.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }

        // Check for a member that cannot serve as a narrowed dependency: a
        // built-in array/string method by name, or — when type information is
        // available — any method of a class or interface. Both denote usage of
        // the entire receiver, because the member itself is a prototype-shared
        // reference rather than per-instance state.
        const isBuiltInWholeObjectMethod =
          !!memberExpr.property.name &&
          (ARRAY_METHODS.has(memberExpr.property.name) ||
            STRING_METHODS.has(memberExpr.property.name));
        if (
          isBuiltInWholeObjectMethod ||
          (typeInfo !== undefined &&
            isMethodMember(typeInfo.checker, memberExpr, typeInfo.nodeMap))
        ) {
          const methodTarget = unwrapExpression(memberExpr.object);
          if (methodTarget.type === AST_NODE_TYPES.MemberExpression) {
            // Method call on a property (e.g., userData.items.map(...) or
            // userData?.items?.map(...)): depend on that property's own path,
            // rendered with the same per-link optional markers as any other
            // access.
            const path = buildAccessPath(methodTarget);
            if (path) {
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          } else if (
            methodTarget.type === AST_NODE_TYPES.Identifier &&
            methodTarget.name === objectName
          ) {
            // Direct method call on the object (e.g., userData.map(...))
            needsEntireObject = true;
          }
          return null;
        }

        segments.unshift({
          text: memberExpr.property.name,
          computed: false,
          optional: memberExpr.optional,
        });
      }

      current = unwrapExpression(memberExpr.object);
    }

    // Check if we reached the target identifier
    const base = unwrapExpression(current);
    if (base.type === AST_NODE_TYPES.Identifier && base.name === objectName) {
      const path = renderPathSegments(objectName, segments);
      pathSegments.set(path, segments);
      return path;
    }

    return null;
  }

  function visit(node: TSESTree.Node): void {
    if (!node || visited.has(node)) return;
    visited.add(node);

    if (node.type === AST_NODE_TYPES.Identifier && node.name === objectName) {
      // Skip TS type assertions, ChainExpression and TSNonNullExpression wrappers
      // (used around the Identifier) so we can attribute the Identifier's usage
      // to its actual parent context (e.g., call/member/assignment) and avoid
      // misclassifying the dependency when determining if the whole object is referenced.
      let wrapperNode: TSESTree.Node = node;
      let effectiveParent = node.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        wrapperNode = effectiveParent;
        effectiveParent = effectiveParent.parent;
      }

      // Exclude: property name in `other.objectName` (not our target object)
      const isMemberProperty =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.property === wrapperNode &&
        !effectiveParent.computed;

      // Exclude: object in `objectName.prop` (handled by MemberExpression visitor for field tracking)
      const isMemberObject =
        effectiveParent?.type === AST_NODE_TYPES.MemberExpression &&
        effectiveParent.object === wrapperNode;

      // Exclude: key in `{ objectName: value }` (not usage, just a label)
      // Include: shorthand `{ objectName }` (actual usage)
      const isPropertyKey =
        effectiveParent?.type === AST_NODE_TYPES.Property &&
        effectiveParent.key === wrapperNode &&
        !effectiveParent.computed &&
        !effectiveParent.shorthand;

      if (!isMemberProperty && !isMemberObject && !isPropertyKey) {
        isUsed = true;

        // Patterns that require the entire object (cannot refactor to specific fields)
        const isTypeAUsage =
          effectiveParent?.type === AST_NODE_TYPES.ReturnStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ArrayExpression ||
          effectiveParent?.type === AST_NODE_TYPES.BinaryExpression ||
          effectiveParent?.type === AST_NODE_TYPES.LogicalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.ConditionalExpression ||
          effectiveParent?.type === AST_NODE_TYPES.UnaryExpression ||
          (effectiveParent?.type === AST_NODE_TYPES.Property &&
            (effectiveParent.value === wrapperNode ||
              effectiveParent.shorthand ||
              (effectiveParent.key === wrapperNode &&
                effectiveParent.computed))) ||
          effectiveParent?.type === AST_NODE_TYPES.TemplateLiteral ||
          effectiveParent?.type === AST_NODE_TYPES.VariableDeclarator ||
          effectiveParent?.type === AST_NODE_TYPES.AssignmentExpression ||
          effectiveParent?.type === AST_NODE_TYPES.JSXExpressionContainer ||
          effectiveParent?.type === AST_NODE_TYPES.JSXSpreadAttribute ||
          effectiveParent?.type === AST_NODE_TYPES.SpreadElement ||
          effectiveParent?.type === AST_NODE_TYPES.ForInStatement ||
          effectiveParent?.type === AST_NODE_TYPES.ForOfStatement ||
          effectiveParent?.type === AST_NODE_TYPES.CallExpression;

        if (isTypeAUsage) {
          needsEntireObject = true;
        }
      }
    }

    if (node.type === AST_NODE_TYPES.CallExpression) {
      // Check if the object is being called as a function
      const callee = unwrapExpression(node.callee);
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === objectName
      ) {
        needsEntireObject = true;
      }

      // Check if the object is directly passed as an argument
      node.arguments.forEach((arg) => {
        const unwrappedArg = unwrapExpression(arg);
        if (
          unwrappedArg.type === AST_NODE_TYPES.Identifier &&
          unwrappedArg.name === objectName
        ) {
          needsEntireObject = true;
        }
      });
    } else if (
      node.type === AST_NODE_TYPES.JSXElement ||
      node.type === AST_NODE_TYPES.JSXFragment
    ) {
      // If we find a JSX element, check its attributes for spread operator
      if (node.type === AST_NODE_TYPES.JSXElement) {
        node.openingElement.attributes.forEach((attr) => {
          if (attr.type === AST_NODE_TYPES.JSXSpreadAttribute) {
            const argument = unwrapExpression(attr.argument);
            if (
              argument.type === AST_NODE_TYPES.Identifier &&
              argument.name === objectName
            ) {
              needsEntireObject = true;
            }
          }
        });
      }
    } else if (node.type === AST_NODE_TYPES.SpreadElement) {
      // If we find a spread operator with our target object, consider it as accessing all properties
      const argument = unwrapExpression(node.argument);
      if (
        argument.type === AST_NODE_TYPES.Identifier &&
        argument.name === objectName
      ) {
        needsEntireObject = true;
        return;
      }
    } else if (node.type === AST_NODE_TYPES.MemberExpression) {
      // Check if this is accessing a property of our target object
      const memberExpr = node as TSESTree.MemberExpression;

      // Skip TS type assertions, ChainExpression and TSNonNullExpression wrappers
      // so we can attribute the MemberExpression's usage to its actual parent
      // context and avoid misclassifying the dependency.
      // We only process if this is the outermost member expression in a chain.
      let effectiveParent = memberExpr.parent;
      while (
        effectiveParent &&
        (effectiveParent.type === AST_NODE_TYPES.TSAsExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSTypeAssertion ||
          effectiveParent.type === AST_NODE_TYPES.ChainExpression ||
          effectiveParent.type === AST_NODE_TYPES.TSNonNullExpression)
      ) {
        effectiveParent = effectiveParent.parent;
      }
      const isIntermediate =
        effectiveParent &&
        effectiveParent.type === AST_NODE_TYPES.MemberExpression;

      if (!isIntermediate) {
        // Check if this member expression involves our target object
        let current: TSESTree.Node = memberExpr;
        let foundTargetObject = false;
        let hasDynamicComputed = false;

        // Walk up the member expression chain to see if it involves our target object
        while (current.type === AST_NODE_TYPES.MemberExpression) {
          const currentMember = current as TSESTree.MemberExpression;

          // Check if this level uses dynamic computed property access.
          // why: any non-literal computed key reads arbitrary elements, so it
          // requires the entire object. Only a literal key (obj[0], obj['k'])
          // narrows to a single, stable field.
          if (
            currentMember.computed &&
            currentMember.property.type !== AST_NODE_TYPES.Literal
          ) {
            hasDynamicComputed = true;
          }

          current = unwrapExpression(currentMember.object);
        }

        // Check if we reached our target object
        const base = unwrapExpression(current);
        if (
          base.type === AST_NODE_TYPES.Identifier &&
          base.name === objectName
        ) {
          foundTargetObject = true;
        }

        if (foundTargetObject) {
          if (hasDynamicComputed) {
            // Dynamic computed property access means we need the entire object
            needsEntireObject = true;
          } else {
            // Static property access - add to usages
            const path = buildAccessPath(memberExpr);
            if (path) {
              usages.set(path, memberExpr.range?.[0] || 0);
            }
          }
        }
      }
    } else if (node.type === AST_NODE_TYPES.ChainExpression) {
      // Handle optional chaining expressions
      if (node.expression.type === AST_NODE_TYPES.MemberExpression) {
        const path = buildAccessPath(node.expression);
        if (path) {
          usages.set(path, node.range?.[0] || 0);
        }
      }
    } else if (
      node.type === AST_NODE_TYPES.BinaryExpression ||
      node.type === AST_NODE_TYPES.LogicalExpression
    ) {
      // Handle binary expressions like `userId || userData?.id`
      visit(node.left);
      visit(node.right);
    } else if (node.type === AST_NODE_TYPES.ConditionalExpression) {
      // Handle ternary expressions
      visit(node.test);
      visit(node.consequent);
      visit(node.alternate);
    } else if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      // Handle variable declarations
      node.declarations.forEach((declaration) => {
        if (declaration.init) {
          visit(declaration.init);
        }
      });
    } else if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      // Handle assignments
      visit(node.right);
    }

    // Visit all child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Skip parent references to avoid cycles

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const child = (node as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item) => {
            if (item && typeof item === 'object') {
              visit(item);
            }
          });
        } else if ('type' in child) {
          visit(child);
        }
      }
    }
  }

  visit(hookBody);

  // Replace every collected path with the prefix that survives evaluation
  // outside the hook body. Distinct reads can collapse onto one dependency
  // (`a.b` and a truncated `a.b.c` are the same entry), so the earliest source
  // position is kept for the ordering below.
  const safeUsages = new Map<string, number>();
  usages.forEach((position, rawPath) => {
    const segments = pathSegments.get(rawPath);
    const safeSegments = segments ? safePrefixOf(segments) : undefined;
    const safePath = safeSegments
      ? renderPathSegments(objectName, safeSegments)
      : rawPath;
    if (safeSegments) {
      pathSegments.set(safePath, safeSegments);
    }

    const recorded = safeUsages.get(safePath);
    safeUsages.set(
      safePath,
      recorded === undefined ? position : Math.min(recorded, position),
    );
  });

  // Process paths and determine which ones to include
  const paths = Array.from(safeUsages.keys());
  const finalPaths = new Set<string>();

  paths.forEach((path) => {
    // Always include the main path
    finalPaths.add(path);

    const segments = pathSegments.get(path);
    if (!segments) {
      return;
    }

    // Include the FIRST optional link as an intermediate dependency when more
    // links follow it: for userData?.profile.settings.theme.primary we also
    // want userData?.profile.
    const firstOptionalIndex = segments.findIndex(
      (segment) => segment.optional,
    );
    if (firstOptionalIndex !== -1 && firstOptionalIndex < segments.length - 1) {
      finalPaths.add(
        renderPathSegments(
          objectName,
          segments.slice(0, firstOptionalIndex + 1),
        ),
      );
    }

    // For array access, include the array property itself: for
    // userData.items[0] we also want userData.items. A bracket directly on
    // the base (state[0], state?.[0]) adds nothing — its "array" is the
    // entire object dependency this rule exists to narrow away.
    const firstComputedIndex = segments.findIndex(
      (segment) => segment.computed,
    );
    if (firstComputedIndex > 0) {
      finalPaths.add(
        renderPathSegments(objectName, segments.slice(0, firstComputedIndex)),
      );
    }
  });

  // Convert to array for sorting
  const pathsArray = Array.from(finalPaths);

  // Filter out array paths when we're already accessing specific indices
  // Exception: keep array paths with optional chaining as they represent different dependencies
  const filteredPaths = pathsArray.filter((path) => {
    // Skip array paths if we're accessing specific indices, unless it's optional chaining
    // why: an optional bracket renders as `?.[`, so the specific-index probe
    // must accept both `base[0]` and `base?.[0]` shapes.
    const isArrayWithSpecificIndices = pathsArray.some(
      (otherPath) =>
        otherPath !== path &&
        (otherPath.startsWith(path + '[') ||
          otherPath.startsWith(path + '?.[')),
    );

    // Keep array paths with optional chaining even if specific indices are accessed
    if (isArrayWithSpecificIndices && path.includes('?.')) {
      return true;
    }

    return !isArrayWithSpecificIndices;
  });

  // Sort paths: longer/more specific paths first, then by optional chaining preference
  const sortedPaths = filteredPaths.sort((a, b) => {
    const posA = safeUsages.get(a) || 0;
    const posB = safeUsages.get(b) || 0;

    // For paths with the same base, put longer ones first
    const aDepth = a.split('.').length + (a.includes('[') ? 1 : 0);
    const bDepth = b.split('.').length + (b.includes('[') ? 1 : 0);

    if (aDepth !== bDepth) {
      return bDepth - aDepth; // Longer paths first
    }

    // If same depth, prefer optional chaining paths first
    const aHasOptional = a.includes('?');
    const bHasOptional = b.includes('?');

    if (aHasOptional && !bHasOptional) {
      return -1; // a comes first
    }
    if (!aHasOptional && bHasOptional) {
      return 1; // b comes first
    }

    // If same depth and same optional chaining status, sort by source position
    return posA - posB;
  });

  const filteredUsages = new Set(sortedPaths);
  const notUsed = !needsEntireObject && !isUsed && filteredUsages.size === 0;

  return {
    usages: filteredUsages,
    needsEntireObject,
    notUsed,
  };
}

/** The run of spaces/tabs opening the line that `offset` sits on. */
function indentAt(text: string, offset: number) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart, offset))?.[0] ?? '';
}

/**
 * Drop `span`, but re-emit any comment standing inside it.
 *
 * Removing a dependency means removing its separator too, so the span reaches
 * to a NEIGHBOURING element and therefore covers the margin between the two.
 * That margin is not the fixer's to delete: it can hold an
 * `eslint-disable-next-line` protecting the dependency that survives, and
 * dropping that directive silently re-enables another rule (#2208). Declining
 * the fix instead would only trade the lost comment for a transform that a
 * comment decides (#1877), so the comment is carried rather than obeyed.
 *
 * Each carried comment is re-emitted on a line of its own: a `//` comment
 * swallows whatever follows it on the same line, so folding one inline would
 * comment out the dependency that was meant to survive.
 */
function removeCarryingComments(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  span: [number, number],
  anchor: 'toNextElement' | 'fromPrevElement',
) {
  const carried = sourceCode
    .getAllComments()
    .filter(
      (comment) => comment.range[0] >= span[0] && comment.range[1] <= span[1],
    );

  // With nothing to preserve the span is pure separator and whitespace, so the
  // plain removal keeps the comment-free output exactly as it has always been.
  if (carried.length === 0) {
    return fixer.removeRange(span);
  }

  const text = sourceCode.getText();
  // Anchor the indentation on the end the surviving code sits against.
  const indent = indentAt(
    text,
    anchor === 'toNextElement' ? span[1] : carried[0].range[0],
  );
  const body = carried
    .map((comment) => text.slice(comment.range[0], comment.range[1]))
    .join(`\n${indent}`);

  // Both spellings close on a fresh line: whatever the span abutted — the next
  // dependency, or the separator trailing the last one — would otherwise land
  // on the final carried comment's line and be commented out.
  return fixer.replaceTextRange(
    span,
    anchor === 'toNextElement'
      ? `${body}\n${indent}`
      : `\n${indent}${body}\n${indent}`,
  );
}

export const noEntireObjectHookDeps = createRule<[], MessageIds>({
  name: 'no-entire-object-hook-deps',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid using entire objects in React hook dependency arrays.',
      recommended: 'error',
      requiresTypeChecking: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject:
        'What\'s wrong: Dependency array includes entire object "{{objectName}}". Why it matters: Any change to its other properties reruns the hook even though the hook reads only {{fields}}, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.',
      removeUnusedDependency:
        'What\'s wrong: Dependency "{{objectName}}" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "{{objectName}}" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.',
    },
  },
  defaultOptions: [],
  create(context) {
    // For testing purposes, we'll make the rule work without TypeScript services
    const parserServices = context.parserServices;
    const hasFullTypeChecking =
      parserServices?.program &&
      parserServices?.esTreeNodeToTSNodeMap &&
      typeof parserServices.program.getTypeChecker === 'function';

    // Skip type checking if we don't have TypeScript services
    if (hasFullTypeChecking) {
      // This is just to make the rule work in tests without TypeScript services
      // In a real environment, we would want to enforce this
      // throw new Error('You have to enable the `project` setting in parser options to use this rule');
    }

    // why: building the checker is the expensive half of a typed lint, so the
    // handles are resolved once per file and shared by every type-driven check
    // rather than re-fetched per dependency.
    let typeInfo: TypeInfo | undefined;
    function getTypeInfo(): TypeInfo | undefined {
      if (!hasFullTypeChecking || !parserServices) {
        return undefined;
      }
      if (!typeInfo) {
        typeInfo = {
          checker: parserServices.program.getTypeChecker(),
          nodeMap: parserServices.esTreeNodeToTSNodeMap,
        };
      }
      return typeInfo;
    }

    const sourceCode = context.getSourceCode();

    /**
     * The variable each reference resolves to, keyed by the referencing
     * identifier NODE rather than by name.
     *
     * why: identity keying is what makes the orphan check below immune to
     * shadowing — a name lookup would resolve an inner `hydrated` against an
     * outer binding of the same name and read its uses as survivors.
     */
    let variableByReference: Map<
      TSESTree.Node,
      TSESLint.Scope.Variable
    > | null = null;

    function resolveBinding(
      identifier: TSESTree.Node,
    ): TSESLint.Scope.Variable | null {
      if (!variableByReference) {
        variableByReference = new Map();
        for (const scope of sourceCode.scopeManager?.scopes ?? []) {
          for (const variable of scope.variables) {
            for (const reference of variable.references) {
              variableByReference.set(reference.identifier, variable);
            }
          }
        }
      }
      return variableByReference.get(identifier) ?? null;
    }

    /**
     * Whether deleting `element` from the dependency array would leave its
     * binding with no reader left in the file.
     *
     * why: a value declared and then read ONLY inside a dependency array is by
     * construction load-bearing — the declaration would be pointless otherwise
     * — so removing the entry both discards a deliberate recompute trigger and
     * strands the declaration. The consumer runs `no-unused-vars` as an error
     * and builds with `noUnusedLocals`, so the rewrite turns a green file red
     * on their machine while staying green here. Every sibling instance of this
     * class was fixed by deleting the stranded declaration too, but that remedy
     * is unavailable here: the declaration is a hook CALL, and dropping it
     * changes the component's hook order. Declining the edit is the only safe
     * remedy, so the report stands and the autofix steps aside.
     *
     * Parameters are deliberately exempt. An unread parameter is not an unused
     * BINDING to either instrument — `no-unused-vars` runs with `args: 'none'`
     * and `noUnusedLocals` does not cover parameters — so declining there would
     * withhold a fix without preventing any breakage, and it would silently
     * settle the reporting question #1621 defers.
     */
    function wouldStrandBinding(element: TSESTree.Node): boolean {
      const identifier = unwrapExpression(element);
      if (identifier.type !== AST_NODE_TYPES.Identifier) return false;

      const variable = resolveBinding(identifier);
      if (!variable || variable.defs.length === 0) return false;
      if (
        variable.defs.some(
          (def) => def.type === ('Parameter' as typeof def.type),
        )
      ) {
        return false;
      }

      const [start, end] = element.range!;
      // why: a declarator's own initializer counts as a WRITE reference, so a
      // survivor test that accepts any reference never fires for `const x = …`
      // — the shape this check exists for (#1868 is the same trap).
      return !variable.references.some((reference) => {
        if (!reference.isRead()) return false;
        const [from, to] = reference.identifier.range!;
        return from < start || to > end;
      });
    }

    // why: scanning every comment once per file rather than once per hook call
    // keeps the check off the hot path of files with many hooks.
    let manuallyManagedLines: Set<number> | null = null;
    let disabledForWholeFile = false;

    function collectDisableDirectives(): Set<number> {
      if (manuallyManagedLines) {
        return manuallyManagedLines;
      }

      const lines = new Set<number>();
      for (const comment of sourceCode.getAllComments()) {
        const scope = readExhaustiveDepsDisable(comment);
        if (scope === 'file') {
          disabledForWholeFile = true;
        } else if (scope !== null) {
          lines.add(scope);
        }
      }

      manuallyManagedLines = lines;
      return lines;
    }

    /**
     * Whether the author has taken manual control of this hook's dependency
     * array by suppressing `react-hooks/exhaustive-deps` for it.
     *
     * why: exhaustive-deps is the rule that would otherwise force every read
     * value into the array, so disabling it declares the array hand-maintained.
     * Entries in such an array are load-bearing by construction — an unread one
     * is a deliberate recompute trigger (a hydration flag, a change-detecting
     * hash) whose deletion silently returns a stale value. The comment can sit
     * above the hook call, above the dependency array, or above the closing
     * `}, [...])` line, so any directive landing anywhere within the call
     * counts.
     */
    function hasManuallyManagedDeps(node: TSESTree.CallExpression): boolean {
      const lines = collectDisableDirectives();
      if (disabledForWholeFile) {
        return true;
      }

      for (
        let line = node.loc.start.line;
        line <= node.loc.end.line;
        line += 1
      ) {
        if (lines.has(line)) {
          return true;
        }
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (!isHookCall(node)) {
          return;
        }

        // Get the dependency array argument
        const depsArg = node.arguments[node.arguments.length - 1];
        if (!depsArg || depsArg.type !== AST_NODE_TYPES.ArrayExpression) {
          return;
        }

        // Get the hook callback function
        const callbackArg = node.arguments[0];
        if (
          !callbackArg ||
          (callbackArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
            callbackArg.type !== AST_NODE_TYPES.FunctionExpression)
        ) {
          return;
        }

        const callbackBody = (
          callbackArg as
            | TSESTree.ArrowFunctionExpression
            | TSESTree.FunctionExpression
        ).body;
        const isEffect = isEffectHookCall(node);
        const bodyIsDeferred = isDeferredBodyHookCall(node);
        const manuallyManagedDeps = hasManuallyManagedDeps(node);

        // Check each dependency in the array
        depsArg.elements.forEach((element) => {
          const unwrappedElement = element ? unwrapExpression(element) : null;
          if (!unwrappedElement) return; // Skip null elements (holes in the array)

          if (unwrappedElement.type === AST_NODE_TYPES.Identifier) {
            const objectName = unwrappedElement.name;

            // Skip type checking if we don't have TypeScript services
            const dependencyTypeInfo = getTypeInfo();
            if (dependencyTypeInfo) {
              // Skip if the dependency is an array or primitive type
              if (
                isArrayOrPrimitive(
                  dependencyTypeInfo.checker,
                  unwrappedElement,
                  dependencyTypeInfo.nodeMap,
                )
              ) {
                return;
              }
            }
            // For testing without TypeScript services, we'll assume all identifiers are objects

            const result = getObjectUsagesInHook(
              callbackBody,
              objectName,
              dependencyTypeInfo,
              bodyIsDeferred,
            );

            // If the object is not used at all, suggest removing it
            if (result.notUsed) {
              // why: deleting an entry from an array the author maintains by
              // hand is presumptuous — the suppression is the declaration that
              // the entries were chosen deliberately, and an unread one is a
              // recompute trigger whose removal yields a stale value. Narrowing
              // an entire object (avoidEntireObject) is a different transform
              // and stays enabled: it preserves the dependency, it does not
              // drop it.
              if (manuallyManagedDeps) {
                return;
              }

              // why: an effect reruns for its side effects, so a dependency the
              // body never reads is normally a deliberate re-run trigger
              // (React's reset-on-scope-change idiom) — deleting it silently
              // stops the effect from rerunning. Only when the body also writes
              // that value (setX for dep x) is the dependency a circular one
              // worth removing. Value-producing hooks (useMemo/useCallback)
              // gain nothing from an unread dependency, so they still report.
              if (
                isEffect &&
                !callsCorrespondingSetter(callbackBody, objectName)
              ) {
                return;
              }

              context.report({
                node: element as TSESTree.Node,
                messageId: 'removeUnusedDependency',
                data: {
                  objectName,
                },
                fix(fixer) {
                  // Remove the element and handle commas properly
                  const elementIndex = depsArg.elements.indexOf(element);

                  if (elementIndex === -1) return null;

                  // The report stands either way; only the rewrite is withheld.
                  if (wouldStrandBinding(element as TSESTree.Node)) {
                    return null;
                  }

                  // If this is the only element, just remove it
                  if (depsArg.elements.length === 1) {
                    return fixer.remove(element as TSESTree.Node);
                  }

                  // If this is the last element, remove the preceding comma
                  if (elementIndex === depsArg.elements.length - 1) {
                    const prevElement = depsArg.elements[elementIndex - 1];
                    if (prevElement) {
                      return removeCarryingComments(
                        fixer,
                        sourceCode,
                        [
                          prevElement.range![1],
                          (element as TSESTree.Node).range![1],
                        ],
                        'fromPrevElement',
                      );
                    }
                  }

                  // Otherwise, remove the element and the following comma
                  const nextElement = depsArg.elements[elementIndex + 1];
                  if (nextElement) {
                    return removeCarryingComments(
                      fixer,
                      sourceCode,
                      [
                        (element as TSESTree.Node).range![0],
                        nextElement.range![0],
                      ],
                      'toNextElement',
                    );
                  }

                  // Fallback to just removing the element
                  return fixer.remove(element as TSESTree.Node);
                },
              });
            }
            // If we found specific field usages and the entire object is in deps
            // Skip reporting if needsEntireObject is true (indicates spread operator usage)
            else if (result.usages.size > 0 && !result.needsEntireObject) {
              // A ref object has no narrowing target: `[ref.current]` reads a
              // slot React fills after the render that evaluated the array, so
              // the whole ref is the correct dependency (#2170).
              if (readsObjectOnlyAsRef(callbackBody, objectName)) {
                return;
              }

              const fields = Array.from(result.usages).join(', ');
              context.report({
                node: element as TSESTree.Node,
                messageId: 'avoidEntireObject',
                data: {
                  objectName,
                  fields,
                },
                fix(fixer) {
                  return fixer.replaceText(
                    element as TSESTree.Node,
                    Array.from(result.usages).join(', '),
                  );
                },
              });
            }
          }
        });
      },
    };
  },
});
