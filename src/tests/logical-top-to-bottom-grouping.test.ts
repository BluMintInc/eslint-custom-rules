import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs } from '../utils/ruleTester';
import { logicalTopToBottomGrouping } from '../rules/logical-top-to-bottom-grouping';
import { configs, rules } from '../index';

ruleTesterTs.run('logical-top-to-bottom-grouping', logicalTopToBottomGrouping, {
  valid: [
    // A declaration reading a property captures whatever that property held at
    // that point, so hoisting an effect above it changes what was measured. The
    // before/after comparison from #1493 is the shape that breaks silently.
    `
it('re-renders when the tournament changes', () => {
  render('goalBar');
  setLiveTournament(buildTournament());
  const rendersAfterMount = COUNTS.goalBar;

  setLiveTournament(buildTournament({ intermissions: [] }));

  expect(COUNTS.goalBar).toBeGreaterThan(rendersAfterMount);
});
`,
    `
const before = counter.value;

bump();

expect(counter.value).toBeGreaterThan(before);
`,
    // The barrier follows the read wherever it sits in the initializer, not just
    // at the top level.
    `
const snapshot = { count: counter.value, label: 'x' };

bump();

use(snapshot);
`,
    `
const doubled = counter.value * 2;

bump();

use(doubled);
`,
    `
const group = useGroupDoc();
const { id } = group || {};

const { groupTabState } = useGroupRouter();
    `,
    `
if (id !== null) {
  return null;
}
const { a } = props.group;
const b = a;
    `,
    `
const state = useGroupDoc();
if (!state.ready) {
  return null;
}
render(state);
    `,
    `
const group = useGroupDoc();
logGroup(group);
const { id } = group || {};
    `,
    `
const message = buildMessage();
console.log(message);
    `,
    `
let count = 0;
count += 1;
    `,
    `
let cache;
cache = compute();
    `,
    `
const group = useGroupDoc();
const id = read(group);
useId(id);
    `,
    `
const value = compute();
if (!value) {
  console.warn('missing');
  return;
}
use(value);
    `,
    `
const ready = getReady();
const result = 1;
if (!ready) {
  return result;
}
use(result);
    `,
    `
let source = 1;
const copy = source;
source = 2;
use(copy);
    `,
    `
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};
    `,
    // The settled form of the documented example: the derived destructure sits
    // next to its dependency, so the trailing pure declaration is not a violation.
    `
const { groupTabState } = useGroupRouter();
const group = useGroupDoc();
const { id } = group || {};
const extra = 1;
    `,
    `
const state = useState(0);
console.log('ready');
state[1](state[0] + 1);
    `,
    `
const value = source[getIndex()];
if (!shouldContinue()) {
  return;
}
use(value);
    `,
    `
const record = { [computeKey()]: value };
if (!ok()) {
  return;
}
use(record);
    `,
    `
const base = getBase();
const snapshot = derived;
var derived = base.value;
    `,
    `
const state = getState();
let copy = state;
processState(state);
use(copy);
    `,
    `
function f() {
  var x = y;
  var y = 2;
  console.log(x, y);
}
    `,
    `
function g() {
  let x = y;
  let y = 1;
  return x + y;
}
    `,
    `
const source = getSource();
const fallback = 1;
const { value = fallback } = source;
use(value, fallback);
    `,
    `
function hoistShouldRespectRedeclaration() {
  var x = 1;
  var x = 2;
  use(x);
}
    `,
    `
function doNotJumpOverRedeclaredDerived() {
  const base = getBase();
  var value = 2;
  var value = base.count;
  use(value);
}
    `,
    `
function avoidMovingCallsAcrossRedeclaredFunctions() {
  var fn = () => first;
  const first = 1;
  var fn = () => second;
  const second = 2;
  fn();
}
    `,
    `
function preserveClosureTiming() {
  let x;
  inner();
  function inner() {
    console.log(x);
  }
  x = 1;
}
    `,
    `
function outer() {
  inner();
}
function inner() {
  console.log(value);
}
const value = readValue();
outer();
    `,
    `
function hoistedFunctionsUseLastDeclaration() {
  function foo() {}
  function foo() {
    console.log(value);
  }
  const value = 1;
  foo();
}
    `,
    `
const obj = makeObject();
if (obj!.disabled) {
  return;
}
use(obj);
    `,
    `
let data;
const id = getId();
const status = checkStatus();
if (shouldFetch) {
  data = fetchData();
}
    `,
    `
let counter = 0;
const mid = doMid();
log(mid);
console.log(counter);
    `,
    `
let logger;
function logAll() {
  return 1;
}
logger = createLogger();
    `,
    `
const obj = {
  method() {
    return data;
  },
};

const data = 1;
obj.method();
    `,
    `
class Service {
  run() {
    return config;
  }
}

const service = new Service();
const config = loadConfig();
service.run();
    `,
    `
let obj = {};
obj = {
  method() {
    return data;
  },
};
const data = loadData();
obj.method();
    `,
    `
const create = () => ({
  method() {
    return config;
  },
});
const config = getConfig();
const instance = create();
instance.method();
    `,
    `
const value = 1;
if (shouldExit) {
  return (() => value)();
}
`,
    `
const value = 1;
console.log((() => value)());
`,
    `
const { value = record() } = source;
if (shouldStop) {
  return;
}
`,
    `
const { [getKey()]: value } = source;
console.log('ready');
    `,
    `
const ready = readReady();
const removal = delete window.cache;
console.log('done');
    `,
    `
const obj = build();
(obj as any).state.value = 1;
console.log(obj.state.value);
    `,
    `
const fn = () => late;
const placeholder = 1;
let late = 1;
(fn as () => void)();
    `,
    `
const source = 1;
const data = source;
doSideEffect((value = data) => value);
    `,
    `
const obj = {
  call() {
    obj.call();
  },
};

obj.call();
    `,
    `
const [firestoreModule, firebaseFirestoreModule] = await Promise.all([
  import('../../config/firebase-client/firestore'),
  import('firebase/firestore'),
]);
const { firestore } = firestoreModule;
const { doc, updateDoc, setDoc } = firebaseFirestoreModule;
    `,
    `
const { moduleA, moduleB } = await loadModules();
const { helperA } = moduleA;
const { helperB } = moduleB;
    `,
    `
const [first, second] = splitPair();
const x = first;
const y = second;
    `,
    `
const [alpha, beta, gamma] = getTriple();
const a = alpha.value;
const b = beta.value;
const c = gamma.value;
    `,
    // loop accumulator before a for-of; only use is in-loop compound assignment
    `function backfill(items: readonly string[]) {
  let fieldsWritten = 0;
  let skipped = 0;

  for (const item of items) {
    if (item === '') {
      skipped += 1;
      continue;
    }
    fieldsWritten += 1;
  }

  return { fieldsWritten, skipped };
}`,
    // while-loop accumulator, no read after loop
    `function count(n: number) {
  let total = 0;
  while (total < n) {
    total += 1;
  }
  return total;
}`,
    // ++ accumulator inside a for loop
    `function sumUp(n: number) {
  let i = 0;
  const limit = n;
  for (; i < limit; ) {
    i++;
  }
  return i;
}`,
    // reassignment inside a loop (x = x + 1 form)
    `function accumulate(items: number[]) {
  let total = 0;
  const factor = 1;
  for (const item of items) {
    total = total + item * factor;
  }
  return total;
}`,
    // nested loops — accumulator must stay before outer loop
    `function countNested(matrix: number[][]) {
  let count = 0;
  const rows = matrix;
  for (const row of rows) {
    for (const cell of row) {
      if (cell > 0) {
        count += 1;
      }
    }
  }
  return count;
}`,
    // do-while accumulator
    `function retry(maxAttempts: number) {
  let attempts = 0;
  do {
    attempts += 1;
  } while (attempts < maxAttempts);
  return attempts;
}`,
    // for-in loop accumulator
    `function collectKeys(obj: Record<string, unknown>) {
  let keyCount = 0;
  const src = obj;
  for (const key in src) {
    keyCount += 1;
  }
  return keyCount;
}`,
    // Idempotency check: output of the indented moveDeclarationCloser fix (function f)
    `function f(a: number, b: number) {
  const unrelated = a * b;
  const x = 1;
  return x + unrelated;
}`,
    // Idempotency check: output of the indented moveDeclarationCloser fix (function process)
    `function process(value: number) {
  const a = value + 2;
  const b = value + 3;
  const x = 1;
  return x + a + b;
}`,
  ],
  invalid: [
    // A shebang is only a shebang at character 0. ESLint presents it as a
    // leading comment of the first statement, so relocating that statement used
    // to carry `#!` into the middle of the file, where it no longer parses
    // (TS18026).
    {
      code: `#!/usr/bin/env node

const threshold = 10;

logStart();

use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
      output: `#!/usr/bin/env node

logStart();

const threshold = 10;

use(threshold);
`,
    },
    {
      code: `
const { a } = props.group;
if (id !== null) {
  return null;
}
const b = a;
      `,
      output: `
if (id !== null) {
  return null;
}
const { a } = props.group;
const b = a;
      `,
      errors: [{ messageId: 'moveGuardUp' }],
    },
    // A declaration that captures no property read is not a measurement point,
    // so hoisting across it still applies -- the #1493 barrier is targeted, not
    // a blanket stop at every declaration.
    {
      code: `
const threshold = 10;

logStart();

use(threshold);
`,
      output: `
logStart();

const threshold = 10;

use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
let results = [];

console.log('Processing started');

for (const item of items) {
  results.push(processItem(item));
}
`,
      output: `
console.log('Processing started');

let results = [];

for (const item of items) {
  results.push(processItem(item));
}
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
const base = getBase();
const unrelated = 1;
const detail = base.value;
      `,
      output: `
const base = getBase();
const detail = base.value;
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const first = 1, second = 2;
if (shouldStop) {
  return null;
}
const combined = first + second;
`,
      output: `
if (shouldStop) {
  return null;
}
const first = 1, second = 2;
const combined = first + second;
`,
      errors: [{ messageId: 'moveGuardUp' }],
    },
    {
      code: `
let counter;
const start = 0, end = 1;
counter = start + end;
`,
      output: `
const start = 0, end = 1;
let counter;
counter = start + end;
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
const prefix = 'a';
const suffix = 'b';
console.log('ready');
      `,
      output: `
console.log('ready');
const prefix = 'a';
const suffix = 'b';
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
const base = createBase();
const helper = another();
const count = getCount();
const later = 2;
const derived = base.value * count;
      `,
      output: `
const base = createBase();
const helper = another();
const count = getCount();
const derived = base.value * count;
const later = 2;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const base = getBase();
const temp = other as number;
const derived = base.value;
      `,
      output: `
const base = getBase();
const derived = base.value;
const temp = other as number;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const base = getBase();
const unrelated = 1;
const payload = { base };
      `,
      output: `
const base = getBase();
const payload = { base };
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const shadow = 1, unused = 0;
const other = 2;

(() => {
  const shadow = 3;
  console.log(shadow);
})();

use(other);
      `,
      output: `
(() => {
  const shadow = 3;
  console.log(shadow);
})();

const shadow = 1, unused = 0;
const other = 2;

use(other);
      `,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
const [alpha, beta] = getPair();
const a = alpha.value;
const unrelated = 1;
const b = beta.value;
`,
      output: `
const [alpha, beta] = getPair();
const b = beta.value;
const a = alpha.value;
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Indented invalid case: move preserves indentation and the fix is idempotent
    {
      code: `function f(a: number, b: number) {
  const x = 1;
  const unrelated = a * b;
  return x + unrelated;
}`,
      output: `function f(a: number, b: number) {
  const unrelated = a * b;
  const x = 1;
  return x + unrelated;
}`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // Non-loop late declaration inside a function: simple initializer still flagged
    // and the move preserves indentation on all adjacent statements
    {
      code: `function process(value: number) {
  const x = 1;
  const a = value + 2;
  const b = value + 3;
  return x + a + b;
}`,
      output: `function process(value: number) {
  const a = value + 2;
  const b = value + 3;
  const x = 1;
  return x + a + b;
}`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // Report-only: sinking `mockDoc` toward its use recreates the very separation
    // `groupDerived` flags, so the two handlers would trade the same violation back
    // and forth forever. Reported without a fix.
    {
      code: `
const DEFAULT_DOC = { id: 'a' };
let mockDoc = DEFAULT_DOC;
let mockUsers = {};
run(() => {
  use(mockDoc);
  use(mockUsers);
});
`,
      output: null,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // The opposite phase of the same ping-pong: hoisting `mockDoc` back next to
    // `DEFAULT_DOC` restores the late-declaration violation.
    {
      code: `
const DEFAULT_DOC = { id: 'a' };
let mockUsers = {};
let mockDoc = DEFAULT_DOC;
run(() => {
  use(mockDoc);
  use(mockUsers);
});
`,
      output: null,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Two derivation chains rooted in two separate destructures cannot both be kept
    // adjacent to their sources, so every candidate move trades one violation for
    // another. Reported without a fix rather than cycled over.
    {
      code: `
export const computeMatchCenter = (
  position: BracketCellPosition,
  geometry: BracketGridGeometry,
) => {
  const { cellWidth, gutter, rowTrack } = geometry;
  const { rowStart, rowSpan, columnStart } = position;
  const columnIndex = columnStart - 1;
  const leftX = columnIndex * (cellWidth + gutter);
  const rightX = leftX + cellWidth;
  const centerY = (rowStart - 1 + rowSpan / 2) * rowTrack;
  return { leftX, rightX, centerY } as const;
};
`,
      output: null,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Two independent violations in one body: the emitted reordering satisfies both
    // adjacency constraints, so a single pass clears the block.
    {
      code: `
const base = getBase();
const unrelated = 1;
const detail = base.value;
const other = getOther();
const filler = 2;
const derived = other.value;
`,
      output: `
const base = getBase();
const detail = base.value;
const unrelated = 1;
const other = getOther();
const derived = other.value;
const filler = 2;
`,
      errors: [{ messageId: 'groupDerived' }, { messageId: 'groupDerived' }],
    },
    // Multi-step descent: hoisting the first side effect leaves the count at one
    // because it exposes the next, so the search has to look past that plateau. Both
    // moves ship as one fix.
    {
      code: `
const mockFetch = jest.fn();
let mockRefs: any[] = [];
jest.mock('./onCall', () => ({ onCall: (fn: unknown) => fn }));
jest.mock('./firebaseAdmin', () => ({ db: {} }));
use(mockFetch, mockRefs);
`,
      output: `
const mockFetch = jest.fn();
jest.mock('./onCall', () => ({ onCall: (fn: unknown) => fn }));
jest.mock('./firebaseAdmin', () => ({ db: {} }));
let mockRefs: any[] = [];
use(mockFetch, mockRefs);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // Multi-step descent that crosses handlers: `groupDerived` and `moveGuardUp`
    // constraints are satisfied together by sinking the unrelated destructure past
    // the guard.
    {
      code: `function sync(after: Doc, previewNew: Preview) {
  const { id } = after;
  const { username, imgUrl } = previewNew;
  const { users } = queryUsers(id);
  const [user] = users;
  if (!user) {
    return;
  }
  return update(user, username, imgUrl);
}`,
      output: `function sync(after: Doc, previewNew: Preview) {
  const { id } = after;
  const { users } = queryUsers(id);
  const [user] = users;
  if (!user) {
    return;
  }
  const { username, imgUrl } = previewNew;
  return update(user, username, imgUrl);
}`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Two sibling destructures of one source, each feeding its own derivation. Pulling
    // `metadataA` up to `fieldsA` pushes `fieldsB` out of the sibling group that
    // exempts it, which flags `fieldsB` instead — and the mirrored move flags
    // `fieldsA`. No ordering is clean, so the rule declines rather than relocating one
    // pair and leaving the other violation behind (#1405).
    {
      code: `function merge(props: MergeProps) {
  const { tokenA, tokenB } = props;
  const { amount: _, ...fieldsA } = tokenA;
  const { amount: __, ...fieldsB } = tokenB;
  const metadataA = fieldsA.metadata;
  const metadataB = fieldsB.metadata;
  return { ...fieldsA, ...fieldsB, metadataA, metadataB };
}`,
      output: null,
      errors: [{ messageId: 'groupDerived' }, { messageId: 'groupDerived' }],
    },
    // Interleaved before/after fixtures: the reordering that satisfies every adjacency
    // constraint takes six moves and passes through orders with more violations than it
    // started with, yet it ships as one fix.
    {
      code: `it('routes to the after target', () => {
  const beforeData: TestSource = { id: 's1', name: 'Before' };
  const afterData: TestSource = { id: 's1', name: 'After' };
  const beforeTargetRef = { path: 'targets/t1' } as DocumentReference;
  const afterTargetRef = { path: 'targets/t2' } as DocumentReference;
  const beforeSnap = createMockSnapshot(true, 'sources/s1', beforeData);
  const afterSnap = createMockSnapshot(true, 'sources/s1', afterData);
  const change = createMockChange(beforeSnap, afterSnap);
  const docsBefore = [{ target: { targetId: 't1' }, targetRef: beforeTargetRef }];
  const docsAfter = [{ target: { targetId: 't2' }, targetRef: afterTargetRef }];
  const context = { props: { change, docsBefore, docsAfter } };
  const located = { source: afterData, sourceRef: afterSnap.ref };
  const targets = resolveTargets(context, located);
  expect(targets).toEqual([afterTargetRef]);
});`,
      output: `it('routes to the after target', () => {
  const beforeData: TestSource = { id: 's1', name: 'Before' };
  const beforeSnap = createMockSnapshot(true, 'sources/s1', beforeData);
  const afterData: TestSource = { id: 's1', name: 'After' };
  const afterSnap = createMockSnapshot(true, 'sources/s1', afterData);
  const change = createMockChange(beforeSnap, afterSnap);
  const beforeTargetRef = { path: 'targets/t1' } as DocumentReference;
  const docsBefore = [{ target: { targetId: 't1' }, targetRef: beforeTargetRef }];
  const afterTargetRef = { path: 'targets/t2' } as DocumentReference;
  const docsAfter = [{ target: { targetId: 't2' }, targetRef: afterTargetRef }];
  const context = { props: { change, docsBefore, docsAfter } };
  const located = { source: afterData, sourceRef: afterSnap.ref };
  const targets = resolveTargets(context, located);
  expect(targets).toEqual([afterTargetRef]);
});`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Violations in sibling bodies are independent: each body still contributes one
    // fix in the same pass.
    {
      code: `
const outerBase = getBase();
const outerUnrelated = 1;
const outerDetail = outerBase.value;
function inner() {
  const innerBase = getBase();
  const innerUnrelated = 2;
  const innerDetail = innerBase.value;
  return innerDetail + innerUnrelated;
}
`,
      output: `
const outerBase = getBase();
const outerDetail = outerBase.value;
const outerUnrelated = 1;
function inner() {
  const innerBase = getBase();
  const innerDetail = innerBase.value;
  const innerUnrelated = 2;
  return innerDetail + innerUnrelated;
}
`,
      errors: [
        { messageId: 'groupDerived' },
        { messageId: 'moveDeclarationCloser' },
        { messageId: 'groupDerived' },
      ],
    },
    // A comment sharing a line with a statement annotates it, so it travels with that
    // statement instead of being stranded against whatever lands in its place (#1416).
    {
      code: `
const base = getBase();
const unrelated = 1; // keep this note
const detail = base.value;
`,
      output: `
const base = getBase();
const detail = base.value;
const unrelated = 1; // keep this note
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // A comment on its own line above a statement is that statement's preamble and
    // stays above it, which is the boundary case the same-line rule must not disturb.
    {
      code: `
const base = getBase();
// describes unrelated
const unrelated = 1;
const detail = base.value;
`,
      output: `
const base = getBase();
const detail = base.value;
// describes unrelated
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const base = getBase();
const unrelated = 1; /* keep this */
const detail = base.value;
`,
      output: `
const base = getBase();
const detail = base.value;
const unrelated = 1; /* keep this */
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Both comment kinds attach to one statement, so both move with it.
    {
      code: `
const base = getBase();
// describes unrelated
const unrelated = 1; // and trails it
const detail = base.value;
`,
      output: `
const base = getBase();
const detail = base.value;
// describes unrelated
const unrelated = 1; // and trails it
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The relocated statement is the block's last, whose segment carries no trailing
    // newline — its comment must not be joined onto the following line.
    {
      code: `
const base = getBase();
const unrelated = 1;
const detail = base.value; // derived note
`,
      output: `
const base = getBase();
const detail = base.value; // derived note
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // A comment on the statement the move lands after stays where it is.
    {
      code: `
const base = getBase(); // source note
const unrelated = 1;
const detail = base.value;
`,
      output: `
const base = getBase(); // source note
const detail = base.value;
const unrelated = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Several statements carrying comments reorder in one fix, each keeping its own.
    {
      code: `
const base = getBase();
const unrelated = 1; // note A
const detail = base.value;
const other = getOther();
const filler = 2; // note B
const derived = other.value;
`,
      output: `
const base = getBase();
const detail = base.value;
const unrelated = 1; // note A
const other = getOther();
const derived = other.value;
const filler = 2; // note B
`,
      errors: [{ messageId: 'groupDerived' }, { messageId: 'groupDerived' }],
    },
    // Pins the documented incorrect/correct pair in docs/rules/logical-top-to-bottom-grouping.md.
    // A hook above the dependency is not an intervening barrier, so the derived
    // destructure is pulled up across the pure declaration between them.
    {
      code: `
const { groupTabState } = useGroupRouter();
const group = useGroupDoc();
const extra = 1;
const { id } = group || {};
`,
      output: `
const { groupTabState } = useGroupRouter();
const group = useGroupDoc();
const { id } = group || {};
const extra = 1;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // #1651. Two sequential awaits sit adjacent, so `parallelize-async-operations`
    // owns this block: its `Promise.all` rewrite buys a round trip, while the
    // regrouping here only reads better. The reorder that would satisfy this rule
    // splits the pair with `const receiver`, which does not defer that rewrite but
    // destroys it — the adjacency is the whole of that rule's input. So the
    // violation is reported and the autofix is declined (`output: null`).
    {
      code: `
async function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = await fetchFriends(sender);
  const receiverFriends = await fetchFriends(receiver);
  return [senderFriends, receiverFriends];
}
`,
      output: null,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The same shape with no awaits: nothing competes for the block, so the reorder
    // still ships. The await guard is a constraint on the fix search, not an excuse
    // to stop fixing.
    {
      code: `
function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = friendsOf(sender);
  const receiverFriends = friendsOf(receiver);
  return [senderFriends, receiverFriends];
}
`,
      output: `
function loadPair(payload: Payload) {
  const sender = payload.sender;
  const senderFriends = friendsOf(sender);
  const receiver = payload.receiver;
  const receiverFriends = friendsOf(receiver);
  return [senderFriends, receiverFriends];
}
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // Deliberate over-yield: these awaits share a receiver, so
    // `parallelize-async-operations` treats them as dependent and declines — nothing
    // would have been lost by reordering. The guard is syntactic on purpose; matching
    // that rule's eligibility would mean duplicating its dependency analysis and
    // tracking its options from here, which couples two rules far more tightly than a
    // withheld autofix costs. Adjacent awaits therefore forfeit the fix either way.
    {
      code: `
async function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = await api.fetch(sender);
  const receiverFriends = await api.fetch(receiver);
  return [senderFriends, receiverFriends];
}
`,
      output: null,
      errors: [{ messageId: 'groupDerived' }],
    },
    // A lone await is not a run: no adjacency-based rewrite exists for it, so the
    // reorder that splits it from the statement below ships as before.
    {
      code: `
async function loadOne(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = await fetchFriends(sender);
  return [senderFriends, receiver];
}
`,
      output: `
async function loadOne(payload: Payload) {
  const sender = payload.sender;
  const senderFriends = await fetchFriends(sender);
  const receiver = payload.receiver;
  return [senderFriends, receiver];
}
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The run stays intact under the reordering, so the fix ships: the guard prunes
    // the search, it does not switch the fixer off for any block containing awaits.
    // Two violations resolve in one pass with the await pair untouched.
    {
      code: `
async function load() {
  const base = getBase();
  const unrelated = 1;
  const detail = base.value;
  const other = getOther();
  const filler = 2;
  const derived = other.value;
  const first = await fetchFirst();
  const second = await fetchSecond();
  use(detail, derived, unrelated, filler, first, second);
}
`,
      output: `
async function load() {
  const base = getBase();
  const detail = base.value;
  const unrelated = 1;
  const other = getOther();
  const derived = other.value;
  const filler = 2;
  const first = await fetchFirst();
  const second = await fetchSecond();
  use(detail, derived, unrelated, filler, first, second);
}
`,
      errors: [{ messageId: 'groupDerived' }, { messageId: 'groupDerived' }],
    },
    // A statement relocating across a run keeps the fix as long as it lands outside
    // it: contiguity, not distance, is what the guard protects.
    {
      code: `
async function load() {
  const base = getBase();
  const first = await fetchFirst();
  const second = await fetchSecond();
  const unrelated = 1;
  const detail = base.value;
  use(detail, unrelated, first, second);
}
`,
      output: `
async function load() {
  const base = getBase();
  const first = await fetchFirst();
  const second = await fetchSecond();
  const detail = base.value;
  const unrelated = 1;
  use(detail, unrelated, first, second);
}
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // An await run built from expression statements is protected on the same terms as
    // one built from declarations, and a reorder above it still ships.
    {
      code: `
async function load() {
  const base = getBase();
  const unrelated = 1;
  const detail = base.value;
  await flushFirst();
  await flushSecond();
  use(detail, unrelated);
}
`,
      output: `
async function load() {
  const base = getBase();
  const detail = base.value;
  const unrelated = 1;
  await flushFirst();
  await flushSecond();
  use(detail, unrelated);
}
`,
      errors: [{ messageId: 'groupDerived' }],
    },
  ],
});

/**
 * RuleTester applies a single fix pass, so it cannot observe an autofix that never
 * settles. Driving the linter to a fixpoint is the only way to assert convergence
 * (#1405).
 */
type FixpointResult = {
  text: string;
  passes: number;
  cycled: boolean;
  pendingFixes: number;
};

const fixToFixpoint = (code: string, maxPasses = 12): FixpointResult => {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  linter.defineRule('ltb', logicalTopToBottomGrouping as never);
  const config = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: { ltb: 'error' },
  } as unknown as Linter.Config;

  const seen = new Set<string>([code]);
  let text = code;
  let passes = 0;
  let cycled = false;

  for (; passes < maxPasses; passes += 1) {
    const { output, fixed } = linter.verifyAndFix(text, config, 'file.ts');
    if (!fixed || output === text) {
      break;
    }
    if (seen.has(output)) {
      text = output;
      cycled = true;
      break;
    }
    seen.add(output);
    text = output;
  }

  // `verifyAndFix` loops internally, so an even-period oscillation hands back the
  // input text and masquerades as a fixpoint. A fix still offered on text the fixer
  // refuses to change is that oscillation.
  const pendingFixes = linter
    .verify(text, config, 'file.ts')
    .filter((message) => message.fix).length;

  return { text, passes, cycled: cycled || passes === maxPasses, pendingFixes };
};

describe('logical-top-to-bottom-grouping autofix convergence', () => {
  const PING_PONG = `const DEFAULT_DOC = { id: 'a' };
let mockDoc = DEFAULT_DOC;
let mockUsers = {};
run(() => {
  use(mockDoc);
  use(mockUsers);
});
`;

  const PING_PONG_MIRROR = `const DEFAULT_DOC = { id: 'a' };
let mockUsers = {};
let mockDoc = DEFAULT_DOC;
run(() => {
  use(mockDoc);
  use(mockUsers);
});
`;

  const UNSATISFIABLE_CHAINS = `export const computeMatchCenter = (
  position: BracketCellPosition,
  geometry: BracketGridGeometry,
) => {
  const { cellWidth, gutter, rowTrack } = geometry;
  const { rowStart, rowSpan, columnStart } = position;
  const columnIndex = columnStart - 1;
  const leftX = columnIndex * (cellWidth + gutter);
  const rightX = leftX + cellWidth;
  const centerY = (rowStart - 1 + rowSpan / 2) * rowTrack;
  return { leftX, rightX, centerY } as const;
};
`;

  const SIBLING_DESTRUCTURE_PAIRS = `function merge(props: MergeProps) {
  const { tokenA, tokenB } = props;
  const { amount: _, ...fieldsA } = tokenA;
  const { amount: __, ...fieldsB } = tokenB;
  const metadataA = fieldsA.metadata;
  const metadataB = fieldsB.metadata;
  return { ...fieldsA, ...fieldsB, metadataA, metadataB };
}
`;

  const INTERLEAVED_FIXTURES = `it('routes to the after target', () => {
  const beforeData: TestSource = { id: 's1', name: 'Before' };
  const afterData: TestSource = { id: 's1', name: 'After' };
  const beforeTargetRef = { path: 'targets/t1' } as DocumentReference;
  const afterTargetRef = { path: 'targets/t2' } as DocumentReference;
  const beforeSnap = createMockSnapshot(true, 'sources/s1', beforeData);
  const afterSnap = createMockSnapshot(true, 'sources/s1', afterData);
  const change = createMockChange(beforeSnap, afterSnap);
  const docsBefore = [{ target: { targetId: 't1' }, targetRef: beforeTargetRef }];
  const docsAfter = [{ target: { targetId: 't2' }, targetRef: afterTargetRef }];
  const context = { props: { change, docsBefore, docsAfter } };
  const located = { source: afterData, sourceRef: afterSnap.ref };
  const targets = resolveTargets(context, located);
  expect(targets).toEqual([afterTargetRef]);
});
`;

  const SINGLE_PAIR = `const base = getBase();
const unrelated = 1;
const detail = base.value;
`;

  const TWO_CHAINS = `const base = getBase();
const unrelated = 1;
const detail = base.value;
const other = getOther();
const filler = 2;
const derived = other.value;
`;

  const MULTI_STEP_SIDE_EFFECTS = `const mockFetch = jest.fn();
let mockRefs: any[] = [];
jest.mock('./onCall', () => ({ onCall: (fn: unknown) => fn }));
jest.mock('./firebaseAdmin', () => ({ db: {} }));
use(mockFetch, mockRefs);
`;

  const MULTI_STEP_CROSS_HANDLER = `function sync(after: Doc, previewNew: Preview) {
  const { id } = after;
  const { username, imgUrl } = previewNew;
  const { users } = queryUsers(id);
  const [user] = users;
  if (!user) {
    return;
  }
  return update(user, username, imgUrl);
}
`;

  const NESTED_BODIES = `const outerBase = getBase();
const outerUnrelated = 1;
const outerDetail = outerBase.value;
function inner() {
  const innerBase = getBase();
  const innerUnrelated = 2;
  const innerDetail = innerBase.value;
  return innerDetail + innerUnrelated;
}
`;

  const TRAILING_COMMENTS = `const base = getBase();
const unrelated = 1; // note A
const detail = base.value;
const other = getOther();
const filler = 2; /* note B */
const derived = other.value;
`;

  // A comment on the block's last statement has no trailing newline to carry, so a
  // reordering that relocates it is where line-joining would surface.
  const TRAILING_COMMENT_LAST = `const base = getBase();
const unrelated = 1;
const detail = base.value; // derived note
`;

  it.each([
    ['cross-handler ping-pong', PING_PONG],
    ['cross-handler ping-pong (opposite phase)', PING_PONG_MIRROR],
    ['interleaved chains from two destructures', UNSATISFIABLE_CHAINS],
    ['sibling destructures feeding two derivations', SIBLING_DESTRUCTURE_PAIRS],
  ])('leaves %s untouched instead of oscillating', (_label, code) => {
    const result = fixToFixpoint(code);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(code);
  });

  // The reordering that satisfies every constraint here is six moves long and passes
  // through orders that report more violations than the input. Emitting it whole is
  // what bounds convergence to a single pass, which is the property `--fix` needs:
  // relocating one statement per pass exhausts ESLint's pass budget on real files.
  it('resolves an interleaved fixture block in one fix pass', () => {
    const result = fixToFixpoint(INTERLEAVED_FIXTURES);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.passes).toBe(1);
    expect(result.text).toBe(`it('routes to the after target', () => {
  const beforeData: TestSource = { id: 's1', name: 'Before' };
  const beforeSnap = createMockSnapshot(true, 'sources/s1', beforeData);
  const afterData: TestSource = { id: 's1', name: 'After' };
  const afterSnap = createMockSnapshot(true, 'sources/s1', afterData);
  const change = createMockChange(beforeSnap, afterSnap);
  const beforeTargetRef = { path: 'targets/t1' } as DocumentReference;
  const docsBefore = [{ target: { targetId: 't1' }, targetRef: beforeTargetRef }];
  const afterTargetRef = { path: 'targets/t2' } as DocumentReference;
  const docsAfter = [{ target: { targetId: 't2' }, targetRef: afterTargetRef }];
  const context = { props: { change, docsBefore, docsAfter } };
  const located = { source: afterData, sourceRef: afterSnap.ref };
  const targets = resolveTargets(context, located);
  expect(targets).toEqual([afterTargetRef]);
});
`);
  });

  /**
   * The convergence property the issue asks for, stated directly: whatever `--fix`
   * settles on must not still offer a fix. A single pass has to suffice, so `passes`
   * is asserted rather than merely bounded.
   */
  it.each([
    ['single pair', SINGLE_PAIR],
    ['two chains', TWO_CHAINS],
    ['multi-step side effects', MULTI_STEP_SIDE_EFFECTS],
    ['multi-step cross handler', MULTI_STEP_CROSS_HANDLER],
    ['interleaved fixtures', INTERLEAVED_FIXTURES],
    ['trailing comments', TRAILING_COMMENTS],
    ['a trailing comment on the last statement', TRAILING_COMMENT_LAST],
  ])('settles %s in a single fix pass', (_label, code) => {
    const result = fixToFixpoint(code);

    expect(result.passes).toBe(1);
    expect(result.pendingFixes).toBe(0);
    expect(result.cycled).toBe(false);
  });

  it('still fixes a straightforward separated derivation in one pass', () => {
    const result = fixToFixpoint(SINGLE_PAIR);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.passes).toBe(1);
    expect(result.text).toBe(`const base = getBase();
const detail = base.value;
const unrelated = 1;
`);
  });

  it('fully resolves independent violations in one body', () => {
    const result = fixToFixpoint(TWO_CHAINS);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`const base = getBase();
const detail = base.value;
const unrelated = 1;
const other = getOther();
const derived = other.value;
const filler = 2;
`);
  });

  // Guards the misattribution directly: every comment must end the pass on the line of
  // the statement it started on, wherever that statement lands (#1416).
  it('keeps each comment attached to its own statement across a reorder', () => {
    const result = fixToFixpoint(TRAILING_COMMENTS);

    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`const base = getBase();
const detail = base.value;
const unrelated = 1; // note A
const other = getOther();
const derived = other.value;
const filler = 2; /* note B */
`);
  });

  it('relocates the block’s last statement without joining its comment', () => {
    const result = fixToFixpoint(TRAILING_COMMENT_LAST);

    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`const base = getBase();
const detail = base.value; // derived note
const unrelated = 1;
`);
  });

  it('fully resolves violations in sibling bodies', () => {
    const result = fixToFixpoint(NESTED_BODIES);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`const outerBase = getBase();
const outerDetail = outerBase.value;
const outerUnrelated = 1;
function inner() {
  const innerBase = getBase();
  const innerDetail = innerBase.value;
  const innerUnrelated = 2;
  return innerDetail + innerUnrelated;
}
`);
  });

  // A move that leaves the count unchanged is still worth making when a bounded run
  // of further moves clears the block. Without this, real code that descends
  // 1 -> 1 -> 0 would be reported and never fixed.
  it('resolves a side-effect chain that descends through an equal count', () => {
    const result = fixToFixpoint(MULTI_STEP_SIDE_EFFECTS);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`const mockFetch = jest.fn();
jest.mock('./onCall', () => ({ onCall: (fn: unknown) => fn }));
jest.mock('./firebaseAdmin', () => ({ db: {} }));
let mockRefs: any[] = [];
use(mockFetch, mockRefs);
`);
  });

  it('resolves a descent that crosses handlers', () => {
    const result = fixToFixpoint(MULTI_STEP_CROSS_HANDLER);

    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
    expect(result.text).toBe(`function sync(after: Doc, previewNew: Preview) {
  const { id } = after;
  const { users } = queryUsers(id);
  const [user] = users;
  if (!user) {
    return;
  }
  const { username, imgUrl } = previewNew;
  return update(user, username, imgUrl);
}
`);
  });

  it.each([
    ['ping-pong', PING_PONG],
    ['ping-pong mirror', PING_PONG_MIRROR],
    ['unsatisfiable chains', UNSATISFIABLE_CHAINS],
    ['single pair', SINGLE_PAIR],
    ['two chains', TWO_CHAINS],
    ['nested bodies', NESTED_BODIES],
    ['multi-step side effects', MULTI_STEP_SIDE_EFFECTS],
    ['multi-step cross handler', MULTI_STEP_CROSS_HANDLER],
    ['sibling destructure pairs', SIBLING_DESTRUCTURE_PAIRS],
    ['interleaved fixtures', INTERLEAVED_FIXTURES],
    ['trailing comments', TRAILING_COMMENTS],
    ['a trailing comment on the last statement', TRAILING_COMMENT_LAST],
  ])('reaches an idempotent fixpoint for %s', (_label, code) => {
    const { text } = fixToFixpoint(code);
    const rerun = fixToFixpoint(text);

    expect(rerun.text).toBe(text);
    expect(rerun.passes).toBe(0);
    expect(rerun.pendingFixes).toBe(0);
  });
});

/**
 * Every other test here registers one rule, so none of them can see what the shipped
 * config does: ESLint applies non-overlapping fixes in `range[0]` order, and this
 * rule's fix range opens at the start of the line above the statement it moves, ahead
 * of where `parallelize-async-operations` anchors on the first await. The reorder
 * therefore won the pass and the `Promise.all` rewrite was dropped — and because the
 * reorder splits the run, that rewrite was never offered again (#1651).
 */
const PARALLELIZE_ID = '@blumintinc/blumint/parallelize-async-operations';
const GROUPING_ID = '@blumintinc/blumint/logical-top-to-bottom-grouping';

const AWAIT_PAIR = `async function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = await fetchFriends(sender);
  const receiverFriends = await fetchFriends(receiver);
  return [senderFriends, receiverFriends];
}
`;

const SYNC_PAIR = `function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = friendsOf(sender);
  const receiverFriends = friendsOf(receiver);
  return [senderFriends, receiverFriends];
}
`;

const composedLinter = () => {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  for (const [name, rule] of Object.entries(rules)) {
    linter.defineRule(`@blumintinc/blumint/${name}`, rule as never);
  }
  return linter;
};

const configFor = (ruleIds: Record<string, string>) =>
  ({
    parser: 'ts',
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    rules: ruleIds,
  } as unknown as Linter.Config);

/**
 * The shipped recommended set minus the rules that demand type information: a bare
 * `Linter` builds no program, so those throw rather than report, and one throw would
 * abort the run and turn this assertion vacuous. Membership is decided by running
 * each rule against the fixture instead of by name, so a rule that becomes type-aware
 * later drops out on its own.
 */
const recommendedRunnableOn = (code: string): Record<string, string> => {
  const linter = composedLinter();
  const runnable: Record<string, string> = {};

  for (const [id, severity] of Object.entries(
    configs.recommended.rules as Record<string, string>,
  )) {
    if (!id.startsWith('@blumintinc/blumint/')) {
      continue;
    }
    if (!rules[id.slice('@blumintinc/blumint/'.length)]) {
      continue;
    }
    try {
      linter.verify(code, configFor({ [id]: severity }), 'file.ts');
      runnable[id] = severity;
    } catch {
      // Type-aware: unavailable to this harness, and irrelevant to fix ordering here.
    }
  }

  return runnable;
};

describe('logical-top-to-bottom-grouping composed with parallelize-async-operations', () => {
  it('yields the fix pass so the Promise.all rewrite lands', () => {
    const linter = composedLinter();
    const config = configFor({
      [GROUPING_ID]: 'error',
      [PARALLELIZE_ID]: 'error',
    });

    // Control: both rules must actually claim this block, or "the rewrite landed"
    // would prove nothing about their interaction.
    const reported = linter
      .verify(AWAIT_PAIR, config, 'file.ts')
      .map((message) => message.ruleId);
    expect(reported).toContain(GROUPING_ID);
    expect(reported).toContain(PARALLELIZE_ID);

    const { output } = linter.verifyAndFix(AWAIT_PAIR, config, 'file.ts');

    expect(output).toContain('await Promise.all([');
    // The reorder is not deferred, it is subsumed: the parallelized form groups the
    // pair's inputs at the call, which satisfies this rule outright.
    expect(linter.verify(output, config, 'file.ts')).toEqual([]);
  });

  it('yields under the full recommended rule set', () => {
    const linter = composedLinter();
    const runnable = recommendedRunnableOn(AWAIT_PAIR);

    expect(runnable[GROUPING_ID]).toBe('error');
    expect(runnable[PARALLELIZE_ID]).toBe('error');

    const { output } = linter.verifyAndFix(
      AWAIT_PAIR,
      configFor(runnable),
      'file.ts',
    );

    expect(output).toContain('await Promise.all([');
  });

  it('still applies its reorder when no await run is at stake', () => {
    const linter = composedLinter();
    const config = configFor({
      [GROUPING_ID]: 'error',
      [PARALLELIZE_ID]: 'error',
    });

    const { output } = linter.verifyAndFix(SYNC_PAIR, config, 'file.ts');

    expect(output).toBe(`function loadPair(payload: Payload) {
  const sender = payload.sender;
  const senderFriends = friendsOf(sender);
  const receiver = payload.receiver;
  const receiverFriends = friendsOf(receiver);
  return [senderFriends, receiverFriends];
}
`);
    expect(linter.verify(output, config, 'file.ts')).toEqual([]);
  });
});
