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
const value = 1;
let total;
total = value + 1;
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
  ],
  invalid: [
    {
      code: `
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};
      `,
      output: `
const group = useGroupDoc();
const { id } = group || {};
const { groupTabState } = useGroupRouter();
`,
      errors: [{ messageId: 'groupDerived' }],
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
const first = 1;
const second = 2;
if (shouldStop) {
  return null;
}
const combined = first + second;
`,
      output: `
if (shouldStop) {
  return null;
}
const first = 1;
const second = 2;
const combined = first + second;
`,
      errors: [{ messageId: 'moveGuardUp' }],
    },
    {
      code: `
let counter;
const start = 0;
const end = 1;
counter = start + end;
`,
      output: `
const start = 0;
const end = 1;
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
const group = useGroupDoc();
const router = useGroupRouter();
const id = group.id;
      `,
      output: `
const group = useGroupDoc();
const id = group.id;
const router = useGroupRouter();
`,
      errors: [{ messageId: 'groupDerived' }],
    },
    {
      code: `
const base = createBase();
const helper = another();
const count = 1;
const later = 2;
const derived = base.value * count;
      `,
      output: `
const base = createBase();
const helper = another();
const count = 1;
const derived = base.value * count;
const later = 2;
`,
      errors: [{ messageId: 'groupDerived' }],
    },
  ],
});

