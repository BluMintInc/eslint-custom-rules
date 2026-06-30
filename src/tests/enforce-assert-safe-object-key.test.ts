import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertSafeObjectKey } from '../rules/enforce-assert-safe-object-key';

const buildMessage = (key: string) =>
  `Dynamic object key "${key}" is used without assertSafe() validation. Unvalidated keys can resolve to unexpected properties (including prototype fields) and make lookups fragile or unsafe. Wrap the key with assertSafe(${key}) before accessing the object.`;

const lintError = (key: string): TSESLint.TestCaseError<'useAssertSafe'> =>
  ({
    message: buildMessage(key),
  } as unknown as TSESLint.TestCaseError<'useAssertSafe'>);

ruleTesterTs.run('enforce-assert-safe-object-key', enforceAssertSafeObjectKey, {
  valid: [
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      // Direct property access (not computed) should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj.key1);
      `,
    },
    {
      // Direct string literal in brackets should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj['key1']);
      `,
    },
    {
      // Number index should be valid
      code: `
const arr = ['value1', 'value2'];
console.log(arr[0]);
      `,
    },
    {
      // Complex template literals with text should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`prefix_\${id}_suffix\`]);
      `,
    },
    {
      // Numeric expressions should be valid
      code: `
const arr = ['value1', 'value2', 'value3'];
const index = 1;
console.log(arr[index + 1]);
      `,
    },
    {
      // Using a computed property with a complex expression
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key';
const num = 1;
console.log(obj[assertSafe(id + num)]);
      `,
    },
    {
      // Using a computed property with a conditional expression
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key';
const condition = true;
console.log(obj[assertSafe(condition ? 'key1' : 'key2')]);
      `,
    },
    {
      // Repro from issue #1245: cached assertSafe identifier used across multiple member accesses
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const keys = ['key1', 'key2'];
const userBalance = { key1: 100, key2: 200 };
const remaining = { key1: 50, key2: 75 };
const entryFee = { key1: 10, key2: 20 };
keys.map((key) => {
  const safeKey = assertSafe(key);
  const balance = userBalance[safeKey];
  const rem = remaining[safeKey];
  const fee = entryFee[safeKey];
});
      `,
    },
    {
      // let-initialized assertSafe variable is also exempt
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
let safeKey = assertSafe(rawKey);
console.log(obj[safeKey]);
      `,
    },
    {
      // assertSafe cached variable in a nested closure scope is exempt
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const data = { a: 1, b: 2 };
function process(rawKey) {
  const safeKey = assertSafe(rawKey);
  return data[safeKey];
}
      `,
    },
    {
      // Regression guard: safeKey from assertSafe used as `in` left-operand is
      // handled by the BinaryExpression visitor which never flags bare identifiers —
      // confirm it does not become a new false positive.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
const exists = safeKey in obj;
      `,
    },
    {
      // Regression guard: safeKey from assertSafe in computed destructuring is
      // handled by the Property visitor which never flags bare identifiers —
      // confirm it does not become a new false positive.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
const { [safeKey]: value } = obj;
      `,
    },
  ],
  invalid: [
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[String(id)];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[String(id)];
const value2 = obj[\`\${id}\`];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[assertSafe(id)];
const value2 = obj[assertSafe(id)];
      `,
    },
    // Additional test cases
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
function process(id) {
  return obj[String(id)];
}
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
function process(id) {
  return obj[assertSafe(id)];
}
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const nested = { obj };
console.log(nested.obj[String(id)]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const nested = { obj };
console.log(nested.obj[assertSafe(id)]);
      `,
    },
    {
      code: `
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[String(userId)].name);
      `,
      errors: [lintError('userId')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const data = { users: { user1: { name: 'John' } } };
const userId = 'user1';
console.log(data.users[assertSafe(userId)].name);
      `,
    },
    {
      code: `
class DataStore {
  constructor() {
    this.data = { key1: 'value1' };
  }

  getValue(id) {
    return this.data[String(id)];
  }
}
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
class DataStore {
  constructor() {
    this.data = { key1: 'value1' };
  }

  getValue(id) {
    return this.data[assertSafe(id)];
  }
}
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const prop = \`\${id}\`;
console.log(obj[prop]);
      `,
      errors: [lintError('prop')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const prop = \`\${id}\`;
console.log(obj[assertSafe(prop)]);
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
obj[String(id)] = 'new value';
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
obj[assertSafe(id)] = 'new value';
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[String(id)];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
delete obj[assertSafe(id)];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = String(id) in obj;
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const hasKey = assertSafe(id) in obj;
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [String(id)]: value } = obj;
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const { [assertSafe(id)]: value } = obj;
      `,
    },
    {
      // The example from the issue description
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]); // Redundant string conversion
console.log(obj[\`\${id}\`]); // Unnecessary template literal usage
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]); // Redundant string conversion
console.log(obj[assertSafe(id)]); // Unnecessary template literal usage
      `,
    },
    {
      // Object property access with a variable directly should be invalid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // Boolean expressions should be invalid
      code: `
const obj = { true: 'value1', false: 'value2' };
const condition = true;
console.log(obj[condition]);
      `,
      errors: [lintError('condition')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { true: 'value1', false: 'value2' };
const condition = true;
console.log(obj[assertSafe(condition)]);
      `,
    },
    {
      // Function calls other than String() should be invalid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const getId = () => 'key1';
console.log(obj[getId()]);
      `,
      errors: [lintError('getId()')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const getId = () => 'key1';
console.log(obj[assertSafe(getId())]);
      `,
    },
    {
      // Plain alias (const k = rawKey) is NOT assertSafe-validated and must be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = rawKey;
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = rawKey;
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Variable initialized from a non-assertSafe call must still be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = sanitize(rawKey);
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = sanitize(rawKey);
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Similar-but-different callee name (assertUnsafe) must still be flagged
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = assertUnsafe(rawKey);
console.log(obj[k]);
      `,
      errors: [lintError('k')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const k = assertUnsafe(rawKey);
console.log(obj[assertSafe(k)]);
      `,
    },
    {
      // Shadowing: inner const safeKey = rawKey shadows the outer assertSafe
      // safeKey — the inner binding is NOT from assertSafe and must be flagged.
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
function inner() {
  const safeKey = rawKey;
  return obj[safeKey];
}
      `,
      errors: [lintError('safeKey')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const rawKey = 'key1';
const safeKey = assertSafe(rawKey);
function inner() {
  const safeKey = rawKey;
  return obj[assertSafe(safeKey)];
}
      `,
    },
  ],
});
