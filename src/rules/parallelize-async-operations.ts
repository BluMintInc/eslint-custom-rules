import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';
import { compilePatternOption } from '../utils/compilePatternOption';

type MessageIds = 'parallelizeAsyncOperations';
type Options = [
  {
    sideEffectPatterns?: Array<string | RegExp>;
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
 * not apply to it. Its awaits instead encode ordering: `await` an interaction,
 * then `await` an assertion that observes the DOM state the interaction
 * produced. That dependency is a side effect rather than a value, so it is
 * invisible to the syntactic barriers below, and Promise.all would race the
 * assertion against the interaction (issue #1395).
 */
const isTestFile = (filename: string) =>
  TEST_FILE_SUFFIX.test(filename) || TEST_FILE_DIRECTORY.test(filename);

const defaultOptions: Options = [
  {
    ignoreTestFiles: true,
    sideEffectPatterns: [
      'updatecounter',
      'setcounter',
      'incrementcounter',
      'decrementcounter',
      'updatethreshold',
      'setthreshold',
      'checkthreshold',
      'commit',
      'flush',
      'saveall',
    ],
  },
];

export const parallelizeAsyncOperations = createRule<Options, MessageIds>({
  name: 'parallelize-async-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially',
      recommended: 'error',
    },
    fixable: 'code',
    // `defaultOptions` above is the single source of truth for defaults; the
    // schema deliberately declares none. ESLint validates rule options with an
    // ajv instance configured `useDefaults: true`, which writes schema defaults
    // INTO the supplied options object before `defaultOptions` are merged. A
    // schema `default: []` on sideEffectPatterns therefore erases the built-in
    // side-effect patterns for any consumer who passes an options object at all
    // -- including one that only sets `ignoreTestFiles` -- so `commit`, `flush`,
    // and the counter patterns stop acting as ordering barriers and the rule
    // reports the very sequences it is meant to leave alone.
    schema: [
      {
        type: 'object',
        properties: {
          sideEffectPatterns: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                { type: 'object', instanceof: 'RegExp' },
              ],
            },
          },
          ignoreTestFiles: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      parallelizeAsyncOperations:
        'Awaiting {{awaitCount}} independent async operations sequentially makes their network and I/O latency add up, which slows responses and wastes compute. These awaits have no data dependency or per-call error handling, so run them together with Promise.all([...]) and destructure the results when you need individual values.',
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

    const sourceCode = context.sourceCode;
    // Compiling with a bare `new RegExp` throws while the rule is being built,
    // which aborts the whole lint run — every file, every other rule — with a
    // message naming neither this option nor the offending pattern. The schema
    // admits any string, so `'**'` reaches here from a valid config.
    const declaredPatterns = options?.sideEffectPatterns ?? [];
    const sideEffectMatchers = [
      ...compilePatternOption(
        'parallelize-async-operations',
        'sideEffectPatterns',
        declaredPatterns.filter(
          (pattern): pattern is string => typeof pattern === 'string',
        ),
        'i',
      ),
      ...declaredPatterns.filter(
        (pattern): pattern is RegExp => typeof pattern !== 'string',
      ),
    ];
    const reportedRanges = new Set<string>();
    /**
     * Checks if a node is an await expression
     */
    function isAwaitExpression(
      node: TSESTree.Node,
    ): node is TSESTree.AwaitExpression {
      return node.type === AST_NODE_TYPES.AwaitExpression;
    }

    /**
     * Checks if a node is a variable declaration with an await expression initializer
     */
    function isVariableDeclarationWithAwait(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.VariableDeclaration) {
        return false;
      }

      return node.declarations.some(
        (declaration) =>
          declaration.init && isAwaitExpression(declaration.init),
      );
    }

    /**
     * Checks if a node is an expression statement with an await expression
     */
    function isExpressionStatementWithAwait(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.ExpressionStatement &&
        node.expression.type === AST_NODE_TYPES.AwaitExpression
      );
    }

    /**
     * Extracts the await expression from a node
     */
    function getAwaitExpression(
      node: TSESTree.Node,
    ): TSESTree.AwaitExpression | null {
      if (isAwaitExpression(node)) {
        return node;
      }

      if (
        node.type === AST_NODE_TYPES.ExpressionStatement &&
        isAwaitExpression(node.expression)
      ) {
        return node.expression;
      }

      if (node.type === AST_NODE_TYPES.VariableDeclaration) {
        for (const declaration of node.declarations) {
          if (declaration.init && isAwaitExpression(declaration.init)) {
            return declaration.init;
          }
        }
      }

      return null;
    }

    /**
     * Generic AST visitor for identifier collection.
     *
     * An ECMA private name (`this.#batchManager`) is a member name like any
     * other, so it is collected under the SIGIL-BEARING spelling `#name`. The
     * sigil is what keeps the two vocabularies apart: a declared variable and a
     * public member can both be spelled `batchManager`, and the barriers that
     * consume these names compare them for identity, so an unsigiled key would
     * fuse `this.#batchManager` with an unrelated local of the same name. It
     * also reproduces the `private` spelling's behaviour exactly -- a
     * non-computed member property is skipped unless `includeMemberProperties`
     * asks for it, and `#name` can never equal a variable name -- while making
     * the coordinator barrier see a coordinator held in a private field.
     * (#1938)
     */
    function visitIdentifiers(
      node: TSESTree.Node,
      callback: (name: string) => boolean | void,
      options: { includeMemberProperties?: boolean } = {},
    ): boolean {
      if (node.type === AST_NODE_TYPES.PrivateIdentifier) {
        const parent = node.parent;
        const isMemberProperty =
          parent?.type === AST_NODE_TYPES.MemberExpression &&
          parent.property === node;
        if (!isMemberProperty || options.includeMemberProperties) {
          if (callback(`#${node.name}`) === true) return true;
        }
      }

      if (node.type === AST_NODE_TYPES.Identifier) {
        const parent = node.parent;

        // Skip non-computed properties in MemberExpressions as they are not value uses
        if (parent && parent.type === AST_NODE_TYPES.MemberExpression) {
          if (
            parent.property === node &&
            !parent.computed &&
            !options.includeMemberProperties
          ) {
            return false;
          }
        }

        // Skip non-shorthand keys in object literals as they are not value uses
        if (parent && parent.type === AST_NODE_TYPES.Property) {
          if (parent.key === node && !parent.computed && !parent.shorthand) {
            return false;
          }
        }

        if (callback(node.name) === true) return true;
      }

      /**
       * Recursively traverses child nodes while skipping 'parent' to avoid
       * circular back-references, and 'range'/'loc' which are metadata.
       */
      for (const key in node) {
        if (key === 'parent' || key === 'range' || key === 'loc') continue;

        const child = (node as any)[key];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                if (
                  visitIdentifiers(item as TSESTree.Node, callback, options)
                ) {
                  return true;
                }
              }
            }
          } else if ('type' in child) {
            if (visitIdentifiers(child as TSESTree.Node, callback, options)) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Checks if an identifier is used in a node
     */
    function isIdentifierUsedInNode(
      identifier: string,
      node: TSESTree.Node,
    ): boolean {
      return visitIdentifiers(node, (name) => name === identifier);
    }

    /**
     * Extracts all identifiers used in a node
     */
    function getAllIdentifiers(
      node: TSESTree.Node,
      options?: { includeMemberProperties?: boolean },
    ): Set<string> {
      const identifiers = new Set<string>();
      visitIdentifiers(
        node,
        (name) => {
          identifiers.add(name);
        },
        options,
      );
      return identifiers;
    }

    /**
     * Matches coordinator-like identifiers. Intentionally uses substring
     * matching (no word boundaries) to catch patterns like "batchManager",
     * "transactionCollector", etc. This may produce false positives for
     * unrelated managers, but errs on the side of safety.
     */
    const COORDINATOR_PATTERN =
      /batch|manager|collector|transaction|tx|coordinator|unitofwork|accumulator|aggregator/i;

    /**
     * Matches guard/assertion callees by their leading verb. Anchored at the
     * start so it fires on the callee's own verb (assertStartable,
     * validateInput, ensureExists, requireAuth, checkAccess, verifyOwnership,
     * guardAgainstX) rather than on an arbitrary substring elsewhere in the
     * name.
     */
    const GUARD_PATTERN =
      /^(assert|ensure|require|validate|verify|guard|check)/i;

    /**
     * Matches state re-read callees by their leading verb. A refetch/refresh
     * that follows a preceding await exists to re-observe state a prior await
     * may have mutated (e.g. `await unlinkProvider(...)` then `await
     * refreshUser()`, where refreshUser re-reads the post-unlink server state).
     * Running such a pair through Promise.all races the refetch ahead of / in
     * parallel with the mutation, so a refresh that resolves first repopulates
     * the just-mutated state -- a genuine correctness bug. Anchored at the
     * start so it fires on the callee's own verb (refreshUser, reloadData,
     * refetchProfile) rather than on an arbitrary substring elsewhere in the
     * name (getRefreshToken must NOT match).
     */
    const REFETCH_PATTERN = /^(refresh|reload|refetch|revalidate|resync|sync)/i;

    /**
     * Matches navigation callees by their leading verb. A route transition is an
     * ordering barrier rather than a data dependency: the awaits around it are
     * sequenced so their side effects land on the intended page. `await
     * push(url)` followed by `await acceptInvite(...)` is written that way so the
     * accept flow's dialogs mount on the destination page; Promise.all starts the
     * accept flow concurrently with the route transition, so its dialogs open on
     * the source page and are unmounted mid-navigation. The reverse order is
     * equally load-bearing -- parallelizing `await save()` with a following
     * `await push(url)` can navigate away before the save settles -- so a
     * navigation anywhere in the run blocks the whole run. Anchored at the start
     * so it fires on the callee's own verb (pushRoute, navigateTo,
     * redirectToLogin) rather than on an arbitrary substring elsewhere in the
     * name.
     */
    const NAVIGATION_PATTERN =
      /^(push|replace|navigate|redirect|reroute|goto)/i;

    /**
     * Matches router-like receivers so that every method invoked on one counts
     * as navigation (`router.back()`, `history.go(-1)`, `navigation.reset()`).
     * Keyed on the receiver rather than the method because the remaining history
     * verbs (back, forward, go) are far too generic to match on their own.
     */
    const NAVIGATION_RECEIVER_PATTERN = /^(router|history|navigation|nav)$/i;

    /**
     * Checks whether an awaited call performs a route transition.
     *
     * The receiver pattern is anchored at both ends, so it recognizes a router
     * held in a bare binding and leaves every multi-segment receiver key to the
     * method-name test below.
     */
    function isNavigationCall(awaitExpr: TSESTree.AwaitExpression): boolean {
      const receiverKey = getCalleeReceiverKey(awaitExpr);
      if (receiverKey && NAVIGATION_RECEIVER_PATTERN.test(receiverKey)) {
        return true;
      }

      const methodName = getCalleeMethodName(awaitExpr);
      return !!methodName && NAVIGATION_PATTERN.test(methodName);
    }

    /**
     * Extracts the callee's method name (the identifier bearing the leading
     * verb) from an await expression argument. Handles both direct
     * CallExpressions and optional-call ChainExpressions, and both bare
     * identifier callees and member-expression callees.
     *
     * An ECMA private method (`this.#commit()`) yields the BARE name, without
     * the `#` sigil: the verb patterns this feeds (guard, refetch, navigation,
     * side-effect) are anchored at the start, so a sigil-bearing key would
     * defeat every one of them, and `#commit` names the same operation
     * `commit` does. The name is only ever regex-tested here, never compared
     * for identity against another member's name, so dropping the sigil cannot
     * fuse `#commit` with a sibling public `commit`. (#1938)
     */
    function getCalleeMethodName(
      awaitExpr: TSESTree.AwaitExpression,
    ): string | null {
      let callExpr: TSESTree.CallExpression | null = null;
      if (awaitExpr.argument.type === AST_NODE_TYPES.CallExpression) {
        callExpr = awaitExpr.argument;
      } else if (
        awaitExpr.argument.type === AST_NODE_TYPES.ChainExpression &&
        awaitExpr.argument.expression.type === AST_NODE_TYPES.CallExpression
      ) {
        callExpr = awaitExpr.argument.expression;
      }

      if (!callExpr) {
        return null;
      }

      const callee = callExpr.callee;
      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        (callee.property.type === AST_NODE_TYPES.Identifier ||
          callee.property.type === AST_NODE_TYPES.PrivateIdentifier)
      ) {
        return callee.property.name;
      }
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name;
      }
      return null;
    }

    /**
     * Names the member a `MemberExpression` accesses, when that member denotes
     * a FIXED path segment: a non-computed property (`api.users`) or a computed
     * string-literal key (`api['users']`). Both spell the same slot, so they
     * yield the same segment and compare equal.
     *
     * An ECMA private member (`this.#ref`) is a fixed slot like any other, so
     * it yields a segment too. `PrivateIdentifier.name` carries the bare word,
     * so the sigil is restored to keep `this.#ref` and `this.ref` -- two
     * members a class can declare at once -- on distinct keys. The one shape
     * that then collides is the computed string `this['#ref']`, which reads a
     * string-keyed slot rather than the private one; a collision can only make
     * two awaits look like they share a receiver, which ADDS a barrier, the
     * direction this rule's trade-off already prefers. (#1938)
     *
     * A numeric or dynamic index (`operations[0]`, `operations[i]`) yields null:
     * it selects a distinct element from a container rather than reaching a
     * fixed slot on a stateful object, so two such accesses carry no shared
     * receiver even when their subscripts are written identically.
     */
    function getMemberSegment(
      member: TSESTree.MemberExpression,
    ): string | null {
      const property = member.property;
      if (member.computed) {
        return property.type === AST_NODE_TYPES.Literal &&
          typeof property.value === 'string'
          ? property.value
          : null;
      }
      if (property.type === AST_NODE_TYPES.PrivateIdentifier) {
        return `#${property.name}`;
      }
      return property.type === AST_NODE_TYPES.Identifier ? property.name : null;
    }

    /**
     * The key both `this` and `super` mint. They name the SAME object: `super.m()`
     * and `this.m()` invoke against the same instance and differ only in where
     * method lookup starts, so for an ordering question they are one receiver and
     * a run that mixes the spellings carries the same read-after-write hazard as
     * either spelling alone. Collapsing them can only ADD barriers, never remove
     * one, which is the direction the rule's trade-off prefers. (#1923)
     *
     * The merge is confined to the chain ROOT, so two different slots reached
     * from that instance (`super.users` versus `this.posts`) stay distinct.
     */
    const INSTANCE_RECEIVER_KEY = 'this';

    /**
     * Strips the wrappers that punctuate an expression without changing which
     * value it denotes, so one path is recognized however it is spelled
     * (`a.b`, `a?.b`, `a!.b`, `(a as T).b`).
     */
    function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
      let current: TSESTree.Node = node;
      while (
        current.type === AST_NODE_TYPES.ChainExpression ||
        current.type === AST_NODE_TYPES.TSNonNullExpression ||
        current.type === AST_NODE_TYPES.TSAsExpression
      ) {
        current = current.expression;
      }
      return current;
    }

    /**
     * Walks a member chain down to the expression it is rooted at: the binding,
     * the instance, or whatever else the chain starts from.
     */
    function getPathRoot(node: TSESTree.Node): TSESTree.Node {
      let root = unwrapExpression(node);
      while (root.type === AST_NODE_TYPES.MemberExpression) {
        root = unwrapExpression(root.object);
      }
      return root;
    }

    /**
     * Builds a stable textual key for the object a method is invoked on, so two
     * awaits can be compared for "same receiver" by string equality.
     *
     * Every receiver form that denotes ONE statically-known object gets a key:
     * a bare identifier (`svc`), the instance (`this`/`super`), and a chain of
     * fixed segments over any of those (`this.inner`, `a.b.c`). The chain is
     * spelled out in full so that `this.inner.x()` and `this.inner.y()` share a
     * receiver while `this.inner.x()` and `this.other.y()` do not. Deriving the
     * instance key at the root is what makes `super.inner.x()` and
     * `this.inner.y()` compose into one key without special-casing the bare form.
     *
     * `this` and `super` are reserved words, so no identifier can be spelled
     * either one and no bare-binding chain can be rooted at the instance key. A
     * path segment may spell a reserved word (`api.this`), but a segment only
     * ever appears after a `${objectKey}.` prefix, so it cannot produce the
     * unprefixed instance key.
     *
     * Returns null for a receiver whose identity is not statically known: a
     * call in the chain (`realtimeDb.ref(path).remove()`) can produce a
     * different object per invocation, and a dynamic subscript
     * (`handlers[i].run()`) selects a different element per subscript, so
     * neither denotes state two awaits demonstrably share.
     *
     * Optional chaining and non-null assertions are spellings of the same path
     * (`this.inner?.x()`, `this.inner!.x()`), so they unwrap to the same key --
     * matching MemberExpression alone would leave the barrier blind to them.
     */
    function getReceiverKey(node: TSESTree.Node): string | null {
      switch (node.type) {
        case AST_NODE_TYPES.Identifier:
          return node.name;

        case AST_NODE_TYPES.ThisExpression:
        case AST_NODE_TYPES.Super:
          return INSTANCE_RECEIVER_KEY;

        case AST_NODE_TYPES.ChainExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
          return getReceiverKey(node.expression);

        case AST_NODE_TYPES.MemberExpression: {
          const objectKey = getReceiverKey(node.object);
          if (objectKey === null) {
            return null;
          }
          const segment = getMemberSegment(node);
          return segment === null ? null : `${objectKey}.${segment}`;
        }

        default:
          return null;
      }
    }

    /**
     * Reports whether a receiver key names a slot reached from the INSTANCE
     * rather than from a bare binding. `this` and `super` are reserved words, so
     * no binding can be spelled the instance key and a path segment only ever
     * appears after a `${objectKey}.` prefix -- the test is therefore exact
     * rather than heuristic. (#1924)
     */
    function isInstancePathKey(key: string): boolean {
      return (
        key === INSTANCE_RECEIVER_KEY ||
        key.startsWith(`${INSTANCE_RECEIVER_KEY}.`)
      );
    }

    /**
     * Builds the path key of an instance-rooted member expression
     * (`this.mutator`, `super.state.mutator`), or null when the expression does
     * not reach instance state.
     *
     * A PATH key, not a bare name, is what makes an instance write usable as an
     * ordering barrier. Keying on the receiver alone would fuse `this.alpha` and
     * `this.beta` into one slot and barrier every run that touches the instance
     * twice; keying on the property name alone would barrier a later await that
     * merely mentions a same-spelled local. The full path distinguishes both.
     *
     * A dynamic segment (`this.rows[i]`) hides WHICH slot is reached, so the key
     * truncates to the longest fixed prefix (`this.rows`). For an ordering
     * question a prefix is the conservative answer: it overlaps every path
     * beneath it, so the barrier still engages.
     *
     * An ECMA private segment is NOT such a case: `this.#mutator` names its slot
     * exactly, so it keys in full and two disjoint private slots stay
     * parallelizable -- the same answer the `private` spelling of those members
     * already gets. This is the one consumer of getMemberSegment where naming a
     * segment narrows a key rather than widening one, so it is also the only
     * place recognizing `#` can turn silence into a report; the overlapping
     * case (`this.#state` written, `this.#state.mutator` read) still matches.
     * (#1938)
     *
     * Bare-identifier roots yield null. They are already covered by the
     * root-binding behaviour of collectAssignmentTarget, and re-keying them by
     * path would NARROW that coverage into MORE reports -- the wrong direction
     * for a rule that prefers a missed parallelization over a silent reorder.
     */
    function getInstancePathKey(node: TSESTree.Node): string | null {
      const key = getReceiverKey(node);
      if (key !== null) {
        return isInstancePathKey(key) ? key : null;
      }

      // getReceiverKey refuses the whole chain when any segment is dynamic;
      // dropping the outermost layer and retrying recovers the fixed prefix.
      switch (node.type) {
        case AST_NODE_TYPES.ChainExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSAsExpression:
          return getInstancePathKey(node.expression);

        case AST_NODE_TYPES.MemberExpression:
          return getInstancePathKey(node.object);

        default:
          return null;
      }
    }

    /**
     * Reports whether a write to one instance path can be observed through a
     * read of another. Equal paths alias; so do a path and any path BENEATH it,
     * in both directions -- writing `this.state` replaces the object a later
     * `this.state.mutator` reads, and writing `this.state.mutator` changes what
     * a later `this.state` hands to whoever receives it. Disjoint slots
     * (`this.alpha` versus `this.beta`) do not alias, which is what keeps
     * genuinely independent instance work parallelizable. (#1924)
     */
    function instancePathsOverlap(written: string, read: string): boolean {
      return (
        written === read ||
        read.startsWith(`${written}.`) ||
        written.startsWith(`${read}.`)
      );
    }

    /**
     * Collects every instance-rooted path an expression MENTIONS, at every
     * depth: visiting `this.state.mutator` records `this.state.mutator` and also
     * `this.state`, because the inner member expression is a node in its own
     * right. Sub-paths therefore need no special handling at the call site.
     *
     * Needed because the identifier sets the barriers compare hold BARE names
     * (`mutator`), so a written key like `this.mutator` could never match one.
     *
     * The traversal crosses function boundaries, matching getAllIdentifiers: the
     * question is which state the awaited expression touches, and a callback
     * handed to that expression touches it too. A non-arrow callback rebinds
     * `this`, so its paths are attributed to the enclosing instance even though
     * they belong to another object -- that can only add a barrier, never remove
     * one. (#1924)
     */
    function getInstancePathKeys(node: TSESTree.Node): Set<string> {
      const keys = new Set<string>();

      const visit = (current: TSESTree.Node): void => {
        if (current.type === AST_NODE_TYPES.MemberExpression) {
          const pathKey = getInstancePathKey(current);
          if (pathKey !== null) {
            keys.add(pathKey);
          }
        }

        for (const key in current) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const child = (current as any)[key];
          if (!child || typeof child !== 'object') continue;

          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            }
          } else if ('type' in child) {
            visit(child as TSESTree.Node);
          }
        }
      };

      visit(node);
      return keys;
    }

    /**
     * A path an expression requires to already hold an object, paired with the
     * expression that path is rooted at.
     */
    type DereferencedPath = {
      key: string;
      root: TSESTree.Node;
    };

    /**
     * Collects the member paths an expression DEREFERENCES: the object of a
     * member access that is itself a member access, keyed the same way a
     * receiver is.
     *
     * Depth is what makes the path a REQUIREMENT rather than a mere read.
     * Evaluating `store.data.id` demands that `store.data` already hold an
     * object, and throws when it does not; evaluating `store.data` demands
     * nothing, since an unfilled slot yields `undefined` and passing `undefined`
     * onward is silent. Only the former can turn the Promise.all rewrite into a
     * crash, so only the former mints a key here.
     *
     * The traversal stops at function boundaries, the opposite of
     * getInstancePathKeys: the hazard is eager evaluation at array-literal
     * construction, and a path inside a callback handed to the operation is
     * dereferenced when that callback runs, which the rewrite does not move.
     *
     * The root node travels with the key because the two questions the barrier
     * asks of a path -- which slot it names, and where its root is bound -- are
     * answered by different things.
     */
    function getDereferencedPaths(node: TSESTree.Node): DereferencedPath[] {
      const paths: DereferencedPath[] = [];

      const visit = (current: TSESTree.Node): void => {
        if (current.type === AST_NODE_TYPES.MemberExpression) {
          const object = unwrapExpression(current.object);
          if (object.type === AST_NODE_TYPES.MemberExpression) {
            const key = getReceiverKey(object);
            if (key !== null) {
              paths.push({ key, root: getPathRoot(object) });
            }
          }
        }

        if (FUNCTION_BOUNDARY_TYPES.has(current.type)) {
          return;
        }

        for (const key in current) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const child = (current as any)[key];
          if (!child || typeof child !== 'object') continue;

          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            }
          } else if ('type' in child) {
            visit(child as TSESTree.Node);
          }
        }
      };

      visit(node);
      return paths;
    }

    /**
     * Reports whether a path is rooted at state an opaque call could reach
     * without ever being handed it: a module-scope binding (a module-level
     * `const`, or an import), or a name that resolves nowhere and is therefore
     * an implicit global.
     *
     * A function-local root fails the test. A parameter or a local `const` is
     * not visible to a callee that receives neither, so a bare-identifier call
     * cannot rebind it, and reading a slot beneath it after that call is not the
     * hazard this barrier answers.
     *
     * The instance fails it too: `this` names an object a free function was not
     * given, so an instance path can only be written through code the run
     * itself shows -- which the closure-write barrier already reads.
     */
    function isAmbientlyReachableRoot(
      path: string,
      root: TSESTree.Node,
      declaredNames: Set<string>,
    ): boolean {
      if (root.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      if (isInstancePathKey(path) || declaredNames.has(root.name)) {
        return false;
      }

      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, root),
        root.name,
      );
      if (!variable) {
        return true;
      }

      return (
        variable.scope.type === TSESLint.Scope.ScopeType.module ||
        variable.scope.type === TSESLint.Scope.ScopeType.global
      );
    }

    /**
     * Reports whether an awaited expression is a call through a bare identifier
     * (`hydrate()`, `initAnalytics()`), the one callee shape that names no
     * receiver at all. Such a call's effects are reachable only through the
     * module scope it closes over, so nothing in the run describes what it
     * touches. Handles optional-call ChainExpressions.
     */
    function hasBareIdentifierCallee(
      awaitExpr: TSESTree.AwaitExpression,
    ): boolean {
      const argument = unwrapExpression(awaitExpr.argument);
      return (
        argument.type === AST_NODE_TYPES.CallExpression &&
        unwrapExpression(argument.callee).type === AST_NODE_TYPES.Identifier
      );
    }

    /**
     * Extracts the receiver key of an awaited *named-method* call: the key of
     * the `object` of a `MemberExpression` callee, when the accessed member is
     * a named method -- either a non-computed property (`versionRef.set(...)`)
     * or a computed string-literal key (`api['getData']()`). Both denote
     * invoking a method on the shared receiver, so they are equivalent for
     * ordering purposes.
     *
     * Returns null when the callee is not a named method on a statically-known
     * receiver: a non-member callee (`fetchAll()`), a receiver produced by a
     * call (`realtimeDb.ref(path).remove()`), or a numeric or dynamic index
     * (`operations[0]()`, `operations[i]()`), which selects a distinct callable
     * from a container rather than invoking a method on a stateful receiver.
     * Handles optional-call ChainExpressions.
     */
    function getCalleeReceiverKey(
      awaitExpr: TSESTree.AwaitExpression,
    ): string | null {
      let callExpr: TSESTree.CallExpression | null = null;
      if (awaitExpr.argument.type === AST_NODE_TYPES.CallExpression) {
        callExpr = awaitExpr.argument;
      } else if (
        awaitExpr.argument.type === AST_NODE_TYPES.ChainExpression &&
        awaitExpr.argument.expression.type === AST_NODE_TYPES.CallExpression
      ) {
        callExpr = awaitExpr.argument.expression;
      }

      if (!callExpr) {
        return null;
      }

      const callee = callExpr.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return null;
      }

      if (getMemberSegment(callee) === null) {
        return null;
      }

      return getReceiverKey(callee.object);
    }

    /**
     * Finds the function a class declares for a member name, searching the
     * class body that encloses a node. Both spellings of a method-valued member
     * qualify: a `MethodDefinition` and a `PropertyDefinition` initialized with
     * a function.
     *
     * The NEAREST enclosing class body is the one searched. A method reached
     * through `super` resolves against a base class, and an inner class shadows
     * an outer one, so the answer can name a function other than the one that
     * actually runs -- but the caller only ever ADDS the resolved body's writes
     * to the writes it already sees, so a wrong answer can only introduce a
     * barrier, the direction this rule's trade-off prefers.
     */
    function findClassMethodFunction(
      node: TSESTree.Node,
      memberName: string,
    ): TSESTree.Node | null {
      let current: TSESTree.Node | undefined = node;
      while (current && current.type !== AST_NODE_TYPES.ClassBody) {
        current = current.parent as TSESTree.Node | undefined;
      }
      if (!current) {
        return null;
      }

      for (const member of current.body) {
        if (
          member.type !== AST_NODE_TYPES.MethodDefinition &&
          member.type !== AST_NODE_TYPES.PropertyDefinition
        ) {
          continue;
        }
        if (member.computed) {
          continue;
        }

        const key = member.key;
        const name =
          key.type === AST_NODE_TYPES.PrivateIdentifier
            ? `#${key.name}`
            : key.type === AST_NODE_TYPES.Identifier
            ? key.name
            : null;
        if (name !== memberName) {
          continue;
        }

        const value = member.value;
        if (value && FUNCTION_BOUNDARY_TYPES.has(value.type)) {
          return value;
        }
      }

      return null;
    }

    /**
     * Resolves an awaited call to the function this file DECLARES for its
     * callee: a hoisted `function` declaration, a binding initialized with a
     * function, or a method of the enclosing class reached through
     * `this`/`super`.
     *
     * The body is where an operation's ordering constraint usually lives.
     * `await hydrate()` discards its result and mentions nothing it touches, so
     * every barrier keyed on the run's own text reads it as independent, while
     * the body assigns the very state the next await dereferences. Reading the
     * body turns that guess into a fact wherever the file supplies one.
     *
     * Only one level is followed, so a write reached through a helper's own
     * helper stays invisible. A callee that resolves nowhere -- an import, a
     * parameter, a method on some other object -- yields null and leaves the
     * syntactic barriers to answer for it.
     */
    function resolveCalleeFunction(
      awaitExpr: TSESTree.AwaitExpression,
    ): TSESTree.Node | null {
      const argument = unwrapExpression(awaitExpr.argument);
      if (argument.type !== AST_NODE_TYPES.CallExpression) {
        return null;
      }

      const callee = unwrapExpression(argument.callee);
      if (callee.type === AST_NODE_TYPES.Identifier) {
        const variable = ASTHelpers.findVariableInScope(
          ASTHelpers.getScope(context, callee),
          callee.name,
        );
        if (!variable) {
          return null;
        }
        for (const definition of variable.defs) {
          const declaration = definition.node;
          if (declaration.type === AST_NODE_TYPES.FunctionDeclaration) {
            return declaration;
          }
          if (
            declaration.type === AST_NODE_TYPES.VariableDeclarator &&
            declaration.init &&
            FUNCTION_BOUNDARY_TYPES.has(declaration.init.type)
          ) {
            return declaration.init;
          }
        }
        return null;
      }

      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return null;
      }
      const object = unwrapExpression(callee.object);
      if (
        object.type !== AST_NODE_TYPES.ThisExpression &&
        object.type !== AST_NODE_TYPES.Super
      ) {
        return null;
      }

      const memberName = getMemberSegment(callee);
      return memberName === null
        ? null
        : findClassMethodFunction(awaitExpr, memberName);
    }

    /**
     * Matches the `Promise` combinators that take an array of promises and
     * return a single promise standing in for the whole group. Awaiting one of
     * them does not consume the member promises: they stay reachable through
     * whatever names fed the combinator, so a later await mentioning one of
     * those names is reading a promise the aggregate already owns. Anchored so
     * only the combinator itself matches, never a user helper whose name merely
     * contains the word.
     */
    const PROMISE_AGGREGATOR_PATTERN = /^(all|allSettled|any|race)$/;

    /**
     * Node types that open a new function body. Traversals that ask "does
     * evaluating this expression suspend the enclosing async function?" must
     * stop here, because an `await` beyond this boundary belongs to the inner
     * function and runs only when that function is called.
     */
    const FUNCTION_BOUNDARY_TYPES = new Set<string>([
      AST_NODE_TYPES.FunctionDeclaration,
      AST_NODE_TYPES.FunctionExpression,
      AST_NODE_TYPES.ArrowFunctionExpression,
    ]);

    /**
     * Reports whether evaluating this expression suspends the enclosing async
     * function -- i.e. whether it contains an `await` of its own.
     *
     * The traversal deliberately stops at every function boundary: the awaits in
     * `Promise.all(items.map(async (item) => await store(item)))` belong to the
     * callback, so the outer expression evaluates straight through to a promise
     * without ever suspending, and hoisting it is safe.
     */
    function containsSuspendingAwait(node: TSESTree.Node): boolean {
      if (isAwaitExpression(node)) {
        return true;
      }

      if (FUNCTION_BOUNDARY_TYPES.has(node.type)) {
        return false;
      }

      for (const key in node) {
        if (key === 'parent' || key === 'range' || key === 'loc') continue;

        const child = (node as any)[key];
        if (!child || typeof child !== 'object') continue;

        if (Array.isArray(child)) {
          for (const item of child) {
            if (
              item &&
              typeof item === 'object' &&
              'type' in item &&
              containsSuspendingAwait(item as TSESTree.Node)
            ) {
              return true;
            }
          }
        } else if ('type' in child && containsSuspendingAwait(child)) {
          return true;
        }
      }

      return false;
    }

    /**
     * The array folds whose callback receives the PREVIOUS iteration's result as
     * its first parameter. `reduceRight` carries the same contract as `reduce`;
     * only the traversal order differs, so both fold a chain the same way.
     *
     * `map`/`forEach`/`filter` are deliberately absent: their callbacks receive
     * an ELEMENT first, and awaiting an element is an ordinary data read rather
     * than a serialization point.
     */
    const SEQUENTIAL_FOLD_METHODS = new Set(['reduce', 'reduceRight']);

    /**
     * Reports whether a function node is the callback a fold folds WITH -- the
     * first argument of a `.reduce(...)` / `.reduceRight(...)` call.
     *
     * Only a direct argument qualifies. A callback bound to a name first
     * (`const step = async (promise, doc) => {...}; items.reduce(step, seed)`)
     * is left alone rather than chased through the binding, which keeps the
     * barrier to the shape it can prove.
     */
    function isFoldCallback(fn: TSESTree.Node): boolean {
      const call = fn.parent;
      if (
        !call ||
        call.type !== AST_NODE_TYPES.CallExpression ||
        call.arguments[0] !== fn
      ) {
        return false;
      }

      const callee = call.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const property = callee.property;
      const methodName = callee.computed
        ? property.type === AST_NODE_TYPES.Literal &&
          typeof property.value === 'string'
          ? property.value
          : null
        : property.type === AST_NODE_TYPES.Identifier
        ? property.name
        : null;

      return !!methodName && SEQUENTIAL_FOLD_METHODS.has(methodName);
    }

    /**
     * Reports whether a parameter binding is the FIRST parameter of a function
     * -- the accumulator slot of a fold callback.
     *
     * Keyed on position rather than on the binding's name, because the
     * accumulator is spelled `promise`, `acc`, `previous`, `prev`, `chain` or
     * anything else the author preferred, and matching a name list would both
     * miss the unlisted spellings and fire on an element parameter that happens
     * to be called `promise`. A default (`async (acc = Promise.resolve(), doc)`)
     * still binds the accumulator first, so the pattern is unwrapped.
     */
    function isAccumulatorParameter(
      fn: TSESTree.Node,
      binding: TSESTree.Node,
    ): boolean {
      if (!FUNCTION_BOUNDARY_TYPES.has(fn.type)) {
        return false;
      }

      const [first] = (
        fn as
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression
      ).params;
      if (!first) {
        return false;
      }

      const target =
        first.type === AST_NODE_TYPES.AssignmentPattern ? first.left : first;
      return target === binding;
    }

    /**
     * Reports whether an awaited expression is a bare read of the ACCUMULATOR
     * parameter of an enclosing fold callback.
     *
     * The parameter is resolved through the scope chain rather than matched by
     * name, so a local that merely shadows the accumulator's spelling
     * (`const promise = fetchThing(); await promise;` inside the callback) is
     * correctly NOT the accumulator, and an accumulator under any spelling is.
     * TS-only wrappers are unwrapped because `await acc!` and
     * `await acc as Promise<void>` read the same binding.
     */
    function isFoldAccumulatorAwait(
      awaitExpr: TSESTree.AwaitExpression,
    ): boolean {
      let argument: TSESTree.Node = awaitExpr.argument;
      while (
        argument.type === AST_NODE_TYPES.TSNonNullExpression ||
        argument.type === AST_NODE_TYPES.TSAsExpression
      ) {
        argument = argument.expression;
      }
      if (argument.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, argument),
        argument.name,
      );
      if (!variable) {
        return false;
      }

      return variable.defs.some(
        (definition) =>
          definition.type === TSESLint.Scope.DefinitionType.Parameter &&
          isAccumulatorParameter(definition.node, definition.name) &&
          isFoldCallback(definition.node),
      );
    }

    /**
     * Follows an identifier back to the array literal a `const` binds to it.
     *
     * Only `const` qualifies. A `let`/`var` array can be reassigned between the
     * declaration and the await, so its literal elements are not a sound
     * description of what the aggregate actually received, and treating them as
     * such would suppress reports on genuinely independent operations.
     */
    function resolveConstArrayLiteral(
      identifier: TSESTree.Identifier,
    ): TSESTree.ArrayExpression | null {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, identifier),
        identifier.name,
      );
      if (!variable) {
        return null;
      }

      for (const definition of variable.defs) {
        const declarator = definition.node;
        if (
          declarator.type === AST_NODE_TYPES.VariableDeclarator &&
          declarator.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
          declarator.parent.kind === 'const' &&
          declarator.init?.type === AST_NODE_TYPES.ArrayExpression
        ) {
          return declarator.init;
        }
      }

      return null;
    }

    /**
     * Expands an awaited promise aggregate (`await Promise.all(ops)`) to the
     * names through which its member promises remain reachable afterwards: the
     * array's own binding plus every element that is a bare identifier, or a
     * spread of one.
     *
     * This is the aliasing channel the plain identifier-set comparison cannot
     * see. In `await Promise.all(ops); await release({ results: [await
     * dropped] })` the two awaits share no identifier at all -- one holds
     * `Promise`/`all`/`ops`, the other `release`/`dropped` -- yet `dropped` is
     * `ops[0]`, so the release genuinely cannot start before the drop settles.
     * Elements that are freshly-constructed promises (`assign()`) are omitted
     * because nothing binds them to a name, so no later await can reference
     * them. (#1541)
     */
    function getAggregatedPromiseNames(
      awaitExpr: TSESTree.AwaitExpression,
    ): Set<string> {
      const names = new Set<string>();

      const argument =
        awaitExpr.argument.type === AST_NODE_TYPES.ChainExpression
          ? awaitExpr.argument.expression
          : awaitExpr.argument;
      if (argument.type !== AST_NODE_TYPES.CallExpression) {
        return names;
      }

      const callee = argument.callee;
      if (
        callee.type !== AST_NODE_TYPES.MemberExpression ||
        callee.computed ||
        callee.object.type !== AST_NODE_TYPES.Identifier ||
        callee.object.name !== 'Promise' ||
        callee.property.type !== AST_NODE_TYPES.Identifier ||
        !PROMISE_AGGREGATOR_PATTERN.test(callee.property.name)
      ) {
        return names;
      }

      const [aggregated] = argument.arguments;
      if (!aggregated) {
        return names;
      }

      let elements: TSESTree.ArrayExpression['elements'] = [];
      if (aggregated.type === AST_NODE_TYPES.ArrayExpression) {
        elements = aggregated.elements;
      } else if (aggregated.type === AST_NODE_TYPES.Identifier) {
        names.add(aggregated.name);
        elements = resolveConstArrayLiteral(aggregated)?.elements ?? [];
      }

      for (const element of elements) {
        if (!element) continue;
        const value =
          element.type === AST_NODE_TYPES.SpreadElement
            ? element.argument
            : element;
        if (value.type === AST_NODE_TYPES.Identifier) {
          names.add(value.name);
        }
      }

      return names;
    }

    /**
     * What a set of assignment targets writes to, in the two vocabularies the
     * ordering barriers can match on: bindings reachable by NAME, and slots on
     * the instance reachable only by PATH. (#1924)
     */
    type AssignmentTargets = {
      identifiers: TSESTree.Identifier[];
      instancePaths: string[];
    };

    /**
     * Records the state a single assignment target writes to.
     *
     * A member write records its ROOT object (`obj.a.b = 1` yields `obj`),
     * because the state it mutates is reachable through that binding, and a
     * later await naming the object observes the mutation. Optional chains and
     * TS wrappers (`obj!.x = 1`) are unwrapped so the root is still found.
     * Destructuring targets recurse to their leaf identifiers, since
     * `({ a } = source)` and `[a] = source` write `a` just as `a = source.a`
     * does.
     *
     * A member write rooted at the instance (`this.mutator = m`) has no root
     * BINDING at all, so the root walk below records nothing for it and every
     * barrier keyed on names is blind to the write. Such a target additionally
     * records its instance PATH, which a barrier can match against the paths a
     * later await reads. The two vocabularies are independent: the root walk is
     * left exactly as it is, so an identifier-rooted write keeps its (wider,
     * quieter) root-binding treatment. (#1924)
     */
    function collectAssignmentTarget(
      target: TSESTree.Node,
      targets: AssignmentTargets,
    ): void {
      switch (target.type) {
        case AST_NODE_TYPES.Identifier:
          targets.identifiers.push(target);
          break;

        case AST_NODE_TYPES.MemberExpression: {
          const instancePath = getInstancePathKey(target);
          if (instancePath !== null) {
            targets.instancePaths.push(instancePath);
          }

          let root: TSESTree.Node = target;
          for (;;) {
            if (root.type === AST_NODE_TYPES.MemberExpression) {
              root = root.object;
            } else if (
              root.type === AST_NODE_TYPES.ChainExpression ||
              root.type === AST_NODE_TYPES.TSNonNullExpression ||
              root.type === AST_NODE_TYPES.TSAsExpression
            ) {
              root = root.expression;
            } else {
              break;
            }
          }
          if (root.type === AST_NODE_TYPES.Identifier) {
            targets.identifiers.push(root);
          }
          break;
        }

        case AST_NODE_TYPES.ObjectPattern:
          for (const property of target.properties) {
            if (property.type === AST_NODE_TYPES.Property) {
              collectAssignmentTarget(property.value, targets);
            } else {
              collectAssignmentTarget(property.argument, targets);
            }
          }
          break;

        case AST_NODE_TYPES.ArrayPattern:
          for (const element of target.elements) {
            if (element) {
              collectAssignmentTarget(element, targets);
            }
          }
          break;

        case AST_NODE_TYPES.RestElement:
          collectAssignmentTarget(target.argument, targets);
          break;

        case AST_NODE_TYPES.AssignmentPattern:
          collectAssignmentTarget(target.left, targets);
          break;
      }
    }

    /**
     * Reports whether an assignment target resolves to a binding DECLARED
     * inside the given expression.
     *
     * Such a binding is a fresh local: `async () => { let tmp; tmp = 1; }`
     * publishes nothing to the enclosing scope, so a later await mentioning
     * `tmp` is reading some other binding entirely. An unresolved name (an
     * implicit global) counts as external, which keeps the barrier in place for
     * the case the analysis cannot see.
     */
    function isDeclaredWithin(
      identifier: TSESTree.Identifier,
      root: TSESTree.Node,
    ): boolean {
      const variable = ASTHelpers.findVariableInScope(
        ASTHelpers.getScope(context, identifier),
        identifier.name,
      );
      if (!variable || variable.defs.length === 0) {
        return false;
      }

      return variable.defs.every(
        (definition) =>
          definition.name.range[0] >= root.range[0] &&
          definition.name.range[1] <= root.range[1],
      );
    }

    /**
     * Collects the state an awaited expression WRITES: the identifier names it
     * assigns, and the instance paths (`this.mutator`) it assigns. (#1924)
     *
     * The traversal deliberately crosses function boundaries, which is the
     * opposite of what containsSuspendingAwait needs: the write that matters
     * lives inside the callback handed to the awaited call. `await
     * db.runTransaction(async (tx) => { mutator = new Mutator(tx); })` publishes
     * `mutator` to the enclosing scope by the time it settles, so the callback
     * body is part of what that statement does, not a separate deferred unit.
     *
     * A `VariableDeclarator` id is deliberately NOT a write: `const x = ...`
     * inside a callback creates a fresh local binding rather than publishing a
     * value to an outer one, so it cannot be what a later await reads.
     */
    function getAssignedState(node: TSESTree.Node): {
      names: Set<string>;
      instancePaths: Set<string>;
    } {
      const targets: AssignmentTargets = { identifiers: [], instancePaths: [] };

      const visit = (current: TSESTree.Node): void => {
        if (current.type === AST_NODE_TYPES.AssignmentExpression) {
          collectAssignmentTarget(current.left, targets);
        } else if (current.type === AST_NODE_TYPES.UpdateExpression) {
          collectAssignmentTarget(current.argument, targets);
        } else if (
          (current.type === AST_NODE_TYPES.ForOfStatement ||
            current.type === AST_NODE_TYPES.ForInStatement) &&
          current.left.type !== AST_NODE_TYPES.VariableDeclaration
        ) {
          // `for (captured of items)` assigns an existing binding on every
          // iteration; only the declaration form introduces a fresh local.
          collectAssignmentTarget(current.left, targets);
        }

        for (const key in current) {
          if (key === 'parent' || key === 'range' || key === 'loc') continue;

          const child = (current as any)[key];
          if (!child || typeof child !== 'object') continue;

          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            }
          } else if ('type' in child) {
            visit(child as TSESTree.Node);
          }
        }
      };

      visit(node);

      const names = new Set<string>();
      for (const target of targets.identifiers) {
        if (!isDeclaredWithin(target, node)) {
          names.add(target.name);
        }
      }
      // An instance path needs no declared-within filter: `this` names the
      // enclosing instance, which no callback can declare as a fresh local, so
      // every such write is by construction published to the outer scope.
      return { names, instancePaths: new Set(targets.instancePaths) };
    }

    /**
     * Checks if there are dependencies between await expressions
     */
    function hasDependencies(
      awaitNodes: TSESTree.Node[],
      variableNames: Set<string>,
      sideEffectPatterns: RegExp[],
    ): boolean {
      if (awaitNodes.length < 2) {
        return false;
      }

      const allIdentifiers = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        return awaitExpr
          ? getAllIdentifiers(awaitExpr.argument, {
              includeMemberProperties: true,
            })
          : new Set<string>();
      });

      // Check all nodes for side effects and shared coordinators
      for (let i = 0; i < awaitNodes.length; i++) {
        const currentNode = awaitNodes[i];
        const awaitExpr = getAwaitExpression(currentNode);
        if (!awaitExpr) continue;

        // 1. Check if current node depends on variables DECLARED in previous awaits
        if (i > 0) {
          for (const varName of variableNames) {
            if (isIdentifierUsedInNode(varName, awaitExpr.argument)) {
              return true;
            }
          }
        }

        // 2. Check for shared coordinators between this node and ANY previous node
        if (i > 0) {
          const currentIds = allIdentifiers[i];
          for (const id of currentIds) {
            if (COORDINATOR_PATTERN.test(id)) {
              for (let j = 0; j < i; j++) {
                if (allIdentifiers[j].has(id)) {
                  return true;
                }
              }
            }
          }
        }

        // 3. Check for operations that might have side effects
        // If any node has a side effect, we should not parallelize the sequence
        const methodName = getCalleeMethodName(awaitExpr);
        if (
          methodName &&
          sideEffectPatterns.some((pattern) => pattern.test(methodName))
        ) {
          return true;
        }
      }

      // 4. Guard-then-side-effect ordering barrier. A discarded-result await
      // whose callee reads as a guard/assertion (assert*, ensure*, validate*,
      // ...) is a control-flow gate: it throws to abort the run when its
      // precondition fails, so any await after it must run ONLY if the guard
      // resolves. Promise.all invokes every operand eagerly, so it would fire
      // the gated side effect even when the guard rejects. Treat the guard's
      // presence (when something follows it) as a sequencing dependency that
      // blocks parallelizing the whole run. Only discarded-result awaits
      // (ExpressionStatements) qualify; `const ok = await validate(x)` has a
      // variable and is handled by the data-dependency path above.
      for (let i = 0; i < awaitNodes.length - 1; i++) {
        const node = awaitNodes[i];
        if (node.type !== AST_NODE_TYPES.ExpressionStatement) {
          continue;
        }
        const awaitExpr = getAwaitExpression(node);
        if (!awaitExpr) {
          continue;
        }
        const methodName = getCalleeMethodName(awaitExpr);
        if (methodName && GUARD_PATTERN.test(methodName)) {
          return true;
        }
      }

      // 5. Refetch/refresh ordering barrier. A discarded-result await whose
      // callee reads as a state re-read (refresh*, reload*, refetch*,
      // revalidate*, resync*, sync*) exists to observe state that a PRECEDING
      // await may have mutated. Promise.all invokes every operand eagerly and
      // concurrently, so it would race the refetch ahead of the mutation -- a
      // refresh that resolves first repopulates the just-mutated state, a
      // genuine correctness bug. Treat a refetch that FOLLOWS another await as
      // a sequencing dependency that blocks parallelizing the run. Only
      // non-first positions qualify: the preceding await is what the refetch
      // depends on. getCalleeMethodName handles both bare-identifier and
      // member-expression callees. Only discarded-result awaits
      // (ExpressionStatements) qualify here; a captured result carries a value
      // and is handled by the data-dependency path above.
      for (let i = 1; i < awaitNodes.length; i++) {
        const node = awaitNodes[i];
        if (node.type !== AST_NODE_TYPES.ExpressionStatement) {
          continue;
        }
        const awaitExpr = getAwaitExpression(node);
        if (!awaitExpr) {
          continue;
        }
        const methodName = getCalleeMethodName(awaitExpr);
        if (methodName && REFETCH_PATTERN.test(methodName)) {
          return true;
        }
      }

      // 6. Navigation ordering barrier. An awaited route transition sequences
      // the awaits around it by UI lifetime rather than by data: the operations
      // before it must settle on the source page, and the operations after it
      // must mount on the destination page. Promise.all runs every operand
      // concurrently, which races both of those against the route change --
      // dialogs opened by a following await appear on the source page and are
      // destroyed when the transition lands. Unlike the guard and refetch
      // barriers, position does not matter: a navigation is a barrier whether it
      // leads or trails the run. Captured results qualify too, since the hazard
      // is the transition itself, not the value it returns.
      for (const node of awaitNodes) {
        const awaitExpr = getAwaitExpression(node);
        if (awaitExpr && isNavigationCall(awaitExpr)) {
          return true;
        }
      }

      // If any node is a variable declaration with destructuring, consider it as having dependencies
      for (const node of awaitNodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declaration of node.declarations) {
            if (declaration.id.type === AST_NODE_TYPES.ObjectPattern) {
              return true;
            }
          }
        }
      }

      // 7. Shared-receiver ordering barrier. Two awaited calls whose callees are
      // member expressions on the SAME receiver (e.g. `ref.set(x)` then
      // `ref.get()`) can carry a read-after-write / write-after-write
      // dependency: the later call may observe or overwrite state the earlier
      // one produced on that shared object. Promise.all runs its operands
      // concurrently, so it would race that ordering and let the read see the
      // stale value. Keep such a run sequential. Skipping a genuinely
      // independent pair of reads on one receiver is only a missed
      // parallelization (a safe no-op), which is preferable to silently
      // reordering a real data dependency.
      //
      // That trade-off is receiver-agnostic, so every receiver denoting one
      // statically-known object qualifies: a bare binding, the instance
      // (`this`, `super` -- one receiver, see INSTANCE_RECEIVER_KEY), and fixed
      // chains over them (`this.inner`). The instance is if anything the
      // strongest case -- a method call on it is the canonical way to mutate
      // instance state, and the rule models instance state nowhere, so the
      // dependency `this.load()` -> `this.read()` has no syntactic edge at all.
      // Receivers whose identity varies per evaluation (call chains, dynamic
      // subscripts) are still left untouched. (#1914, #1923)
      const receiverKeys = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        return awaitExpr ? getCalleeReceiverKey(awaitExpr) : null;
      });
      for (let i = 1; i < receiverKeys.length; i++) {
        const receiver = receiverKeys[i];
        if (!receiver) continue;
        for (let j = 0; j < i; j++) {
          if (receiverKeys[j] === receiver) {
            return true;
          }
        }
      }

      // 8. Aggregate-element aliasing barrier. `await Promise.all(ops)` does not
      // consume the promises in `ops`; they stay reachable by name, so a later
      // await that mentions one of them -- `await release({ results: [await
      // dropped] })`, where `dropped` is `ops[0]` -- reads a value the aggregate
      // is still producing. The two awaits share no identifier at all
      // (`Promise`/`all`/`ops` versus `release`/`dropped`), so the direct set
      // comparison above classifies them independent; expanding the aggregate to
      // its element names restores the link. Promise.all-ing that pair would
      // start the consumer concurrently with the very operation whose result it
      // reads. (#1541)
      for (let i = 1; i < awaitNodes.length; i++) {
        const currentIds = allIdentifiers[i];
        if (currentIds.size === 0) continue;
        for (let j = 0; j < i; j++) {
          const priorExpr = getAwaitExpression(awaitNodes[j]);
          if (!priorExpr) continue;
          for (const aggregatedName of getAggregatedPromiseNames(priorExpr)) {
            if (currentIds.has(aggregatedName)) {
              return true;
            }
          }
        }
      }

      // 9. Nested-await hoist barrier. The rewrite splices each awaited
      // expression into a `Promise.all([...])` ARRAY LITERAL, and array elements
      // evaluate left to right. An element that contains an `await` of its own
      // suspends the enclosing function mid-literal -- after the earlier
      // elements' promises have been constructed, but before `Promise.all` has
      // been called to attach handlers to them. If one of those already-running
      // promises rejects during the suspension, the function throws at the inner
      // await and the rejected promise is orphaned into an `unhandledRejection`,
      // which the Cloud Functions runtime answers by killing the instance, so
      // the caller receives an opaque crash instead of the real error. A leading
      // nested await is unsound in a quieter way: it suspends before the later
      // elements are evaluated, so their operations never start early and the
      // rewrite buys no parallelism while still reshaping the code. Keep any run
      // containing such an expression sequential. (#1541)
      for (const node of awaitNodes) {
        const awaitExpr = getAwaitExpression(node);
        if (awaitExpr && containsSuspendingAwait(awaitExpr.argument)) {
          return true;
        }
      }

      // 10. Closure-write barrier: read after write. An awaited call whose
      // callback ASSIGNS an outer binding carries a data dependency that no
      // value flowing out of the await expresses, so `variableNames` -- which
      // holds only the names the run's own statements DECLARE -- cannot see it.
      // `let mutator; await db.runTransaction(async (tx) => { mutator = new
      // Mutator(tx); }); await mutator?.deleteIfEmptied();` is the shape. The
      // rewrite is silently wrong rather than merely eager: array elements
      // evaluate left to right at construction time, so the second element runs
      // while `mutator` is still undefined -- the optional chain short-circuits
      // and the operation NEVER happens, with no error to reveal it. Dropping
      // the `?.` turns the same rewrite into a TypeError instead. Keyed on a
      // write that a LATER await actually reads, so a callback whose effects
      // nothing downstream observes still parallelizes. (#1723)
      //
      // Instance state is the same hazard written a different way: `await
      // db.runTransaction(async (tx) => { this.mutator = new Mutator(tx); });
      // await this.mutator?.deleteIfEmptied();` reorders just as silently, but
      // `this.mutator` has no root BINDING for the name comparison to catch, so
      // the write must be matched by PATH instead. The two vocabularies are
      // checked side by side and the path check is purely additive: it can only
      // suppress a report, never create one. Paths are compared slot by slot, so
      // a write to `this.alpha` leaves a later `this.beta` parallelizable while
      // a write to `this.state` still blocks a later `this.state.mutator`.
      // (#1924)
      //
      // A write inside the awaited call's own BODY reaches the enclosing scope
      // exactly as a write inside a callback does -- `await hydrate()`, where
      // `hydrate` assigns `store.state`, publishes that slot by the time it
      // settles. The body is not part of the awaited expression, so the
      // traversal above cannot see it; wherever the file declares the callee,
      // its writes are read from there and joined to the ones spelled out in
      // the run. (#1989)
      const assignedState = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        if (!awaitExpr) {
          return { names: new Set<string>(), instancePaths: new Set<string>() };
        }
        const written = getAssignedState(awaitExpr.argument);
        const calleeFunction = resolveCalleeFunction(awaitExpr);
        if (!calleeFunction) {
          return written;
        }
        const calleeWritten = getAssignedState(calleeFunction);
        return {
          names: new Set([...written.names, ...calleeWritten.names]),
          instancePaths: new Set([
            ...written.instancePaths,
            ...calleeWritten.instancePaths,
          ]),
        };
      });
      const readInstancePaths = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        return awaitExpr
          ? getInstancePathKeys(awaitExpr.argument)
          : new Set<string>();
      });
      for (let i = 1; i < awaitNodes.length; i++) {
        const currentIds = allIdentifiers[i];
        const currentPaths = readInstancePaths[i];
        if (currentIds.size === 0 && currentPaths.size === 0) continue;
        for (let j = 0; j < i; j++) {
          for (const written of assignedState[j].names) {
            if (currentIds.has(written)) {
              return true;
            }
          }
          for (const writtenPath of assignedState[j].instancePaths) {
            for (const readPath of currentPaths) {
              if (instancePathsOverlap(writtenPath, readPath)) {
                return true;
              }
            }
          }
        }
      }

      // 11. Fold-accumulator serialization barrier. `items.reduce(async
      // (promise, item) => { await promise; await store(item); },
      // Promise.resolve())` is the canonical idiom for FORCING sequential
      // execution over a collection: the callback's first parameter IS the
      // previous iteration's completion, so `await promise` is a serialization
      // point rather than an operation of its own. The dependency it expresses
      // is a sequencing one -- the accumulator and `store(item)` share no value
      // at all -- so the identifier comparison above classifies the pair
      // independent and the rewrite hoists the awaits into a Promise.all,
      // starting every iteration's work at once and discarding the exact
      // guarantee the idiom was written to provide. The run is deliberate, not
      // a latency mistake, so the rule declines to report it rather than merely
      // declining the fix. Only an accumulator await with something AFTER it
      // qualifies, mirroring the guard barrier above: it is what follows the
      // barrier that the rewrite would illegally start early. (#1851)
      for (let i = 0; i < awaitNodes.length - 1; i++) {
        const awaitExpr = getAwaitExpression(awaitNodes[i]);
        if (awaitExpr && isFoldAccumulatorAwait(awaitExpr)) {
          return true;
        }
      }

      // 12. Deferred-dereference barrier. A statement AFTER an await occupies a
      // deferred position: it is evaluated only once the preceding promise
      // settles. The rewrite splices its awaited operand into a `Promise.all`
      // ARRAY LITERAL, whose elements evaluate eagerly at construction. Any slot
      // the later operand must dereference is therefore read BEFORE the earlier
      // operation runs, so a slot that operation installs is read while still
      // `undefined` and the element throws a TypeError -- code that returned a
      // value before the fix crashes after it. The two awaits are genuinely
      // ordered, so the run is not a latency mistake and the rule declines to
      // report it rather than merely declining the fix. (#1989)
      //
      // The write itself is invisible: it happens inside the awaited call's own
      // BODY, so no value flows out of the await, no variable is declared, and
      // no assignment appears anywhere the closure-write barrier looks. What the
      // run does show is REACH -- whether the earlier operation could have
      // installed the slot at all -- and only a discarded-result await qualifies
      // as the writer, since a captured result is a value dependency the
      // identifier comparison already sees.
      //
      // Reach comes in two shapes, and only these two, so that sibling slots
      // under a shared namespace (`api.users.getAll()` then
      // `api.posts.getRecent()`) stay parallelizable:
      //
      //   (a) The earlier call is invoked ON a receiver that CONTAINS the slot
      //       (`this.connect()` then `this.client.send()`, `store.load()` then
      //       `send(store.data.id)`). A method can fill any slot beneath its own
      //       receiver, which is what makes such a pair ordered. This widens the
      //       shared-receiver barrier from equality to containment: barrier 7
      //       compares two receivers, whereas here the earlier receiver is
      //       compared against a path the later operand merely reads.
      //
      //   (b) The earlier call goes through a bare identifier (`hydrate()`,
      //       `initAnalytics()`) and the slot hangs off module-scope state. Such
      //       a call names no receiver, so the run says nothing about what it
      //       touches, while module-scope state is reachable from inside it
      //       without ever being passed in. Function-local roots and instance
      //       paths are excluded: a free function handed neither cannot rebind
      //       them, so writes that reach them are visible in the run and belong
      //       to the closure-write barrier.
      const dereferencedPaths = awaitNodes.map((node) => {
        const awaitExpr = getAwaitExpression(node);
        return awaitExpr ? getDereferencedPaths(awaitExpr.argument) : [];
      });
      for (let i = 1; i < awaitNodes.length; i++) {
        const paths = dereferencedPaths[i];
        if (paths.length === 0) continue;

        for (let j = 0; j < i; j++) {
          if (awaitNodes[j].type !== AST_NODE_TYPES.ExpressionStatement) {
            continue;
          }
          const priorExpr = getAwaitExpression(awaitNodes[j]);
          if (!priorExpr) continue;

          const priorReceiver = receiverKeys[j];
          for (const path of paths) {
            if (
              priorReceiver !== null &&
              (path.key === priorReceiver ||
                path.key.startsWith(`${priorReceiver}.`))
            ) {
              return true;
            }

            if (
              priorReceiver === null &&
              hasBareIdentifierCallee(priorExpr) &&
              isAmbientlyReachableRoot(path.key, path.root, variableNames)
            ) {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Extracts variable names from variable declarations
     */
    function extractVariableNames(nodes: TSESTree.Node[]): Set<string> {
      const variableNames = new Set<string>();

      /**
       * Recursively extract identifiers from patterns
       */
      function extractIdentifiersFromPattern(pattern: TSESTree.Node): void {
        switch (pattern.type) {
          case AST_NODE_TYPES.Identifier:
            variableNames.add(pattern.name);
            break;

          case AST_NODE_TYPES.ObjectPattern:
            for (const property of pattern.properties) {
              if (property.type === AST_NODE_TYPES.Property) {
                extractIdentifiersFromPattern(property.value);
              } else if (property.type === AST_NODE_TYPES.RestElement) {
                extractIdentifiersFromPattern(property.argument);
              }
            }
            break;

          case AST_NODE_TYPES.ArrayPattern:
            for (const element of pattern.elements) {
              if (element) {
                extractIdentifiersFromPattern(element);
              }
            }
            break;

          case AST_NODE_TYPES.RestElement:
            extractIdentifiersFromPattern(pattern.argument);
            break;

          case AST_NODE_TYPES.AssignmentPattern:
            extractIdentifiersFromPattern(pattern.left);
            break;
        }
      }

      for (const node of nodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declaration of node.declarations) {
            extractIdentifiersFromPattern(declaration.id);
          }
        }
      }

      return variableNames;
    }

    /**
     * Checks if nodes are in try-catch blocks (either individual or shared)
     */
    function areInTryCatchBlocks(nodes: TSESTree.Node[]): boolean {
      for (const node of nodes) {
        let current: TSESTree.Node | undefined = node;

        while (current && current.parent) {
          if (
            current.parent.type === AST_NODE_TYPES.TryStatement &&
            current.parent.block === current
          ) {
            // If we find a try block, we should not parallelize
            // This applies to both individual and shared try-catch blocks
            return true;
          }
          current = current.parent as TSESTree.Node;
        }
      }

      return false;
    }

    /**
     * Checks if nodes are in a loop
     */
    function areInLoop(nodes: TSESTree.Node[]): boolean {
      for (const node of nodes) {
        let current: TSESTree.Node | undefined = node;

        while (current && current.parent) {
          if (
            current.parent.type === AST_NODE_TYPES.ForStatement ||
            current.parent.type === AST_NODE_TYPES.ForInStatement ||
            current.parent.type === AST_NODE_TYPES.ForOfStatement ||
            current.parent.type === AST_NODE_TYPES.WhileStatement ||
            current.parent.type === AST_NODE_TYPES.DoWhileStatement
          ) {
            return true;
          }
          current = current.parent as TSESTree.Node;
        }
      }

      return false;
    }

    /**
     * Returns the leading whitespace of the source line a node starts on.
     *
     * A statement that shares its line with earlier code yields that line's
     * indentation rather than the node's own column, which keeps the generated
     * block aligned with the enclosing statement instead of with an arbitrary
     * mid-line offset.
     */
    function getIndentationOf(node: TSESTree.Node): string {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      return /^[ \t]*/.exec(line)?.[0] ?? '';
    }

    /**
     * Generates a fix for sequential awaits
     *
     * Returns null when the sequential awaits cannot be safely rewritten as a Promise.all.
     */
    function generateFix(
      fixer: TSESLint.RuleFixer,
      awaitNodes: TSESTree.Node[],
    ): TSESLint.RuleFix | null {
      if (awaitNodes.length < 2) {
        return null;
      }

      const awaitExpressions = awaitNodes
        .map((node) => getAwaitExpression(node))
        .filter((node): node is TSESTree.AwaitExpression => node !== null);

      if (awaitExpressions.length < 2) {
        return null;
      }

      const awaitArguments = awaitExpressions.map((expr) =>
        sourceCode.getText(expr.argument),
      );

      const startPos = awaitNodes[0].range[0];
      const endPos = awaitNodes[awaitNodes.length - 1].range[1];

      // The replacement text is rebuilt from the awaited expressions alone, so
      // a comment inside the replaced span has no representation in it and
      // would be silently deleted. Deleting an eslint-disable-next-line
      // directive re-enables the suppressed rule on the code that survives
      // inside the Promise.all (#1589). Each span comment is therefore either
      // re-hosted directly above the array element built from the statement it
      // annotates, or the fix is declined so no comment is ever destroyed. The
      // report fires either way.
      const spanComments = sourceCode
        .getAllComments()
        .filter(
          (comment) =>
            comment.range[0] >= startPos && comment.range[1] <= endPos,
        );

      const hostedComments: TSESTree.Comment[][] = awaitNodes.map(() => []);

      if (spanComments.length > 0) {
        // Re-hosting maps the comments preceding statement i onto element i,
        // which requires the element list to line up 1:1 with the statement
        // list.
        if (awaitExpressions.length !== awaitNodes.length) {
          return null;
        }

        for (const comment of spanComments) {
          const hostIndex = awaitNodes.findIndex(
            (node, index) =>
              index > 0 &&
              comment.range[0] >= awaitNodes[index - 1].range[1] &&
              comment.range[1] <= node.range[0],
          );

          if (hostIndex === -1) {
            // The comment sits inside one of the merged statements. A comment
            // within the awaited expression itself travels verbatim with
            // getText; anywhere else (between `await` and its operand, or
            // around a declarator's `=`) has no slot in the rebuilt text.
            const isInsideArgument = awaitExpressions.some(
              (expr) =>
                comment.range[0] >= expr.argument.range[0] &&
                comment.range[1] <= expr.argument.range[1],
            );
            if (!isInsideArgument) {
              return null;
            }
            continue;
          }

          // A comment that shares the previous statement's last line is a
          // trailing comment (e.g. an eslint-disable-line directive) governing
          // THAT line; moving it above the next element would change which
          // line it applies to.
          if (
            comment.loc.start.line <= awaitNodes[hostIndex - 1].loc.end.line
          ) {
            return null;
          }

          // A directive above `const x = await f();` may target the
          // declaration's identifier, which the rewrite moves into the
          // destructuring pattern on the Promise.all line — away from every
          // line the re-hosted directive could govern.
          if (
            /^\s*eslint-/u.test(comment.value) &&
            awaitNodes[hostIndex].type === AST_NODE_TYPES.VariableDeclaration
          ) {
            return null;
          }

          hostedComments[hostIndex].push(comment);
        }
      }

      const idsText: string[] = [];
      const declKinds = new Set<TSESTree.VariableDeclaration['kind']>();
      let hasVariableDeclarations = false;

      for (const node of awaitNodes) {
        if (node.type === AST_NODE_TYPES.VariableDeclaration) {
          hasVariableDeclarations = true;
          declKinds.add(node.kind);
          for (const declarator of node.declarations) {
            idsText.push(sourceCode.getText(declarator.id));
          }
        } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
          idsText.push('');
        }
      }

      // The replacement range starts at the first await's own start offset, so
      // ESLint leaves that line's leading whitespace in place and only the
      // FIRST line inherits the surrounding indentation. Every continuation
      // line the fixer emits has to carry that indentation itself, otherwise
      // the array elements and closing bracket land at column 2 and column 0
      // no matter how deeply the original awaits were nested.
      const baseIndent = getIndentationOf(awaitNodes[0]);
      // Match the file's own indentation character instead of assuming spaces,
      // so a tab-indented file does not end up with mixed tabs and spaces. The
      // space fallback is two wide to match the repo's prettier config.
      const indentUnit = baseIndent.includes('\t') ? '\t' : '  ';
      const elementIndent = `${baseIndent}${indentUnit}`;
      // Arguments are spliced in verbatim: an argument spanning multiple lines
      // keeps its original interior indentation because that interior can be
      // the contents of a template literal, where whitespace is significant
      // data rather than formatting and re-indenting would silently change the
      // produced string.
      const elementsText = awaitArguments
        .map((argumentText, index) => {
          // Each re-hosted comment lands on its own line directly above the
          // element, which is the only placement where a disable-next-line
          // directive keeps suppressing it.
          const leadingText = (hostedComments[index] ?? [])
            .map(
              (comment) => `${sourceCode.getText(comment)}\n${elementIndent}`,
            )
            .join('');
          return `${leadingText}${argumentText}`;
        })
        .join(`,\n${elementIndent}`);

      let promiseAllText: string;

      if (hasVariableDeclarations) {
        if (declKinds.size !== 1) {
          return null;
        }

        if (idsText.length !== awaitArguments.length) {
          return null;
        }

        const destructuringPattern = idsText.join(', ');
        const declKind = Array.from(declKinds)[0];
        promiseAllText = `${declKind} [${destructuringPattern}] = await Promise.all([\n${elementIndent}${elementsText}\n${baseIndent}]);`;
      } else {
        // Simple Promise.all without variable assignments
        promiseAllText = `await Promise.all([\n${elementIndent}${elementsText}\n${baseIndent}]);`;
      }

      return fixer.replaceTextRange([startPos, endPos], promiseAllText);
    }

    /**
     * Generates a deduplication key from await nodes' range metadata.
     */
    function getDeduplicationKey(awaitNodes: TSESTree.Node[]): string {
      const rangeStart = awaitNodes[0].range[0];
      const rangeEnd = awaitNodes[awaitNodes.length - 1].range[1];

      return `${rangeStart}-${rangeEnd}`;
    }

    const processStatementList = (statements: TSESTree.Statement[]): void => {
      const awaitNodes: TSESTree.Node[] = [];

      for (const statement of statements) {
        if (
          isExpressionStatementWithAwait(statement) ||
          isVariableDeclarationWithAwait(statement)
        ) {
          awaitNodes.push(statement);
        } else if (awaitNodes.length >= 2) {
          const variableNames = extractVariableNames(awaitNodes);

          if (
            !hasDependencies(awaitNodes, variableNames, sideEffectMatchers) &&
            !areInTryCatchBlocks(awaitNodes) &&
            !areInLoop(awaitNodes)
          ) {
            const key = getDeduplicationKey(awaitNodes);
            if (!reportedRanges.has(key)) {
              reportedRanges.add(key);
              context.report({
                node: awaitNodes[0],
                messageId: 'parallelizeAsyncOperations',
                data: {
                  awaitCount: awaitNodes.length.toString(),
                },
                fix: (fixer) => generateFix(fixer, awaitNodes),
              });
            }
          }

          awaitNodes.length = 0;
        } else {
          awaitNodes.length = 0;
        }
      }

      if (awaitNodes.length >= 2) {
        const variableNames = extractVariableNames(awaitNodes);

        if (
          !hasDependencies(awaitNodes, variableNames, sideEffectMatchers) &&
          !areInTryCatchBlocks(awaitNodes) &&
          !areInLoop(awaitNodes)
        ) {
          const key = getDeduplicationKey(awaitNodes);
          if (!reportedRanges.has(key)) {
            reportedRanges.add(key);
            context.report({
              node: awaitNodes[0],
              messageId: 'parallelizeAsyncOperations',
              data: {
                awaitCount: awaitNodes.length.toString(),
              },
              fix: (fixer) => generateFix(fixer, awaitNodes),
            });
          }
        }
      }
    };

    return {
      Program(node) {
        processStatementList(node.body);
      },
      BlockStatement(node) {
        processStatementList(node.body);
      },
    };
  },
});
