import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { statementsOf } from '../utils/lexicalScope';
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
 * function still resolves against a declaration in that function, because the
 * callback cannot run before the statement that creates it — so the walk
 * continues past non-async functions rather than giving up.
 *
 * The containment check is against the body rather than the function: a
 * reference in a parameter default or a signature type annotation is evaluated
 * before the body runs, so no declaration inside the body is early enough
 * for it.
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

/**
 * One container the relocated declaration could head, seen from a single
 * reference.
 */
type ReferenceSite = {
  /** The node holding the statement list. */
  readonly container: TSESTree.Node;
  /** The statement list the container holds. */
  readonly statements: readonly TSESTree.Node[];
  /** The statement of that list the reference sits inside. */
  readonly statement: TSESTree.Node;
  /**
   * Whether serving the reference from this container means leaving a `try`
   * block that encloses it.
   */
  readonly leavesTryBlock: boolean;
};

/**
 * Bodies that hold statements yet run as a function of their own, so an `await`
 * written in one would belong to that function rather than to the enclosing
 * async one — where it is not grammatical at all. A class static block runs
 * during class definition, and a `namespace` body is emitted as an immediately
 * invoked function.
 */
const AWAIT_OPAQUE_BODIES = new Set<string>([
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.TSModuleBlock,
]);

/**
 * The containers that can serve one reference, innermost outward, up to the
 * async body that hosts the declaration.
 *
 * `enclosingStatementLists` materialises the same walk, but it yields the lists
 * alone; the statement each list holds the reference in is the half that
 * decides the anchor, so the walk is spelled out here.
 *
 * Two kinds of container are dropped on the way out, both because a
 * declaration written there would not serve the reference at all:
 *
 *   - a nested function, a class static block or a `namespace` body, and
 *     everything under one: the `await` there would not be the async
 *     function's. A reference inside one is served from the nearest container
 *     OUTSIDE it, which is where that body is evaluated and therefore ahead of
 *     every run of it.
 *   - a `case` clause. It holds statements, but a lexical declaration written
 *     directly in one is scoped to the whole `switch` block — in scope, and in
 *     the temporal dead zone, for every other clause — which is the hazard
 *     `no-case-declarations` exists for. The declaration heads the list the
 *     `switch` itself sits in instead.
 */
const referenceSitesOf = (
  identifier: TSESTree.Node,
  body: TSESTree.BlockStatement,
): ReferenceSite[] | null => {
  const sites: ReferenceSite[] = [];
  let child: TSESTree.Node = identifier;
  let parent: TSESTree.Node | undefined = identifier.parent;
  let leavesTryBlock = false;
  while (parent) {
    if (parent.type === AST_NODE_TYPES.TryStatement && parent.block === child) {
      leavesTryBlock = true;
    }
    const opaque =
      isFunctionNode(parent) || AWAIT_OPAQUE_BODIES.has(parent.type);
    if (opaque) {
      sites.length = 0;
    }
    const statements =
      opaque || parent.type === AST_NODE_TYPES.SwitchCase
        ? undefined
        : statementsOf(parent);
    if (statements?.includes(child)) {
      sites.push({
        container: parent,
        statements,
        statement: child,
        leavesTryBlock,
      });
    }
    if (parent === body) {
      return sites;
    }
    child = parent;
    parent = parent.parent;
  }
  // The body encloses every reference the caller collected, so the walk always
  // meets it; a chain that does not is one this fixer has no position for.
  return null;
};

/**
 * Every container that can serve ALL references, innermost outward, as each
 * reference's own site in it.
 *
 * The innermost is the position the fixer wants: it is the latest one, and so
 * the one that jumps the fewest statements. It has to be a COMMON container
 * though — a position inside a deeper branch would leave every reference
 * outside that branch reading a binding not in scope, which is a crash rather
 * than a placement — and the rest of the chain is kept because the innermost is
 * not always usable: a container that runs its statements repeatedly hands the
 * declaration back outward (see {@link repeatsAtomically}).
 */
const sharedSiteChainOf = (
  chains: readonly ReferenceSite[][],
): ReferenceSite[][] => {
  const shared: ReferenceSite[][] = [];
  for (const candidate of chains[0] ?? []) {
    const matched = chains.map((chain) =>
      chain.find((site) => site.statements === candidate.statements),
    );
    if (matched.every((site): site is ReferenceSite => site !== undefined)) {
      shared.push(matched);
    }
  }
  return shared;
};

/**
 * The earliest statement the declaration must precede for one reference to read
 * it.
 *
 * A `function` declaration is hoisted across its whole container, so a call
 * written above it reaches the body before the statement position does. The
 * only position that dominates every such call is the head of the list.
 */
const positionOf = (
  statements: readonly TSESTree.Node[],
  site: ReferenceSite,
): number =>
  site.statement.type === AST_NODE_TYPES.FunctionDeclaration
    ? 0
    : statements.indexOf(site.statement);

const isDirective = (statement: TSESTree.Node): boolean =>
  statement.type === AST_NODE_TYPES.ExpressionStatement &&
  statement.expression.type === AST_NODE_TYPES.Literal &&
  typeof statement.expression.value === 'string';

const prologueLengthOf = (statements: readonly TSESTree.Node[]): number => {
  const first = statements.findIndex((statement) => !isDirective(statement));
  return first === -1 ? statements.length : first;
};

/**
 * The children of `node` that the async function's own execution reaches.
 *
 * A nested function, a class static block and a `namespace` body are cut, the
 * same boundary {@link referenceSitesOf} draws: what they hold runs when THEY
 * are invoked, which is not a moment the relocated `await` moves, so their
 * contents say nothing about the placement.
 */
const reachedChildrenOf = (node: TSESTree.Node): TSESTree.Node[] => {
  const children: TSESTree.Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    // `parent` points back up the tree, so following it would walk the whole
    // file — and never terminate.
    if (key === 'parent') {
      continue;
    }
    for (const child of Array.isArray(value) ? value : [value]) {
      if (
        ASTHelpers.isNode(child) &&
        !isFunctionNode(child) &&
        !AWAIT_OPAQUE_BODIES.has(child.type)
      ) {
        children.push(child);
      }
    }
  }
  return children;
};

const walkReached = (
  root: TSESTree.Node,
  visit: (node: TSESTree.Node) => void,
): void => {
  const pending: TSESTree.Node[] = [root];
  while (pending.length > 0) {
    const node = pending.pop() as TSESTree.Node;
    visit(node);
    pending.push(...reachedChildrenOf(node));
  }
};

/**
 * The dotted path an expression names, or null when its spelling is not a fixed
 * path (`queue[index]`, a call result).
 *
 * Paths are compared as text because the question they answer is whether a test
 * and a later write touch the SAME state, and a member path has no binding of
 * its own for a resolver to match on.
 */
const pathTextOf = (node: TSESTree.Node): string | null => {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.ThisExpression) {
    return 'this';
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  ) {
    const object = pathTextOf(node.object);
    return object === null ? null : `${object}.${node.property.name}`;
  }
  return null;
};

const readPathsInto = (node: TSESTree.Node, paths: Set<string>): void => {
  const path = pathTextOf(node);
  if (path !== null) {
    paths.add(path);
    // The object half of `ref.current` is read too, so a write that replaces
    // `ref` outright still answers a test of `ref.current`. Recursing on the
    // path itself rather than on its children keeps `current` — a property
    // name, not a binding — out of the set.
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      readPathsInto(node.object, paths);
    }
    return;
  }
  for (const child of reachedChildrenOf(node)) {
    readPathsInto(child, paths);
  }
};

/**
 * The state a call flips, for the one flip whose spelling says so: a React
 * `const [status, setStatus] = useState(...)` pair names the writer after the
 * value, so `setStatus(...)` is a write to `status` even though no assignment
 * is written anywhere.
 *
 * This is the flip the issue's own reproduction turns on (#2103): the guard
 * tests `revealStatus` and the statement behind it calls
 * `setRevealStatus('minting')`.
 */
const SETTER_NAME = /^set([A-Z])(.*)$/;

const flippedStateOf = (callee: TSESTree.Node): string | null => {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  const matched = SETTER_NAME.exec(callee.name);
  return matched ? `${matched[1].toLowerCase()}${matched[2]}` : null;
};

/** The state a statement writes, as a path, or null when it writes none. */
const writtenPathOf = (node: TSESTree.Node): string | null => {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return pathTextOf(node.left);
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return pathTextOf(node.argument);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return flippedStateOf(node.callee);
  }
  return null;
};

const SUSPENDING_EXPRESSIONS = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
]);

/** Where the code already gives up its turn, as source offsets. */
const suspensionStartsIn = (root: TSESTree.Node): number[] => {
  const starts: number[] = [];
  walkReached(root, (node) => {
    if (
      SUSPENDING_EXPRESSIONS.has(node.type) ||
      (node.type === AST_NODE_TYPES.ForOfStatement && node.await)
    ) {
      starts.push(node.range[0]);
    }
  });
  return starts;
};

const LOOP_STATEMENTS = new Set<string>([
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement,
]);

/**
 * Whether the container runs its statements repeatedly and, as written, without
 * ever giving up its turn.
 *
 * Such a loop completes in one task, and code after it observes only its
 * finished state. Anchoring inside it would insert a suspension the loop never
 * had, so every iteration would hand control back — the same class of silent
 * change as jumping a guard, one level down. The declaration is handed to the
 * next container out instead, which is also where a reader would write it: one
 * load ahead of the loop rather than an `await` per iteration.
 *
 * A loop that already awaits keeps the declaration: its iterations interleave
 * either way, and a body that never runs then loads nothing at all.
 */
const repeatsAtomically = (container: TSESTree.Node): boolean => {
  const loop = container.parent;
  if (
    !loop ||
    !LOOP_STATEMENTS.has(loop.type) ||
    (loop as unknown as { body: TSESTree.Node }).body !== container
  ) {
    return false;
  }
  return suspensionStartsIn(loop).length === 0;
};

/**
 * Statements that leave their container to whatever follows it: none of them
 * ends the container's own run.
 *
 * A block whose remainder returns is not a step towards the statements after
 * it, so what is written there never runs behind the relocated `await` on this
 * path and says nothing about the placement.
 */
const EXITING_STATEMENTS = new Set<string>([
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

const fallsThrough = (statements: readonly TSESTree.Node[]): boolean =>
  !statements.some((statement) => EXITING_STATEMENTS.has(statement.type));

/**
 * Every statement the relocated `await` would newly precede: the rest of the
 * anchor's own list, and then the rest of each list enclosing it, out to the
 * function body.
 *
 * A check-then-act is not always written at the anchor's depth — a guard can
 * follow the block the anchor sits in — so a region cut at the anchor's own
 * container would read that guard as absent. The walk stops at the first level
 * whose remainder cannot be left, since the statements past it do not run
 * behind the `await` at all.
 */
const executedAfter = (
  site: ReferenceSite,
  index: number,
  body: TSESTree.BlockStatement,
): TSESTree.Node[] => {
  const region: TSESTree.Node[] = [...site.statements.slice(index)];
  let child: TSESTree.Node = site.container;
  let parent: TSESTree.Node | undefined = site.container.parent;
  let reachable = fallsThrough(region);
  while (reachable && parent && child !== body) {
    const enclosing = statementsOf(parent);
    const position = enclosing ? enclosing.indexOf(child) : -1;
    if (enclosing && position !== -1) {
      // The statement holding `child` is already walked through `child` itself,
      // so only what follows it is added.
      const following = enclosing.slice(position + 1);
      region.push(...following);
      reachable = fallsThrough(following);
    }
    child = parent;
    parent = parent.parent;
  }
  return region;
};

/** A path the region assigns, with the offset the assignment is written at. */
type StateWrite = {
  readonly path: string;
  readonly start: number;
};

/**
 * The `if` tests already passed on the way to the anchor.
 *
 * They are guards the injected `await` lands BEHIND rather than ahead of, which
 * is a hazard of its own when the act they protect follows: a test read in the
 * caller's task and an act performed a module load later leaves exactly the
 * window the guard exists to close.
 */
const enclosingGuardTestsOf = (
  anchor: TSESTree.Node,
  body: TSESTree.BlockStatement,
): TSESTree.Expression[] => {
  const tests: TSESTree.Expression[] = [];
  let child: TSESTree.Node = anchor;
  let parent: TSESTree.Node | undefined = anchor.parent;
  while (parent && child !== body) {
    if (parent.type === AST_NODE_TYPES.IfStatement && parent.test !== child) {
      tests.push(parent.test);
    }
    child = parent;
    parent = parent.parent;
  }
  return tests;
};

/**
 * Whether declaring the import ahead of `anchor` would put its `await` inside a
 * check-then-act on state that outlives the call.
 *
 * This is the defect the issue leads with (#2103), and no anchor position
 * escapes it: a re-entrancy guard reading `busy`, or a status test whose flip
 * follows it, is written to run in the caller's own task, and a module load
 * anywhere between the test and the act is the window a second call lands in.
 * Both calls reach the test before either performs the act, and the guard stops
 * guarding.
 *
 * Three conditions have to hold together, and each one alone is ordinary code:
 *
 *   - the test reads a path that a statement running behind the `await` WRITES.
 *     A test of a value nothing here assigns (`if (op === 'mint')`) is a branch,
 *     not a guard, and a suspension near it changes nothing it observes.
 *   - the path outlives one call, which is what makes a second call able to see
 *     the act. A binding declared inside the async function is created fresh
 *     per call and, since the test and the act keep their order relative to
 *     each other, cannot tell the difference.
 *   - nothing suspends in the window already. A guard behind an existing
 *     `await`, or one whose act is already reached through one, runs across
 *     tasks whatever this fixer does, so the relocation is not what makes it
 *     unreliable.
 *
 * Reads alone are deliberately not enough. Every reference is a read, so
 * treating one as disqualifying would withhold the fix from every placement
 * that has a branch in it — including sibling branches, where the anchor is the
 * position a reader would pick.
 */
const jumpsCheckThenAct = (
  anchor: TSESTree.Node,
  region: readonly TSESTree.Node[],
  body: TSESTree.BlockStatement,
  outlivesCall: (path: string) => boolean,
): boolean => {
  const guards = enclosingGuardTestsOf(anchor, body);
  const writes: StateWrite[] = [];
  for (const statement of region) {
    walkReached(statement, (node) => {
      if (node.type === AST_NODE_TYPES.IfStatement) {
        guards.push(node.test);
      }
      const written = writtenPathOf(node);
      if (written !== null) {
        writes.push({ path: written, start: node.range[0] });
      }
    });
  }
  if (guards.length === 0 || writes.length === 0) {
    return false;
  }

  const suspensions = suspensionStartsIn(body);
  return guards.some((test) => {
    if (suspensions.some((start) => start < test.range[0])) {
      return false;
    }
    const read = new Set<string>();
    readPathsInto(test, read);
    // A guard the `await` is inserted AHEAD of moves wholesale, test and all;
    // one it is inserted BEHIND only has its window widened, so an existing
    // suspension in that window means the fixer is not what opened it.
    const jumped = test.range[0] > anchor.range[0];
    return writes.some(
      (write) =>
        read.has(write.path) &&
        outlivesCall(write.path) &&
        (jumped ||
          !suspensions.some(
            (start) => start >= test.range[1] && start < write.start,
          )),
    );
  });
};

/**
 * The statement the relocated declaration goes immediately ahead of, or null
 * when no position serves every reference safely.
 *
 * Heading the function body instead puts the module-load `await` in front of
 * whatever the body ran before the first reference — a re-entrancy guard, a
 * synchronous state flip — which turns synchronous prelude code into
 * post-await code and silently changes behaviour (#2103). The declaration
 * therefore heads the innermost list enclosing every reference, ahead of the
 * first statement of that list holding one.
 *
 * Statements ahead of that anchor keep their order and stay ahead of the
 * injected `await`, so the placement only ever moves the suspension point
 * LATER than heading the body would. When the anchor already IS the head of
 * the list, the emission is what heading the body produced all along.
 *
 * Three positions are refused rather than approximated:
 *
 *   - a reference inside a `try` block the anchor sits outside of. The `catch`
 *     was written to absorb what that block throws, and a chunk-load rejection
 *     is exactly what the relocated `await` adds to it, so an outside position
 *     would let the rejection escape. No position is both inside the block and
 *     in scope for a reference outside it, so the fix is withheld and the
 *     report stands. Leaving a `catch` or `finally` block is not refused: what
 *     they throw was never caught by their own `try`.
 *   - a position that puts the module load inside a check-then-act on state
 *     that outlives the call, per {@link jumpsCheckThenAct} — whether the
 *     `await` lands ahead of the test or between the test and the act. That is
 *     the issue's leading defect, and no anchor escapes it: the guard and the
 *     reference it protects are frequently the same statement. The remedy the
 *     issue asks for is the report without the fix, since a manual placement is
 *     cheap and a guard that stops guarding is not.
 *   - a directive prologue, which a declaration in front of would demote to a
 *     discarded string expression.
 *
 * Nothing else is refused, because refusing costs a fix that exists today and
 * buys nothing over it. A reference in a braceless guard body
 * (`if (x) return create();`) is the sharpest case: its guard has no statement
 * list, so the anchor is the guard itself and the `await` precedes the test.
 * That is where heading the body already put it — the placement is never
 * EARLIER than the fix it replaces, only later — and reaching between the test
 * and the reference would mean giving a statement the fixer does not own a
 * block it was not written with.
 */
const anchorStatementOf = (
  identifiers: readonly TSESTree.Node[],
  body: TSESTree.BlockStatement,
  outlivesCall: (path: string) => boolean,
): TSESTree.Node | null => {
  const chains: ReferenceSite[][] = [];
  for (const identifier of identifiers) {
    const sites = referenceSitesOf(identifier, body);
    if (!sites) {
      return null;
    }
    chains.push(sites);
  }

  // The anchor an atomic loop body yields, kept in case no container further
  // out is usable. An `await` per iteration is the milder of the two changes:
  // it costs the loop its atomicity, where an outward position can cost a
  // guard its guarantee or a `catch` its coverage.
  let repeated: TSESTree.Node | null = null;
  for (const shared of sharedSiteChainOf(chains)) {
    if (shared.some((site) => site.leavesTryBlock)) {
      break;
    }
    const { statements, container } = shared[0];
    const earliest = shared.reduce(
      (position, site) => Math.min(position, positionOf(statements, site)),
      statements.length,
    );
    const index = Math.max(earliest, prologueLengthOf(statements));
    const anchor = statements[index];
    // A directive prologue that runs the whole list leaves no statement here.
    // No reference can sit in a directive, so this is a floor rather than a
    // placement, and the report stands on its own.
    if (!anchor) {
      break;
    }
    if (
      jumpsCheckThenAct(
        anchor,
        executedAfter(shared[0], index, body),
        body,
        outlivesCall,
      )
    ) {
      // Every container further out is EARLIER, so it jumps the same guard and
      // more besides; there is nothing left to try.
      return repeated;
    }
    if (!repeatsAtomically(container)) {
      return anchor;
    }
    repeated = repeated ?? anchor;
  }
  return repeated;
};

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

        /** Every identifier that READS the import, type positions included. */
        const valueReferences = (): (
          | TSESTree.Identifier
          | TSESTree.JSXIdentifier
        )[] => {
          const valueLocalNames = new Set(
            [
              defaultSpecifier?.local.name,
              namespaceSpecifier?.local.name,
              ...namedSpecifiers.map((spec) => spec.local.name),
            ].filter((name): name is string => name !== undefined),
          );

          return context
            .getDeclaredVariables(node)
            .filter((variable) => valueLocalNames.has(variable.name))
            .flatMap((variable) => variable.references)
            .map((reference) => reference.identifier);
        };

        /**
         * The async function the declaration moves into.
         *
         * An `ImportDeclaration` only ever sits at module scope, so rewriting
         * it in place can only ever produce a module-scope `await import(...)`
         * — which defers nothing (the module still awaits it during
         * evaluation) and does not even parse once the file is compiled to
         * CommonJS, where top-level await does not exist (issue #1716).
         *
         * The rewrite is therefore only expressible when every value reference
         * lives in one async function: the declaration can then move inside it,
         * exactly the shape the codebase writes by hand. Anything else is a
         * per-call-site refactor the fixer declines rather than corrupts.
         */
        const findRelocationTarget = (
          references: readonly (TSESTree.Identifier | TSESTree.JSXIdentifier)[],
        ): FunctionNode | undefined => {
          // Nothing reads the binding, so there is no call site to defer to.
          if (references.length === 0) {
            return undefined;
          }

          let target: FunctionNode | undefined;
          for (const reference of references) {
            const enclosing =
              enclosingAsyncBodyOf(reference) ??
              enclosingConciseAsyncArrowOf(reference);
            if (!enclosing || (target && target !== enclosing)) {
              return undefined;
            }
            target = enclosing;
          }
          return target;
        };

        /**
         * Whether a path names state that outlives one call of `fn`, and so
         * state a SECOND call can observe between the injected `await` and the
         * act that follows it.
         *
         * A bare name declared inside the function — a parameter, a local
         * `let` — is created fresh per call, so no other call can read the one
         * this call flips, and the test and the act keep their order relative
         * to each other whatever precedes them. A member path is shared
         * whatever binding roots it: `ref.current` and `this.busy` name a
         * property of an object the call did not create, which is precisely
         * the React ref that re-entrancy guards are written against.
         */
        const outlivesCallOf = (
          fn: FunctionNode,
        ): ((path: string) => boolean) => {
          const local = new Set<string>();
          const collect = (scope: TSESLint.Scope.Scope): void => {
            for (const variable of scope.variables) {
              local.add(variable.name);
            }
            scope.childScopes.forEach(collect);
          };
          const scope = sourceCode.scopeManager?.acquire(fn);
          if (scope) {
            collect(scope);
          }
          return (path: string) => path.includes('.') || !local.has(path);
        };

        const indentationAt = (line: number): string =>
          /^[ \t]*/.exec(sourceCode.lines[line - 1] ?? '')?.[0] ?? '';

        /** The text of a node's own line ahead of it, comments included. */
        const linePrefixOf = (
          subject: TSESTree.Node | TSESTree.Comment,
        ): string =>
          (sourceCode.lines[subject.loc.start.line - 1] ?? '').slice(
            0,
            subject.loc.start.column,
          );

        /**
         * The run of comments written on their own lines directly above a
         * statement.
         *
         * They document the statement, so the declaration goes ahead of the
         * whole run rather than between a comment and its subject — which is
         * also what heading the body did when the statement was the first one.
         * A comment sharing a line with the code before it describes that code
         * and ends the run.
         */
        const ownLineCommentsBefore = (
          statement: TSESTree.Node,
        ): TSESTree.Comment[] => {
          const comments = sourceCode.getCommentsBefore(statement);
          let first = comments.length;
          while (first > 0 && linePrefixOf(comments[first - 1]).trim() === '') {
            first -= 1;
          }
          return comments.slice(first);
        };

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
          const references = valueReferences();
          const target = findRelocationTarget(references);
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
          const anchor = anchorStatementOf(
            references,
            body,
            outlivesCallOf(target),
          );
          if (!anchor) {
            return null;
          }

          const head = ownLineCommentsBefore(anchor)[0] ?? anchor;
          const linePrefix = linePrefixOf(head);
          // A statement that begins its line gets the declaration on a line of
          // its own at the same column; one sharing its line with what precedes
          // it keeps that layout instead.
          //
          // The shared line is the single emission the print width does not
          // govern: a block body holding statements is a shape no formatter
          // prints on one line at all, so there is no width at which the
          // author's layout survives and no wrapped form that would restore it.
          // Breaking the declaration open there would abandon that layout
          // without buying anything. Every other emission lands on a fresh line
          // whose column is known, and is printed against it.
          const headsLine = linePrefix.trim() === '';
          const bodyIndent = headsLine
            ? linePrefix
            : `${indentationAt(target.loc.start.line)}${fileIndentUnit()}`;

          // A carried comment forces the multi-line form even on a shared line:
          // a `//` comment appended to that line would swallow the rest of it,
          // and the comment-free emission is unchanged either way.
          const carried = carriedImportComments(bodyIndent);
          const emitted = [
            ...(carried === null ? [] : [carried]),
            ...printAt(declarations, bodyIndent),
          ];

          if (headsLine) {
            return [
              importEdit,
              fixer.insertTextBeforeRange(
                [head.range[0], head.range[0]],
                emitted
                  .map((statement) => `${statement}\n${bodyIndent}`)
                  .join(''),
              ),
            ];
          }

          // Emitting after the preceding token rather than before the anchor
          // keeps the author's spacing on the shared line where it is: the
          // declaration takes the position the line already reads at.
          const previous = sourceCode.getTokenBefore(anchor);
          if (!previous) {
            return null;
          }
          const insertion =
            carried === null
              ? ` ${declarations.map(printInline).join(' ')}`
              : emitted
                  .map((statement) => `\n${bodyIndent}${statement}`)
                  .join('');

          return [
            importEdit,
            fixer.insertTextAfterRange(
              [previous.range[1], previous.range[1]],
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
