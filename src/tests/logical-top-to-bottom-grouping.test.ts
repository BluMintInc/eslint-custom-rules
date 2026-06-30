import { ruleTesterTs } from '../utils/ruleTester';
import { logicalTopToBottomGrouping } from '../rules/logical-top-to-bottom-grouping';

ruleTesterTs.run('logical-top-to-bottom-grouping', logicalTopToBottomGrouping, {
  valid: [
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
  ],
});
