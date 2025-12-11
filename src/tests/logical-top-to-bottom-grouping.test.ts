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
let data;
const id = getId();
const status = checkStatus();
if (shouldFetch) {
  data = fetchData();
}
      `,
      output: `
const id = getId();
const status = checkStatus();
let data;
if (shouldFetch) {
  data = fetchData();
}
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
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
      code: '\nlet counter = 0;\nconst mid = doMid();\nlog(mid);\nconsole.log(counter);\n',
      output: '\nconst mid = doMid();\nlog(mid);\nlet counter = 0;\nconsole.log(counter);\n',
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
    {
      code: `
let logger;
function logAll() {
  return 1;
}
logger = createLogger();
      `,
      output: `
function logAll() {
  return 1;
}
let logger;
logger = createLogger();
      `,
      errors: [{ messageId: 'moveDeclarationCloser' }],
    },
  ],
});

