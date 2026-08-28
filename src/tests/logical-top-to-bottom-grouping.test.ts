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
    // #1762: reading through `export` must not cost the carve-outs. Correctly
    // ordered exported code stays silent for each of the four detectors.
    `
export const threshold = 10;
use(threshold);
logStart();
`,
    `
export const source = getSource();
export const derived = source.value;
export const unrelated = 1;
`,
    `
export const start = 0;
export let counter;
counter = start + 1;
`,
    `
if (id === null) {
  throw new Error('missing');
}
export const a = props.group;
use(a);
`,
    // An exported declaration reading a property still captures observable state,
    // so the effect below it may not be hoisted past it (#1493 applies unchanged).
    `
export const before = counter.value;

bump();

expect(counter.value).toBeGreaterThan(before);
`,
    // An exported impure initializer remains an ordering barrier.
    `
export const value = compute();
logStart();
use(value);
`,
    // `export type` / `export enum` unwrap to non-variable declarations, so they
    // keep the opaque-barrier treatment they had before the unwrap existed.
    `
export type Thing = { a: number };
logStart();
use(other);
`,
    `
export enum Thing {
  A,
}
logStart();
use(other);
`,
    // An exported declaration whose initializer is an await stays inside its run,
    // so `parallelize-async-operations` keeps its Promise.all rewrite.
    `
export const first = await fetchFirst();
export const second = await fetchSecond();
log();
use(first, second);
`,
    // An assertion on a hook callee must not cost the hook carve-out. Reordering
    // hook calls is the one reordering React forbids outright, so a wrapper that
    // hides the callee turns a suppression into a breaking autofix (#1807).
    `
function Comp() {
  const threshold = 10;
  (useTrack as any)();
  return use(threshold);
}
`,
    `
function Comp() {
  const threshold = 10;
  (facade as Facade).useTrack();
  return use(threshold);
}
`,
    // A callee behind an assertion still contributes its captures. Losing them
    // does not merely drop a report: the scan falls through to "resolved with no
    // dependencies" and the reorder hoists the call above what it reads.
    `
const handler = (() => { touch(threshold); }) as Handler;
const threshold = 10;
handler();
`,
    `
const handler = <Handler>(() => { touch(threshold); });
const threshold = 10;
handler();
`,
    // Same, reached through an assertion on the receiver rather than the callee.
    `
const api = { run: () => { touch(threshold); } };
const threshold = 10;
(api as any).run();
`,
    `
const api = { run: () => { touch(threshold); } } as const;
const threshold = 10;
api.run();
`,
    // The candidate test and the dependency read agree on the unwrapped
    // initializer, so an intervening statement that mentions `src` still blocks
    // the move that accepting `src as const` as a candidate now permits.
    `
const src = seed;
const alias = src as const;
const derived = src + 1;
const spacer = 2;
use(alias, derived, spacer);
`,
    // A declaration's bindings share its position, so the statement is late only
    // when the first of them is read late. `y` is read on the very next line, so
    // the declaration already sits where the reader needs it (#1889).
    `function f(a: number, b: number) {
  const x = 1, y = 2;
  const doubled = y;
  return x + doubled + a + b;
}`,
    `function f(a: number, b: number) {
  const y = 2, x = 1;
  const doubled = y;
  return x + doubled + a + b;
}`,
    // Adjacent to its first use in either declarator order.
    `function f() {
  const x = 1, y = 2;
  return x + y;
}`,
    `function f() {
  const y = 2, x = 1;
  return x + y;
}`,
    // An impure statement between the declaration and its use blocks the move for
    // a multi-declarator statement exactly as it does for a single one.
    `function f(flag: boolean) {
  const x = 1, y = 2;
  if (flag) {
    log();
  }
  return x + y;
}`,
    // One complex initializer disqualifies the whole statement: the sibling's call
    // may observe or change state, which is the same reason the single-declarator
    // spelling of it is no candidate either.
    `function f(a: number) {
  const x = 1, y = compute(a);
  const unrelated = a * 2;
  return x + y + unrelated;
}`,
    // A destructuring sibling binds through a pattern whose source is read at the
    // declaration, so the statement stays out of the late-declaration analysis.
    `function f(source: { a: number }) {
  const x = 1, { a } = source;
  const unrelated = 2;
  return x + a + unrelated;
}`,
    // A JSX element name reads a binding just as an ordinary call argument does,
    // so a destructuring that produces the components an effect renders is that
    // effect's own setup and never the "unrelated" setup the report names. Missing
    // the reference carried the declaration below its own use and left a function
    // scope that throws `Cannot access 'Provider' before initialization` — code
    // that parses, type-checks and lints clean (#2042).
    {
      name: 'declines to demote a declaration below a call that reads its bindings (function-scope TDZ)',
      code: `
const renderHarness = (harness) => {
  const { Provider, Probe } = harness;
  render(<Provider docPath="ChatbotIntegration/test"><Probe /></Provider>);
};
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // The same data dependency in each enclosing scope the rule visits: the hazard
    // belongs to the block, not to what encloses it, so a guard that held only at
    // module scope would leave every one of these broken.
    {
      code: `
function renderHarness(harness) {
  const { Provider, Probe } = harness;
  render(<Provider><Probe /></Provider>);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    {
      code: `
const renderHarness = (harness) => {
  const { Provider } = harness;
  render(<Provider />);
};
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    {
      code: `
class Harness {
  run(harness) {
    const { Provider, Probe } = harness;
    render(<Provider><Probe /></Provider>);
  }
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    {
      code: `
function outer(harness) {
  if (harness) {
    const { Provider, Probe } = harness;
    render(<Provider><Probe /></Provider>);
  }
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // A closing element names the same binding its opening element does, so a
    // component used only around children is read exactly as a self-closing one is.
    {
      code: `
function run(harness) {
  const { Wrap } = harness;
  render(<Wrap>text</Wrap>);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // `<Ns.Item />` reads `Ns`; the property half names a member of that value and
    // binds nothing, which is why only the root of the member chain is a dependency.
    {
      code: `
function run(harness) {
  const { Ns } = harness;
  render(<Ns.Item />);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // A component rendered inside a callback is still the effect's dependency: the
    // callback may run the instant it is handed over, so the read is not deferred
    // for the purpose of moving the declaration that produces it.
    {
      code: `
function run(harness) {
  const { Provider } = harness;
  act(() => render(<Provider />));
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // A parameter default runs on entry, so a call sitting there reaches the
    // callee's captures exactly as a call in the body does. Resolving the callee
    // only for body calls left `secret` off the effect's dependency set and the
    // hoist crossed `const secret = 1`, turning working code into a TDZ
    // ReferenceError.
    `
function run() {
  const makeDefault = () => secret;

  const secret = 1;

  ((h = makeDefault()) => { report(h); })();

  use(secret);
}
`,
    // Not arrow-specific: a function expression's parameter default carries the
    // same reach.
    `
function run() {
  const makeDefault = () => secret;

  const secret = 1;

  (function (h = makeDefault()) { report(h); })();

  use(secret);
}
`,
    // A default nested inside a destructuring pattern is still a parameter
    // initializer, so the callee walk has to reach it there too.
    `
function run() {
  const makeDefault = () => secret;

  const secret = 1;

  (({ h = makeDefault() } = {}) => { report(h); })();

  use(secret);
}
`,
    // A default reading the binding directly was always safe, because captures
    // are collected across the parameter list. Kept as the control that pins
    // which half of the pair regressed.
    `
function run() {
  const secret = 1;

  ((h = secret) => { report(h); })();

  use(secret);
}
`,
    // The semantically equivalent spelling: the same call moved into the body.
    // A correct rule treats it identically to the parameter-default spelling.
    `
function run() {
  const makeDefault = () => secret;

  const secret = 1;

  (() => { const h = makeDefault(); report(h); })();

  use(secret);
}
`,
    // The captured binding is what forbids the hoist however many hops away it
    // sits, so a default whose callee is resolved through a chain of
    // declarations is blocked by the read at the far end of that chain.
    `
function run() {
  const readSecret = () => secret;
  const makeDefault = () => readSecret();

  const secret = 1;

  ((h = makeDefault()) => { report(h); })();

  use(secret);
}
`,
    // Function declarations hoist, so the callee resolves regardless of source
    // order; the capture it carries still pins the effect below `secret`.
    `
function run() {
  const secret = 1;

  ((h = makeDefault()) => { report(h); })();

  function makeDefault() {
    return secret;
  }

  use(secret);
}
`,
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
    /**
     * The hoist is the subject here, and `shadow` earns its own report: the block
     * reads that name two statements down, so the declaration is late by exactly
     * the measure the single-declarator spelling of it is judged by. The sibling
     * `unused` withholds the fix for that second report, not the report itself
     * (#1889) — the hoist still carries the block's one fix.
     */
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
      errors: [
        { messageId: 'moveDeclarationCloser', data: { name: 'shadow' } },
        { messageId: 'moveSideEffect' },
      ],
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
    /**
     * #1762: `export` is a modifier on a declaration, not a distinct statement
     * kind. Every classifier reads through the wrapper, so all four detectors see
     * the exported spelling exactly as they see the bare one — and the fix keeps
     * `export` welded to the declaration it modifies.
     */
    {
      code: `
export const threshold = 10;
logStart();
use(threshold);
`,
      output: `
logStart();
export const threshold = 10;
use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
export const a = props.group;
if (id !== null) {
  throw new Error('bad');
}
use(a);
`,
      output: `
if (id !== null) {
  throw new Error('bad');
}
export const a = props.group;
use(a);
`,
      errors: [{ messageId: 'moveGuardUp' }],
    },
    {
      code: `
export const source = getSource();
export const unrelated = 1;
export const other = 2;
export const derived = source.value;
`,
      output: `
export const source = getSource();
export const derived = source.value;
export const unrelated = 1;
export const other = 2;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The hole hits the moved statement independently of the ones around it: only
    // the derivation carries `export` here.
    {
      code: `
const source = getSource();
const unrelated = 1;
const other = 2;
export const derived = source.value;
`,
      output: `
const source = getSource();
export const derived = source.value;
const unrelated = 1;
const other = 2;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // …and independently of the dependency source, which carries `export` here.
    {
      code: `
export const source = getSource();
const unrelated = 1;
const other = 2;
const derived = source.value;
`,
      output: `
export const source = getSource();
const derived = source.value;
const unrelated = 1;
const other = 2;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
export let counter;
const start = 0, end = 1;
counter = start + end;
`,
      output: `
const start = 0, end = 1;
export let counter;
counter = start + end;
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
export const x = 1;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
export const x = 1;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // An exported declaration is a crossable statement as well as a movable one:
    // scored impure it broke the backward scan at the first `export` (#1762).
    {
      code: `
export const first = 1;
export const second = 2;
logStart();
use(first, second);
`,
      output: `
logStart();
export const first = 1;
export const second = 2;
use(first, second);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // `export default` carries no `.declaration`, so it stays opaque: the report
    // and the fix here concern the statements around it, never the export itself.
    {
      code: `
const threshold = 10;
logStart();
export default threshold;
`,
      output: `
logStart();
const threshold = 10;
export default threshold;
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // `export { x }` likewise carries no `.declaration`. It reads the name it
    // re-binds, so it keeps acting as a reference to that binding.
    {
      code: `
const threshold = 10;
logStart();
use(threshold);
export { threshold };
`,
      output: `
logStart();
const threshold = 10;
use(threshold);
export { threshold };
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // An assertion is erased before the code runs, so `1 as const` is exactly the
    // movable literal `1` is. Classifying on the wrapper silenced the rule on the
    // very declaration `global-const-style`'s autofix had just rewritten (#1807).
    {
      code: `
export const x = 1 as const;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
export const x = 1 as const;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
const x = 1 satisfies number;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
const x = 1 satisfies number;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
const x = (1)!;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
const x = (1)!;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
const x = <const>1;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
const x = <const>1;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // Wrappers stack, so peeling one is not enough.
    {
      code: `
const x = 1 as const satisfies number;
const a = value + 2;
const b = value + 3;
use(x, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
const x = 1 as const satisfies number;
use(x, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // An Identifier initializer behind an assertion is a candidate too, and the
    // name it depends on travels with it.
    {
      code: `
const src = seed;
const alias = src as const;
const a = value + 2;
const b = value + 3;
use(alias, a, b);
`,
      output: `
const a = value + 2;
const b = value + 3;
const src = seed;
const alias = src as const;
use(alias, a, b);
`,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // A call statement is still a side effect when an assertion sits on its value.
    {
      code: `
const threshold = 10;
logStart() as void;
use(threshold);
`,
      output: `
logStart() as void;
const threshold = 10;
use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
const threshold = 10;
(reporter?.send() as void);
use(threshold);
`,
      output: `
(reporter?.send() as void);
const threshold = 10;
use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // `enforce-object-literal-as-const` writes exactly this receiver, and the
    // member walk has to read through it to find the function it names.
    {
      code: `
const api = { run: () => {} } as const;
const threshold = 10;
api.run();
use(threshold);
`,
      output: `
const api = { run: () => {} } as const;
api.run();
const threshold = 10;
use(threshold);
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    /**
     * A sibling binding withholds the FIX, never the report: the fixer relocates
     * whole statements, so moving this one would carry `y` along. `output: null`
     * is the assertion — an omitted `output` asserts nothing (#1889).
     */
    {
      code: `function f(a: number, b: number) {
  const x = 1, y = 2;
  const unrelated = a * b;
  return x + unrelated + y;
}`,
      output: null,
      errors: [{ messageId: 'moveDeclarationCloser', data: { name: 'x' } }],
    },
    // The same block with the declarators swapped: position within the statement
    // decides nothing, and the report names the binding read first.
    {
      code: `function f(a: number, b: number) {
  const y = 2, x = 1;
  const unrelated = a * b;
  return x + unrelated + y;
}`,
      output: null,
      errors: [{ messageId: 'moveDeclarationCloser', data: { name: 'y' } }],
    },
    // An unread sibling is the shape a multi-declarator statement most often
    // takes in real code, and it must not read as "the declaration is used here".
    {
      code: `function f(a: number, b: number) {
  const x = 1, y = 2;
  const unrelated = a * b;
  return x + unrelated;
}`,
      output: null,
      errors: [{ messageId: 'moveDeclarationCloser', data: { name: 'x' } }],
    },
    /**
     * A report the fix may not act on neither carries the fix nor vetoes it: the
     * side effect still moves, and the declaration stays exactly where it was
     * with both of its bindings intact.
     */
    {
      code: `function f() {
  const x = 1, y = 2;
  const unrelated = 1;
  const other = 2;
  use(x, y);
}`,
      output: `function f() {
  const x = 1, y = 2;
  use(x, y);
  const unrelated = 1;
  const other = 2;
}`,
      errors: [
        { messageId: 'moveDeclarationCloser', data: { name: 'x' } },
        { messageId: 'moveSideEffect' },
      ],
    },
    /**
     * A file whose last line carries no terminator — no trailing newline, so the
     * block's final segment ends mid-line. Relocating the last statement away from
     * the end used to append the next segment straight onto that line, and the `//`
     * comment ending it swallowed the relocated statement whole: `const name` became
     * comment text and its binding left the program under `--fix` (#2023).
     */
    {
      code: `function elementAt(arr: number[], index: number) {
  return arr[index];
}
const name = 'elementAt';
const first = elementAt([10, 20, 30], 0); // trailing`,
      output: `function elementAt(arr: number[], index: number) {
  return arr[index];
}
const first = elementAt([10, 20, 30], 0); // trailing
const name = 'elementAt';
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The same missing separator without a comment to hide it: the relocated
    // statement survives, but only as a second statement crammed onto the line
    // above. One defect, two faces — both settled by the join.
    {
      code: `function elementAt(arr: number[], index: number) {
  return arr[index];
}
const name = 'elementAt';
const first = elementAt([10, 20, 30], 0);`,
      output: `function elementAt(arr: number[], index: number) {
  return arr[index];
}
const first = elementAt([10, 20, 30], 0);
const name = 'elementAt';
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    // The reordering the rule exists for survives the dependency: an effect whose
    // components come from outside the block has no data dependency on the setup
    // above it, so it still hoists.
    {
      code: `
function renderHarness(harness) {
  const unrelated = 1;
  render(<Provider />);
  use(unrelated);
}
`,
      output: `
function renderHarness(harness) {
  render(<Provider />);
  const unrelated = 1;
  use(unrelated);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // `<div />` emits the string "div" whatever `div` a scope holds, so a lowercase
    // element name is no dependency and must not manufacture a barrier.
    {
      code: `
function run() {
  const div = 1;
  render(<div />);
  use(div);
}
`,
      output: `
function run() {
  render(<div />);
  const div = 1;
  use(div);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // An attribute name is a property of the element, not a binding, and neither is
    // the property half of a JSX member expression. Counting either would decline
    // reorderings that are perfectly safe.
    {
      code: `
function run() {
  const docPath = 1;
  render(<Provider docPath="literal" />);
  use(docPath);
}
`,
      output: `
function run() {
  render(<Provider docPath="literal" />);
  const docPath = 1;
  use(docPath);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveSideEffect' }],
    },
    {
      code: `
function run() {
  const Item = 1;
  render(<Ns.Item />);
  use(Item);
}
`,
      output: `
function run() {
  render(<Ns.Item />);
  const Item = 1;
  use(Item);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // The hoist that is available here lifts the independent `setup()` instead of
    // burying `Component`: the declaration stays above the render that reads it.
    {
      code: `
function build(harness) {
  const Component = Wrapper;
  setup();
  render(<Component />);
}
`,
      output: `
function build(harness) {
  setup();
  const Component = Wrapper;
  render(<Component />);
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // The opposite direction of the same hazard: the derived declaration would be
    // promoted ABOVE the destructuring whose binding it renders. The reordering the
    // block still earns moves the destructuring up instead, which keeps every
    // binding declared before it is read.
    {
      code: `
function build(harness) {
  const x = 1;
  const { Provider } = harness;
  const el = <Provider a={x} />;
  return el;
}
`,
      output: `
function build(harness) {
  const { Provider } = harness;
  const x = 1;
  const el = <Provider a={x} />;
  return el;
}
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    // The positive half of the parameter-default pair: this callee captures
    // nothing, so nothing forbids the hoist and the effect still moves. Without
    // it, silencing the false positive by refusing to look at parameters at all
    // would pass unnoticed.
    {
      code: `
function run() {
  const makeDefault = () => 42;

  const secret = 1;

  ((h = makeDefault()) => { report(h); })();

  use(secret);
}
`,
      output: `
function run() {
  const makeDefault = () => 42;

  ((h = makeDefault()) => { report(h); })();

  const secret = 1;

  use(secret);
}
`,
      errors: [{ messageId: 'moveSideEffect' }],
    },
    // The callee's capture is a dependency, not a blanket veto: the effect still
    // rises above the unrelated `noise` declaration, and stops exactly at the
    // binding the callee reads.
    {
      code: `
function run() {
  const makeDefault = () => shared;

  const shared = 1;

  const noise = 2;

  ((h = makeDefault()) => { report(h); })();

  use(noise);
}
`,
      output: `
function run() {
  const makeDefault = () => shared;

  const shared = 1;

  ((h = makeDefault()) => { report(h); })();

  const noise = 2;

  use(noise);
}
`,
      errors: [{ messageId: 'moveSideEffect' }],
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

  // The same shape minus the file's final newline, which is what the fixture above
  // still has: a `Program`'s last segment runs to the end of the TEXT, so a trailing
  // newline hands it the very terminator whose absence is the defect. Without one the
  // relocated statement used to land inside the comment (#2023).
  const TRAILING_COMMENT_LAST_NO_EOL = `const base = getBase();
const unrelated = 1;
const detail = base.value; // derived note`;

  // Exported declarations are movable and crossable (#1762), so the reordering
  // permutes segments that each open with an `export` keyword. Splitting one from
  // its declaration would leave text that no longer parses, which a fixpoint run
  // surfaces as an unresolved fix rather than as a silent corruption.
  const EXPORTED_CHAIN = `export const base = getBase();
export const unrelated = 1;
export const detail = base.value;
export const other = getOther();
export const filler = 2;
export const derived = other.value;
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
    [
      'a trailing comment on an unterminated last line',
      TRAILING_COMMENT_LAST_NO_EOL,
    ],
    ['exported declarations', EXPORTED_CHAIN],
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

  // The statement that follows the relocated one has to survive as live code:
  // appended to a line ending in `//` it becomes comment text, and the program that
  // loses the binding still parses and still lints clean (#2023).
  it('keeps the statement after it out of that comment', () => {
    const result = fixToFixpoint(TRAILING_COMMENT_LAST_NO_EOL);

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
    [
      'a trailing comment on an unterminated last line',
      TRAILING_COMMENT_LAST_NO_EOL,
    ],
    ['exported declarations', EXPORTED_CHAIN],
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

const WRAPPED_AWAIT_PAIR = `async function loadPair(payload: Payload) {
  const sender = payload.sender;
  const receiver = payload.receiver;
  const senderFriends = (await fetchFriends(sender)) as Friends;
  const receiverFriends = (await fetchFriends(receiver)) as Friends;
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

  /**
   * The await-run protection is the one place in this rule that deliberately does
   * *not* read through an assertion, because `parallelize-async-operations`
   * matches an await initializer with the same bare type check. The pairing is
   * what makes the narrowness correct, so it is asserted rather than assumed: if
   * that rule ever starts forming runs out of wrapped awaits, this fails and this
   * rule has to follow (#1807).
   */
  it('keeps its await-run carve-out in step with the rule it protects', () => {
    const linter = composedLinter();
    const parallelizeOnly = configFor({ [PARALLELIZE_ID]: 'error' });

    expect(
      linter.verify(AWAIT_PAIR, parallelizeOnly, 'file.ts').length,
    ).toBeGreaterThan(0);
    expect(
      linter.verify(WRAPPED_AWAIT_PAIR, parallelizeOnly, 'file.ts'),
    ).toEqual([]);
  });
});

/**
 * The deletion direction of the fix-closure axis: `recommended-config-fix-closure`
 * counts reports a fix *introduces*, so it is structurally blind to a fix that
 * *removes* one. These rules append ` as const` under `--fix`, and this rule used
 * to classify an initializer on the wrapper — so `eslint --fix` silenced it on the
 * very declaration it had just rewritten (#1807).
 */
const AS_CONST_FIXER_IDS = [
  '@blumintinc/blumint/enforce-object-literal-as-const',
  '@blumintinc/blumint/global-const-style',
  '@blumintinc/blumint/prefer-union-from-const-array',
];

const AS_CONST_FIXERS = Object.fromEntries(
  AS_CONST_FIXER_IDS.map((id) => [id, 'error']),
);

/**
 * `global-const-style` renames as well as asserts, so the declaration's name
 * changes in the same rewrite the assertion arrives in. Two variables move at
 * once, which is exactly why the isolation pass below is load-bearing rather
 * than decorative.
 */
const LATE_DECLARATION = `const threshold = 10;
const a = value + 2;
const b = value + 3;
use(threshold, a, b);
`;

/** Already grouped: neither spelling of it may report, in any pass. */
const GROUPED_CONTROL = `const a = value + 2;
const b = value + 3;
const threshold = 10;
use(threshold, a, b);
`;

const messageIdsFor = (linter: Linter, code: string) =>
  linter
    .verify(code, configFor({ [GROUPING_ID]: 'error' }), 'file.ts')
    .map((message) => message.messageId);

describe('logical-top-to-bottom-grouping composed with the `as const` fixers', () => {
  it('every culprit fixer is a live, registered rule', () => {
    // Without this the suite would happily "compose" three rule ids that ESLint
    // silently ignores, and every rewrite assertion below would be vacuous.
    for (const id of AS_CONST_FIXER_IDS) {
      expect(rules[id.slice('@blumintinc/blumint/'.length)]).toBeDefined();
    }
  });

  it('still reports the declaration a sibling fixer wrapped in `as const`', () => {
    const linter = composedLinter();

    // Control: the rule must claim the input, or "still reports" proves nothing.
    expect(messageIdsFor(linter, LATE_DECLARATION)).toEqual([
      'moveDeclarationCloser',
    ]);

    const { output } = linter.verifyAndFix(
      LATE_DECLARATION,
      configFor(AS_CONST_FIXERS),
      'file.ts',
    );

    // Non-vacuity: a culprit must actually have written the wrapper, or the
    // assertion below is being made against unrewritten text.
    expect(output).not.toBe(LATE_DECLARATION);
    expect(output).toContain(' as const');

    expect(messageIdsFor(linter, output)).toEqual(['moveDeclarationCloser']);
  });

  /**
   * Causal isolation. Removing just the assertion from the rewritten text holds
   * the rename fixed, so a verdict that differs between the two can only be the
   * assertion's doing. Before the unwrap the wrapped text reported nothing while
   * the stripped text reported — that gap is the bug, and equality is its cure.
   */
  it('attributes the verdict to the rename, not to the assertion', () => {
    const linter = composedLinter();
    const { output } = linter.verifyAndFix(
      LATE_DECLARATION,
      configFor(AS_CONST_FIXERS),
      'file.ts',
    );

    const stripped = output.replace(/ as const/gu, '');

    // The strip must remove the assertion and nothing else: the rename has to
    // survive it, or the two texts differ in more than the variable under test.
    expect(stripped).not.toBe(output);
    expect(stripped).not.toContain('as const');
    expect(stripped).toContain('THRESHOLD');
    expect(output).toContain('THRESHOLD');

    expect(messageIdsFor(linter, output)).toEqual(
      messageIdsFor(linter, stripped),
    );
  });

  it('does not manufacture a report on either spelling of grouped code', () => {
    const linter = composedLinter();
    const { output } = linter.verifyAndFix(
      GROUPED_CONTROL,
      configFor(AS_CONST_FIXERS),
      'file.ts',
    );

    expect(output).toContain(' as const');
    expect(messageIdsFor(linter, GROUPED_CONTROL)).toEqual([]);
    expect(messageIdsFor(linter, output)).toEqual([]);
  });
});

/**
 * A sibling declarator withholds the FIX and nothing else (#1889).
 *
 * The rule relocates whole statements, so `const x = 1, y = 2;` cannot be moved
 * without carrying `y` past its own first use. Declining the move is right;
 * declining the diagnosis with it shipped the violation unseen, which is what the
 * differential below pins: the same block, with and without a binding the rule was
 * never asked about, reports the same thing.
 */
const SINGLE_DECLARATOR = `function f(a: number, b: number) {
  const x = 1;
  const unrelated = a * b;
  return x + unrelated;
}
`;

const MULTI_DECLARATOR = `function f(a: number, b: number) {
  const x = 1, y = 2;
  const unrelated = a * b;
  return x + unrelated + y;
}
`;

const MULTI_DECLARATOR_MIRROR = `function f(a: number, b: number) {
  const y = 2, x = 1;
  const unrelated = a * b;
  return x + unrelated + y;
}
`;

/** A block whose OTHER violation is fixable, so the veto question is live. */
const MIXED_BLOCK = `function f() {
  const x = 1, y = 2;
  const unrelated = 1;
  const other = 2;
  use(x, y);
}
`;

/**
 * The pair behind the invalid fixture whose subject is the hoist: `shadow` is read
 * two statements down, so the declaration is late whichever way it is spelled. The
 * sibling `unused` used to be the only thing keeping that second report quiet.
 */
const SHADOW_SOLE = `const shadow = 1;
const other = 2;

(() => {
  const shadow = 3;
  console.log(shadow);
})();

use(other);
`;

const SHADOW_SIBLING = `const shadow = 1, unused = 0;
const other = 2;

(() => {
  const shadow = 3;
  console.log(shadow);
})();

use(other);
`;

const groupingMessages = (code: string) =>
  composedLinter().verify(
    code,
    configFor({ [GROUPING_ID]: 'error' }),
    'file.ts',
  );

const groupingIds = (code: string) =>
  groupingMessages(code).map((message) => message.messageId);

describe('logical-top-to-bottom-grouping with a sibling declarator', () => {
  it('reports the late declaration in either declarator order', () => {
    // Control: the sole-declarator spelling is the shape the report is known for,
    // and equality with it is the whole claim.
    expect(groupingIds(SINGLE_DECLARATOR)).toEqual(['moveDeclarationCloser']);
    expect(groupingIds(MULTI_DECLARATOR)).toEqual(['moveDeclarationCloser']);
    expect(groupingIds(MULTI_DECLARATOR_MIRROR)).toEqual([
      'moveDeclarationCloser',
    ]);
  });

  it('offers no fix for it, where the sole-declarator spelling is fixed', () => {
    // Non-vacuity: the control must actually ship a fix, or "no fix" is free.
    expect(groupingMessages(SINGLE_DECLARATOR).every((m) => !!m.fix)).toBe(
      true,
    );
    expect(groupingMessages(MULTI_DECLARATOR).some((m) => !!m.fix)).toBe(false);
    expect(groupingMessages(MULTI_DECLARATOR_MIRROR).some((m) => !!m.fix)).toBe(
      false,
    );
  });

  it('changes no verdict when the block already earns another report', () => {
    // Two spellings of one block, differing only in a binding no rule was asked
    // about: the verdict has to be identical, and non-empty on both sides.
    expect(groupingIds(SHADOW_SOLE)).toEqual([
      'moveDeclarationCloser',
      'moveSideEffect',
    ]);
    expect(groupingIds(SHADOW_SIBLING)).toEqual(groupingIds(SHADOW_SOLE));
  });

  it('leaves the block byte-identical at a --fix fixpoint', () => {
    // A report the fixer keeps offering and refusing is an oscillation, and
    // `verifyAndFix` loops internally, so the pending-fix count is the detector.
    const result = fixToFixpoint(MULTI_DECLARATOR);
    expect(result.text).toBe(MULTI_DECLARATOR);
    expect(result.cycled).toBe(false);
    expect(result.pendingFixes).toBe(0);
  });

  it('neither carries nor vetoes the fix the rest of the block earns', () => {
    const messages = groupingMessages(MIXED_BLOCK);
    expect(messages.map((message) => message.messageId)).toEqual([
      'moveDeclarationCloser',
      'moveSideEffect',
    ]);
    expect(messages[0].fix).toBeUndefined();
    expect(messages[1].fix).toBeDefined();

    const { output } = composedLinter().verifyAndFix(
      MIXED_BLOCK,
      configFor({ [GROUPING_ID]: 'error' }),
      'file.ts',
    );

    // Both bindings survive, on one line, in their original order: the fix moved
    // the side effect and never touched the declaration it cannot move.
    expect(output).toContain('  const x = 1, y = 2;\n  use(x, y);');
    expect(fixToFixpoint(MIXED_BLOCK).cycled).toBe(false);
  });
});

/**
 * A reordering fixer's worst failure is silent: the emitted file parses,
 * type-checks and lints clean, and only running it raises
 * `ReferenceError: Cannot access 'X' before initialization`. Neither the rule's
 * reports nor a reparse can see it, so the invariant needs an oracle of its own —
 * here ESLint's core `no-use-before-define`, whose scope analysis is independent of
 * every model this rule builds and which resolves JSX element names as the value
 * references they are (#2042).
 */
const TDZ_JSX_PARSER_OPTIONS = {
  ecmaVersion: 2020,
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
} as const;

const jsxLinter = (): Linter => {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  linter.defineRule('ltb', logicalTopToBottomGrouping as never);
  return linter;
};

const fixJsxToFixpoint = (code: string, maxPasses = 12): string => {
  const linter = jsxLinter();
  const config = {
    parser: 'ts',
    parserOptions: TDZ_JSX_PARSER_OPTIONS,
    rules: { ltb: 'error' },
  } as unknown as Linter.Config;

  let text = code;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const { output, fixed } = linter.verifyAndFix(text, config, 'file.tsx');
    if (!fixed || output === text) {
      break;
    }
    text = output;
  }
  return text;
};

const usedBeforeDefined = (code: string): string[] => {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  const config = {
    parser: 'ts',
    parserOptions: TDZ_JSX_PARSER_OPTIONS,
    rules: {
      // Function declarations hoist complete, so demoting one past a call to it
      // stays runnable; `const`/`let`/`class` do not, and those are the hazard.
      'no-use-before-define': [
        'error',
        { functions: false, classes: true, variables: true },
      ],
    },
  } as unknown as Linter.Config;
  return linter
    .verify(code, config, 'file.tsx')
    .map((message) => message.message);
};

describe('logical-top-to-bottom-grouping declaration-order invariant', () => {
  const TDZ_PRESSURE_CORPUS: Record<string, string> = {
    'arrow body': `
const renderHarness = (harness) => {
  const { Provider, Probe } = harness;
  render(<Provider docPath="ChatbotIntegration/test"><Probe /></Provider>);
};
`,
    'function body': `
function renderHarness(harness) {
  const { Provider, Probe } = harness;
  render(<Provider><Probe /></Provider>);
}
`,
    'method body': `
class Harness {
  run(harness) {
    const { Provider, Probe } = harness;
    render(<Provider><Probe /></Provider>);
  }
}
`,
    'nested block': `
function outer(harness) {
  if (harness) {
    const { Provider, Probe } = harness;
    render(<Provider><Probe /></Provider>);
  }
}
`,
    'module scope': `
const { Provider, Probe } = harness;
render(<Provider><Probe /></Provider>);
`,
    'closing element only': `
function run(harness) {
  const { Wrap } = harness;
  render(<Wrap>text</Wrap>);
}
`,
    'member expression root': `
function run(harness) {
  const { Ns } = harness;
  render(<Ns.Item />);
}
`,
    'read inside a callback': `
function run(harness) {
  const { Provider } = harness;
  act(() => render(<Provider />));
}
`,
    'promotion above the declaration it reads': `
function build(harness) {
  const x = 1;
  const { Provider } = harness;
  const el = <Provider a={x} />;
  return el;
}
`,
    'declaration ahead of an independent effect': `
function build(harness) {
  const Component = Wrapper;
  setup();
  render(<Component />);
}
`,
    'effect with no data dependency': `
function renderHarness(harness) {
  const unrelated = 1;
  render(<Provider />);
  use(unrelated);
}
`,
    'intrinsic element name': `
function run() {
  const div = 1;
  render(<div />);
  use(div);
}
`,
  };

  const entries = Object.entries(TDZ_PRESSURE_CORPUS);

  it('exercises every scope the rule visits', () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
  });

  it('carries an oracle that fires on the shape the issue reported', () => {
    expect(
      usedBeforeDefined(`
const renderHarness = (harness) => {
  render(<Provider><Probe /></Provider>);
  const { Provider, Probe } = harness;
};
`),
    ).toEqual([
      "'Provider' was used before it was defined.",
      "'Probe' was used before it was defined.",
    ]);
  });

  it('rewrites part of the corpus, so a silent fixer cannot pass this', () => {
    const rewritten = entries.filter(
      ([, code]) => fixJsxToFixpoint(code) !== code,
    );
    expect(rewritten.length).toBeGreaterThanOrEqual(4);
  });

  it.each(entries)('leaves %s runnable after --fix', (_name, code) => {
    expect(usedBeforeDefined(code)).toEqual([]);
    expect(usedBeforeDefined(fixJsxToFixpoint(code))).toEqual([]);
  });
});
