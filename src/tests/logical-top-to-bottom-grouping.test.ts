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
    // Variable mutated in ForStatement and used after
    `
let x = 0;
const a = 1;
for (let i = 0; i < 10; i++) {
  x += i;
}
console.log(x);
    `,
    // Variable mutated in ForInStatement and used after
    `
let keys = '';
const prefix = 'key:';
for (const key in obj) {
  keys += prefix + key;
}
use(keys);
    `,
    // Variable mutated in ForOfStatement and used after
    `
let total = 0;
const factor = 2;
for (const val of values) {
  total += val * factor;
}
log(total);
    `,
    // Variable mutated in WhileStatement and used after
    `
let count = 0;
const limit = 10;
while (count < limit) {
  count++;
}
console.log(count);
    `,
    // Variable mutated in DoWhileStatement and used after
    `
let i = 0;
const max = 5;
do {
  i++;
} while (i < max);
use(i);
    `,
    // Variable mutated in nested loops and used after
    `
let sum = 0;
const weight = 1.5;
for (const row of matrix) {
  for (const val of row) {
    sum += val * weight;
  }
}
process(sum);
    `,
    // Multiple variables mutated in loop and used after
    `
let a = 0;
let b = 0;
const step = 1;
for (let i = 0; i < 10; i++) {
  a += step;
  b -= step;
}
use(a, b);
    `,
    // Destructuring assignment in loop and used after
    `
let x = 0;
let y = 0;
const data = [[1, 2], [3, 4]];
for (const [first, second] of data) {
  [x, y] = [first, second];
}
console.log(x, y);
    `,
    // Variable mutated in ForStatement update and used after
    `
let i = 0;
const step = 1;
for (let j = 0; j < 10; i += step) {
  console.log(j);
  j++;
}
use(i);
    `,
    // Variable mutated in WhileStatement test and used after
    `
let count = 0;
const limit = 10;
while ((count += 1) < limit) {
  process();
}
use(count);
    `,
    // Variable mutated via property access in loop and used after
    `
let state = { count: 0 };
const delta = 1;
for (const item of items) {
  state.count += delta;
}
use(state);
    `,
    // Variable mutated in nested function within loop and used after
    `
let triggered = false;
for (const item of items) {
  const cb = () => { triggered = true; };
  cb();
}
if (triggered) {
  doWork();
}
    `,
    // Negative case: Variable only read in loop (SHOULD still report)
    // We expect this NOT to be in valid if it's far from use, 
    // but here we just want to ensure isMutatedInLoopAndUsedAfter returns false.
    // If it's far from use, it should be in invalid.
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
let x = 0;
const a = 1;
for (const item of items) {
  console.log(x, item);
}
      `,
      output: `
const a = 1;
let x = 0;
for (const item of items) {
  console.log(x, item);
}
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
let x = 0;
const a = 1;
for (const item of items) {
  x = item;
}
      `,
      output: `
const a = 1;
let x = 0;
for (const item of items) {
  x = item;
}
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      // Variable read in loop and used after, but NOT mutated in loop
      code: `
let x = 0;
const a = 1;
for (const item of items) {
  console.log(x);
}
console.log(x);
      `,
      output: `
const a = 1;
let x = 0;
for (const item of items) {
  console.log(x);
}
console.log(x);
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      // Variable mutated in loop via compound assignment but NOT used after
      code: `
let x = 0;
const a = 1;
while (x < 10) {
  x += 1;
}
      `,
      output: `
const a = 1;
let x = 0;
while (x < 10) {
  x += 1;
}
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
  ],
});
