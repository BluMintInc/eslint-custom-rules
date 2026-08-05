import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'parallelizeLoopAwaits';
type Options = [
  {
    coordinatorPatterns?: string[];
    rateLimitedPatterns?: string[];
    ignoreTestFiles?: boolean;
  },
];

// Anchored at the end of the path so multi-part suffixes such as
// `EventRegistry.integration.test.ts` are recognized while production modules
// that merely contain the word (`testHelpers.ts`, `latest.ts`, `contest/Thing.ts`)
// keep their enforcement.
const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Jest convention directories hold test-only modules regardless of file name.
const TEST_FILE_DIRECTORY = /(^|\/)(__tests__|__mocks__)\//;

/**
 * A test suite serves no requests and is not latency-critical, so the rule's
 * rationale — that sequential awaits make network and I/O latency add up — does
 * not apply to it. A loop in a suite instead replays one entrypoint to exercise
 * behavior that accumulates across calls: each iteration must observe the state
 * the previous iteration stored, and that state usually lives in a mock closure
 * the loop body never names. The dependency is a side effect rather than a
 * value, so it is invisible to every syntactic barrier below, and
 * `Promise.all` would let all iterations observe the same initial state
 * (issues #1395, #1687).
 */
const isTestFile = (filename: string) =>
  TEST_FILE_SUFFIX.test(filename) || TEST_FILE_DIRECTORY.test(filename);

const DEFAULT_COORDINATOR_PATTERNS = [
  'batchManager',
  'batch',
  'transaction',
  'collector',
  'accumulator',
  'aggregator',
  'mutex',
  'lock',
];

const DEFAULT_RATE_LIMITED_PATTERNS = [
  'sleep',
  'delay',
  'throttle',
  'rateLimit',
];

const defaultOptions: Options = [
  {
    coordinatorPatterns: DEFAULT_COORDINATOR_PATTERNS,
    rateLimitedPatterns: DEFAULT_RATE_LIMITED_PATTERNS,
    ignoreTestFiles: true,
  },
];

type LoopNode =
  | TSESTree.ForOfStatement
  | TSESTree.ForInStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement;

const LOOP_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

export const parallelizeLoopAwaits = createRule<Options, MessageIds>({
  name: 'parallelize-loop-awaits',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow sequential await expressions inside loops when iterations could be parallelized with Promise.all(items.map(...))',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          coordinatorPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_COORDINATOR_PATTERNS,
          },
          rateLimitedPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_RATE_LIMITED_PATTERNS,
          },
          // Deliberately carries no schema `default`. ESLint validates rule
          // options with an ajv instance configured `useDefaults: true`, which
          // writes schema defaults INTO the supplied options object before
          // `defaultOptions` are merged, so a schema default here would decide
          // the value for every consumer who passes an options object at all.
          // `defaultOptions` plus the `?? true` read below is the single source
          // of truth.
          ignoreTestFiles: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      parallelizeLoopAwaits:
        'Sequential await in loop can likely be parallelized using Promise.all(items.map(...)). If sequential execution is intentional, add an `// eslint-disable-next-line @blumintinc/blumint/parallelize-loop-awaits -- <reason>` comment explaining why.',
    },
  },
  defaultOptions,
  create(context, [options]) {
    // Normalize Windows backslash separators so the forward-slash directory
    // check matches on every platform. Without this, `getFilename()` returns
    // `C:\repo\src\__tests__\Foo.ts` on Windows and the exemption silently
    // fails there.
    const filename = context.getFilename().replace(/\\/g, '/');
    if ((options?.ignoreTestFiles ?? true) && isTestFile(filename)) {
      return {};
    }

    const coordinatorPatterns =
      options?.coordinatorPatterns ?? DEFAULT_COORDINATOR_PATTERNS;
    const rateLimitedPatterns =
      options?.rateLimitedPatterns ?? DEFAULT_RATE_LIMITED_PATTERNS;

    /**
     * Tests whether an identifier name matches a coordinator/rate-limit pattern.
     * Uses camelCase-aware matching: the identifier equals the pattern, starts
     * with it, or ends with it (all case-insensitive). This avoids false
     * positives from substring coincidences like "nonBatchMethod" matching "batch".
     */
    function matchesPattern(identifierName: string, pattern: string): boolean {
      const lower = identifierName.toLowerCase();
      const pat = pattern.toLowerCase();
      return lower === pat || lower.startsWith(pat) || lower.endsWith(pat);
    }

    /**
     * Recursively collects the names a node REFERENCES. With `stopAtFunctions`
     * the walk halts at a nested function, so a name written inside a callback
     * describes that callback's scope rather than the surrounding loop's.
     */
    function collectIdentifiers(
      node: TSESTree.Node,
      names: Set<string>,
      stopAtFunctions = false,
    ): void {
      if (node.type === AST_NODE_TYPES.Identifier) {
        names.add(node.name);
        return;
      }

      // Do not descend into nested functions when stopAtFunctions is set
      if (
        stopAtFunctions &&
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return;
      }

      // A non-computed property key is a label, not a reference: the `lock` in
      // `await send({ lock: true })` names a field of the payload and binds
      // nothing, so letting it reach the coordinator match would exempt the loop
      // on the strength of a string. A computed key (`{ [lock]: true }`) is an
      // expression that really does read the surrounding scope, and shorthand
      // (`{ lock }`) carries the same identifier as its VALUE, so both keep
      // their say. (#1688)
      if (node.type === AST_NODE_TYPES.Property) {
        if (node.computed) {
          collectIdentifiers(node.key, names, stopAtFunctions);
        }
        collectIdentifiers(node.value, names, stopAtFunctions);
        return;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                collectIdentifiers(
                  item as TSESTree.Node,
                  names,
                  stopAtFunctions,
                );
              }
            }
          } else if ('type' in (child as object)) {
            collectIdentifiers(child as TSESTree.Node, names, stopAtFunctions);
          }
        }
      }
    }

    /**
     * Returns the function call name(s) from an await expression, used to
     * check for rate-limiting function calls like `await sleep(1000)`.
     */
    function getCallNames(awaitExpr: TSESTree.AwaitExpression): string[] {
      const names: string[] = [];
      const { argument } = awaitExpr;

      let callExpr: TSESTree.CallExpression | null = null;
      if (argument.type === AST_NODE_TYPES.CallExpression) {
        callExpr = argument;
      } else if (
        argument.type === AST_NODE_TYPES.ChainExpression &&
        argument.expression.type === AST_NODE_TYPES.CallExpression
      ) {
        callExpr = argument.expression;
      }

      if (!callExpr) return names;

      const { callee } = callExpr;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        names.push(callee.property.name);
      } else if (callee.type === AST_NODE_TYPES.Identifier) {
        names.push(callee.name);
      }

      return names;
    }

    /**
     * Determines whether a node (a loop body) directly contains a break,
     * continue, or return statement that is NOT inside a nested function.
     * These statements indicate the loop's control flow depends on the async
     * result and cannot be safely parallelized.
     */
    function containsBreakContinueReturn(node: TSESTree.Node): boolean {
      if (
        node.type === AST_NODE_TYPES.BreakStatement ||
        node.type === AST_NODE_TYPES.ContinueStatement ||
        node.type === AST_NODE_TYPES.ReturnStatement
      ) {
        return true;
      }

      // Don't descend into nested functions — their control flow is separate
      if (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return false;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                if (containsBreakContinueReturn(item as TSESTree.Node))
                  return true;
              }
            }
          } else if ('type' in (child as object)) {
            if (containsBreakContinueReturn(child as TSESTree.Node))
              return true;
          }
        }
      }

      return false;
    }

    /**
     * Returns true when the await expression is directly wrapped in a try
     * block within the same loop body. This indicates per-iteration error
     * handling is in use, where sequential semantics are intentional.
     */
    function isAwaitInTryCatch(
      awaitNode: TSESTree.AwaitExpression,
      loopNode: LoopNode,
    ): boolean {
      let current: TSESTree.Node | undefined =
        awaitNode.parent as TSESTree.Node;
      while (current && current !== loopNode) {
        if (current.type === AST_NODE_TYPES.TryStatement) {
          return true;
        }
        current = current.parent as TSESTree.Node;
      }
      return false;
    }

    /**
     * Checks whether any identifier used in the loop body matches any of the
     * coordinator patterns (using camelCase-aware matching), indicating shared
     * mutable state that requires sequential execution (e.g. BatchManager,
     * Firestore Transaction).
     */
    function hasCoordinatorInBody(body: TSESTree.Node): boolean {
      const ids = new Set<string>();
      collectIdentifiers(body, ids, true);
      for (const id of ids) {
        for (const pattern of coordinatorPatterns) {
          if (matchesPattern(id, pattern)) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Checks whether the loop body contains a call to a rate-limiting
     * function (e.g. sleep, delay, throttle). When present, sequential
     * execution is almost certainly intentional.
     *
     * Uses exact case-insensitive matching (not substring) to avoid
     * false positives.
     */
    function hasRateLimitedCallInBody(body: TSESTree.Node): boolean {
      const ids = new Set<string>();
      collectIdentifiers(body, ids, true);
      for (const id of ids) {
        for (const pattern of rateLimitedPatterns) {
          if (id.toLowerCase() === pattern.toLowerCase()) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Collects all variables declared INSIDE the loop body, including inside
     * callbacks written there. These are iteration-local variables: nothing
     * they hold outlives the iteration that created them.
     *
     * The walk crosses nested function boundaries because the write scan that
     * consults this set crosses them too. A name both declared and assigned
     * inside a callback (`async () => { let tmp; tmp = 1; }`) publishes nothing
     * to the enclosing scope, so if the set stopped at the boundary the write
     * would read as a cross-iteration dependency and silence the loop. (#1724)
     */
    function collectLoopLocalVars(body: TSESTree.Node): Set<string> {
      const localVars = new Set<string>();

      function visit(node: TSESTree.Node, isRoot: boolean): void {
        // A callback's parameters bind afresh on every invocation, so a write
        // through one (`async (page) => { page.total = 1 }`) reaches whatever
        // the caller handed that call rather than state the iterations share.
        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          for (const param of node.params) {
            collectBindingNames(
              param as TSESTree.DestructuringPattern,
              localVars,
            );
          }
        }

        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declarations) {
            collectBindingNames(declarator.id, localVars);
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  visit(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              visit(child as TSESTree.Node, false);
            }
          }
        }
      }

      visit(body, true);
      return localVars;
    }

    /**
     * Collects the BINDINGS an assignment target writes through, returning
     * false when the target's root is not a plain binding at all.
     *
     * A member write reaches the object its ROOT names: `box.value = 1` writes
     * through `box`, and `value` is a field label that binds nothing — the same
     * distinction drawn for a non-computed property key (#1688). Counting the
     * label as a written name makes every member write look like a write to an
     * outer binding, which is what hides a callback writing through its own
     * parameter (`async (page) => { page.total = 1 }`).
     *
     * A root the analysis cannot name — `this.count += 1` reaches instance
     * state every iteration shares — returns false, and the caller reads that
     * as an outer write. The plugin prefers a missed report to a spurious one.
     */
    function collectAssignmentTargetNames(
      target: TSESTree.Node,
      names: Set<string>,
    ): boolean {
      switch (target.type) {
        case AST_NODE_TYPES.Identifier:
          names.add(target.name);
          return true;

        case AST_NODE_TYPES.MemberExpression:
          return collectAssignmentTargetNames(target.object, names);

        case AST_NODE_TYPES.ChainExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSAsExpression:
          return collectAssignmentTargetNames(target.expression, names);

        case AST_NODE_TYPES.ObjectPattern: {
          let resolved = true;
          for (const property of target.properties) {
            const inner =
              property.type === AST_NODE_TYPES.RestElement
                ? property.argument
                : property.value;
            if (!collectAssignmentTargetNames(inner, names)) resolved = false;
          }
          return resolved;
        }

        case AST_NODE_TYPES.ArrayPattern: {
          let resolved = true;
          for (const element of target.elements) {
            if (element && !collectAssignmentTargetNames(element, names)) {
              resolved = false;
            }
          }
          return resolved;
        }

        case AST_NODE_TYPES.RestElement:
          return collectAssignmentTargetNames(target.argument, names);

        case AST_NODE_TYPES.AssignmentPattern:
          return collectAssignmentTargetNames(target.left, names);

        default:
          return false;
      }
    }

    /**
     * Detects cross-iteration state patterns that require sequential
     * execution:
     *
     * 1. Accumulator: a variable declared OUTSIDE the loop body (i.e., not
     *    in localVars) is ASSIGNED inside the loop body, whether directly or
     *    from inside a callback the body hands to the awaited call. Examples:
     *    `total += value`, `cursor = page.nextCursor`, `previousResult =
     *    result`. This catches running totals, pagination cursors, and chained
     *    results.
     *
     * 2. Direct cross-await dependency: a variable declared by an await
     *    inside the loop is then read as an argument to another await in the
     *    same loop body. Example: `const a = await f(); const b = await g(a);`.
     */
    function hasSequentialDependency(
      body: TSESTree.Node,
      loopLocalVars: Set<string>,
    ): boolean {
      // Pattern 1: outer variable is written inside the loop body.
      // Collect every assignment target — the left-hand side of an assignment
      // or compound assignment, and the operand of an increment in a callback.
      let foundOuterWrite = false;

      /**
       * Reports whether an assignment target reaches a binding the iterations
       * share rather than one the iteration creates.
       */
      function writesOuterBinding(target: TSESTree.Node): boolean {
        const names = new Set<string>();
        if (!collectAssignmentTargetNames(target, names)) return true;
        for (const name of names) {
          if (!loopLocalVars.has(name)) return true;
        }
        return false;
      }

      function findOuterWrites(
        node: TSESTree.Node,
        isRoot: boolean,
        inNestedFunction: boolean,
      ): void {
        if (foundOuterWrite) return;

        // The walk deliberately enters callbacks. A write handed to the awaited
        // call is the same data dependency as one written beside it:
        // `await run(item, async (page) => { cursor = page.nextCursor })` has
        // settled — and published `cursor` — by the time the iteration ends, so
        // parallel iterations would race exactly as they would over
        // `cursor = await run(item, cursor)`. (#1724)
        const isNested =
          inNestedFunction ||
          (!isRoot &&
            (node.type === AST_NODE_TYPES.FunctionDeclaration ||
              node.type === AST_NODE_TYPES.FunctionExpression ||
              node.type === AST_NODE_TYPES.ArrowFunctionExpression));

        if (
          node.type === AST_NODE_TYPES.AssignmentExpression &&
          writesOuterBinding(node.left)
        ) {
          foundOuterWrite = true;
          return;
        }

        // An increment counts only inside a callback. At the loop-body level it
        // is the loop's own step counter — `while (i < n) { await f(items[i]);
        // i++; }` walks the iteration space, and the `Promise.all(items.map(
        // ...))` rewrite subsumes it — whereas a callback steps no iteration:
        // `count++` there folds what the awaited work produced into a binding
        // the whole loop shares, carrying the same dependency as the compound
        // assignment it stands in for. (#1724)
        if (
          isNested &&
          node.type === AST_NODE_TYPES.UpdateExpression &&
          writesOuterBinding(node.argument)
        ) {
          foundOuterWrite = true;
          return;
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  findOuterWrites(item as TSESTree.Node, false, isNested);
                }
              }
            } else if ('type' in (child as object)) {
              findOuterWrites(child as TSESTree.Node, false, isNested);
            }
          }
        }
      }

      findOuterWrites(body, true, false);
      if (foundOuterWrite) return true;

      // Pattern 2: a variable declared by an await is used as arg to another await.
      const awaitDeclaredVars = new Set<string>();

      function collectAwaitDeclVars(
        node: TSESTree.Node,
        isRoot: boolean,
      ): void {
        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of node.declarations) {
            if (
              declarator.init &&
              declarator.init.type === AST_NODE_TYPES.AwaitExpression
            ) {
              collectBindingNames(declarator.id, awaitDeclaredVars);
            }
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  collectAwaitDeclVars(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              collectAwaitDeclVars(child as TSESTree.Node, false);
            }
          }
        }
      }

      collectAwaitDeclVars(body, true);

      if (awaitDeclaredVars.size === 0) return false;

      let foundCrossAwaitDep = false;

      function findCrossAwaitDep(node: TSESTree.Node, isRoot: boolean): void {
        if (foundCrossAwaitDep) return;

        if (
          !isRoot &&
          (node.type === AST_NODE_TYPES.FunctionDeclaration ||
            node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression)
        ) {
          return;
        }

        if (node.type === AST_NODE_TYPES.AwaitExpression) {
          const argIds = new Set<string>();
          collectIdentifiers(node.argument, argIds, false);
          for (const varName of awaitDeclaredVars) {
            if (argIds.has(varName)) {
              foundCrossAwaitDep = true;
              return;
            }
          }
        }

        for (const key in node) {
          if (
            key === 'parent' ||
            key === 'range' ||
            key === 'loc' ||
            key === 'type'
          )
            continue;
          const child = (node as unknown as Record<string, unknown>)[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === 'object' && 'type' in item) {
                  findCrossAwaitDep(item as TSESTree.Node, false);
                }
              }
            } else if ('type' in (child as object)) {
              findCrossAwaitDep(child as TSESTree.Node, false);
            }
          }
        }
      }

      findCrossAwaitDep(body, true);
      return foundCrossAwaitDep;
    }

    /**
     * Extracts all binding names from a pattern (handles identifiers,
     * object/array destructuring, rest elements, etc.).
     */
    function collectBindingNames(
      pattern: TSESTree.DestructuringPattern | TSESTree.BindingName,
      names: Set<string>,
    ): void {
      switch (pattern.type) {
        case AST_NODE_TYPES.Identifier:
          names.add(pattern.name);
          break;
        case AST_NODE_TYPES.ObjectPattern:
          for (const prop of pattern.properties) {
            if (prop.type === AST_NODE_TYPES.Property) {
              collectBindingNames(
                prop.value as TSESTree.DestructuringPattern,
                names,
              );
            } else if (prop.type === AST_NODE_TYPES.RestElement) {
              collectBindingNames(
                prop.argument as TSESTree.DestructuringPattern,
                names,
              );
            }
          }
          break;
        case AST_NODE_TYPES.ArrayPattern:
          for (const el of pattern.elements) {
            if (el)
              collectBindingNames(el as TSESTree.DestructuringPattern, names);
          }
          break;
        case AST_NODE_TYPES.RestElement:
          collectBindingNames(
            pattern.argument as TSESTree.DestructuringPattern,
            names,
          );
          break;
        case AST_NODE_TYPES.AssignmentPattern:
          collectBindingNames(
            pattern.left as TSESTree.DestructuringPattern,
            names,
          );
          break;
      }
    }

    /**
     * Walks the loop body looking for the first AwaitExpression that belongs to
     * THIS loop — one that sits in neither a nested function nor a nested loop.
     * Returns the first such AwaitExpression found, or null if none exists.
     */
    function findDirectAwait(
      node: TSESTree.Node,
      isRoot: boolean,
    ): TSESTree.AwaitExpression | null {
      // Do not cross into nested functions; their awaits belong to a
      // different async scope
      if (
        !isRoot &&
        (node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression ||
          node.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        return null;
      }

      // An await inside a nested loop belongs to that loop, which gets its own
      // visit and its own verdict. Claiming it here would anchor a second report
      // on the very same await, and would judge it against the wrong body: the
      // enclosing loop's barriers say nothing about whether the inner
      // iterations can run together. The innermost loop owns the report. (#1688)
      if (!isRoot && LOOP_NODE_TYPES.has(node.type)) {
        return null;
      }

      if (node.type === AST_NODE_TYPES.AwaitExpression) {
        return node;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                const result = findDirectAwait(item as TSESTree.Node, false);
                if (result) return result;
              }
            }
          } else if ('type' in (child as object)) {
            const result = findDirectAwait(child as TSESTree.Node, false);
            if (result) return result;
          }
        }
      }

      return null;
    }

    /**
     * Reports whether a node contains a CallExpression anywhere inside it.
     * Nested functions are deliberately traversed: a call written inside a
     * callback in a loop clause (`items.some(() => check())`) still makes the
     * clause's value depend on invoking something.
     */
    function containsCallExpression(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        return true;
      }

      for (const key in node) {
        if (
          key === 'parent' ||
          key === 'range' ||
          key === 'loc' ||
          key === 'type'
        )
          continue;
        const child = (node as unknown as Record<string, unknown>)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                if (containsCallExpression(item as TSESTree.Node)) return true;
              }
            }
          } else if ('type' in (child as object)) {
            if (containsCallExpression(child as TSESTree.Node)) return true;
          }
        }
      }

      return false;
    }

    /**
     * Reports whether the loop's own continuation machinery invokes a
     * function — a call in a `while` test, or in a `for` test or update clause.
     *
     * Such a loop runs until an observation comes back a certain way, so the
     * iteration count is a function of what each iteration does:
     * `while (!hasSettled()) { await tick(); }` and
     * `for (let i = 0; i < 100 && !findTimer(); i += 1)` both re-read state the
     * awaited work advances. `Promise.all` has to know the iteration count up
     * front, so there is no parallel form of these loops at all. Only the
     * clauses re-evaluated on every iteration count; a `for` loop's `init` and a
     * `for...of` loop's `right` run once, so a call there says nothing about
     * cross-iteration coupling (`for (const [k, v] of map.entries())` keeps its
     * enforcement). A `do...while` test is re-evaluated exactly like a `while`
     * test, so it carries the same meaning. (#1687, #1688)
     */
    function isConditionCoupled(loopNode: LoopNode): boolean {
      if (
        loopNode.type === AST_NODE_TYPES.WhileStatement ||
        loopNode.type === AST_NODE_TYPES.DoWhileStatement
      ) {
        return containsCallExpression(loopNode.test);
      }

      if (loopNode.type === AST_NODE_TYPES.ForStatement) {
        return (
          (!!loopNode.test && containsCallExpression(loopNode.test)) ||
          (!!loopNode.update && containsCallExpression(loopNode.update))
        );
      }

      return false;
    }

    /**
     * Collects every identifier named in the loop's head — the `for...of`/
     * `for...in` left and right, the `for` init, test and update, or the
     * `while`/`do...while` test. These are the names an iteration can hand to
     * the body.
     */
    function collectLoopHeadIdentifiers(loopNode: LoopNode): Set<string> {
      const names = new Set<string>();
      const clauses: (TSESTree.Node | null)[] =
        loopNode.type === AST_NODE_TYPES.ForStatement
          ? [loopNode.init, loopNode.test, loopNode.update]
          : loopNode.type === AST_NODE_TYPES.WhileStatement ||
            loopNode.type === AST_NODE_TYPES.DoWhileStatement
          ? [loopNode.test]
          : [loopNode.left, loopNode.right];

      for (const clause of clauses) {
        if (clause) collectIdentifiers(clause, names, false);
      }
      return names;
    }

    /**
     * Reports whether the loop body is a single discarded `await` of a call
     * that consumes nothing the iteration produces, e.g.
     * `for (let i = 0; i < 21; i += 1) { await postSuggestion(); }`.
     *
     * Such a loop passes nothing from the iteration into the call and keeps
     * nothing the call returns, so the only reason to write it is an ordered
     * side effect the callee owns — replaying one entrypoint so each run
     * observes what the previous run stored. Every barrier below reads syntax
     * inside the body, and this body has none to read: no assignment, no
     * binding, no control flow, and no identifier but the callee. Reporting it
     * would be a verdict passed on zero evidence, and the plugin prefers a
     * false negative to a false positive.
     *
     * A call that names anything from the loop head is excluded, because that
     * name IS the evidence: `for (const doc of snap.docs) { await
     * doc.ref.delete(); }` takes no arguments either, yet each iteration
     * addresses its own document and the loop is exactly the shape the rule
     * exists to flag. (#1687)
     */
    function isBareDiscardedZeroArgCall(loopNode: LoopNode): boolean {
      const { body } = loopNode;
      const statements =
        body.type === AST_NODE_TYPES.BlockStatement ? body.body : [body];
      if (statements.length !== 1) return false;

      const [statement] = statements;
      if (statement.type !== AST_NODE_TYPES.ExpressionStatement) return false;
      if (statement.expression.type !== AST_NODE_TYPES.AwaitExpression) {
        return false;
      }

      const { argument } = statement.expression;
      const callExpr =
        argument.type === AST_NODE_TYPES.ChainExpression
          ? argument.expression
          : argument;

      if (
        callExpr.type !== AST_NODE_TYPES.CallExpression ||
        callExpr.arguments.length !== 0
      ) {
        return false;
      }

      const headNames = collectLoopHeadIdentifiers(loopNode);
      const callNames = new Set<string>();
      collectIdentifiers(callExpr, callNames, false);
      for (const name of callNames) {
        if (headNames.has(name)) return false;
      }

      return true;
    }

    /**
     * Central analysis for a loop node. Returns the AwaitExpression to
     * report on, or null if the loop should not be flagged.
     */
    function analyzeLoop(loopNode: LoopNode): TSESTree.AwaitExpression | null {
      const body = loopNode.body;
      if (!body) return null;

      // Exclusion: `for await (const x of stream)` consumes an async iterable,
      // which the language pulls one value at a time; the sequencing is the
      // construct's meaning rather than an oversight.
      if (
        loopNode.type === AST_NODE_TYPES.ForOfStatement &&
        loopNode.await === true
      ) {
        return null;
      }

      // Exclusion: the loop's continuation condition or update invokes a
      // function, so how many iterations run depends on what they do
      if (isConditionCoupled(loopNode)) return null;

      // Exclusion: the body is a lone discarded await of a zero-argument call,
      // which carries no evidence either way
      if (isBareDiscardedZeroArgCall(loopNode)) return null;

      // Find an await directly inside the loop body (not in nested async fns)
      const awaitExpr = findDirectAwait(body, true);
      if (!awaitExpr) return null;

      // Exclusion: loop body contains a coordinator (batch, transaction, etc.)
      if (hasCoordinatorInBody(body)) return null;

      // Exclusion: loop body contains a rate-limiting call (sleep, delay, etc.)
      if (hasRateLimitedCallInBody(body)) return null;

      // Exclusion: the await is inside a try/catch — per-iteration error
      // handling implies intentional sequential execution
      if (isAwaitInTryCatch(awaitExpr, loopNode)) return null;

      // Exclusion: loop body contains break/continue/return — control flow
      // depends on async result
      if (containsBreakContinueReturn(body)) return null;

      // Exclusion: accumulator / pagination patterns — sequential dependency
      // detected between iterations
      const loopLocalVars = collectLoopLocalVars(body);
      if (hasSequentialDependency(body, loopLocalVars)) return null;

      // Exclusion: the specific await being reported is a rate-limiting call
      const callNames = getCallNames(awaitExpr);
      for (const name of callNames) {
        for (const pattern of rateLimitedPatterns) {
          if (name.toLowerCase() === pattern.toLowerCase()) return null;
        }
      }

      return awaitExpr;
    }

    function checkLoop(loopNode: LoopNode): void {
      const awaitExpr = analyzeLoop(loopNode);
      if (awaitExpr) {
        context.report({
          node: awaitExpr,
          messageId: 'parallelizeLoopAwaits',
        });
      }
    }

    return {
      ForOfStatement: checkLoop,
      ForInStatement: checkLoop,
      ForStatement: checkLoop,
      WhileStatement: checkLoop,
      // A `do...while` repeats one body per iteration exactly as the other four
      // forms do; it is the same target and earns the same analysis. (#1688)
      DoWhileStatement: checkLoop,
    };
  },
});
