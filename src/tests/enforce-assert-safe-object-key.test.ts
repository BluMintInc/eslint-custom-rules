import path from 'path';
import { Linter, Rule } from 'eslint';
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
    // ------------------------------------------------------------------
    // Issue #1408: inline disables. Every violation suppressed must leave
    // the file untouched — no wraps, and above all no orphan import.
    // ------------------------------------------------------------------
    {
      name: 'every violation disabled inline reports nothing',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
      `,
    },
    {
      name: 'whole-file block disable naming this rule suppresses everything',
      code: `
/* eslint-disable enforce-assert-safe-object-key */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
      `,
    },
    {
      name: 'bare block disable suppresses this rule too',
      code: `
/* eslint-disable */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
    },
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
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
    {
      // Repro from issue #1321: the injected import specifier must be computed
      // relative to the fixed file (deeply nested under functions/src/util),
      // not the bare repo-root path which is unresolvable inside functions/.
      filename: path.join(
        process.cwd(),
        'functions/src/util/notifications/util/builders/SomeBuilder.ts',
      ),
      code: `
const NOTIFICATION_TITLES: Record<string, string> = {};
export function lookup(key: string): string { return NOTIFICATION_TITLES[key]; }
      `,
      errors: [lintError('key')],
      output: `
import { assertSafe } from '../../../assertSafe';
const NOTIFICATION_TITLES: Record<string, string> = {};
export function lookup(key: string): string { return NOTIFICATION_TITLES[assertSafe(key)]; }
      `,
    },
    {
      // Two levels below functions/src/util resolves to '../../assertSafe'.
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // A sibling of assertSafe inside functions/src/util must get the './'
      // prefix, never a bare 'assertSafe' specifier.
      filename: path.join(process.cwd(), 'functions/src/util/foo.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from './assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // A file in a sibling directory resolves upward into util.
      filename: path.join(process.cwd(), 'functions/src/other/bar.ts'),
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../util/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // The assertSafeImportPath option is also anchored at the repo root, so
      // the relative computation honors a custom target location.
      filename: path.join(process.cwd(), 'functions/src/util/thing.ts'),
      options: [{ assertSafeImportPath: 'functions/src/shared/assertSafe' }],
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[id]);
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../shared/assertSafe';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      // Backward compat: with no filename set (RuleTester default 'file.ts' is
      // non-absolute), the configured repo-root path is emitted verbatim.
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
    // ------------------------------------------------------------------
    // Issue #1408: the assertSafe import rides on a single violation's fix,
    // so that violation is the file's import carrier. A suppressed carrier
    // used to take the import down with it while surviving violations were
    // still rewritten to assertSafe(...), leaving the call unbound.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'disable on the FIRST of three violations lands exactly one import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
const third = obj[assertSafe(id)];
      `,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and both survivors',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
const third = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
// eslint-disable-next-line enforce-assert-safe-object-key
const second = obj[id];
const third = obj[assertSafe(id)];
      `,
    },
    {
      name: 'disable on the LAST violation keeps one import and both survivors',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
// eslint-disable-next-line enforce-assert-safe-object-key
const third = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
// eslint-disable-next-line enforce-assert-safe-object-key
const third = obj[id];
      `,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line no-console
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line no-console
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a block disable ended before the last violation still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable enforce-assert-safe-object-key */
const third = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable enforce-assert-safe-object-key */
const third = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a file already importing assertSafe never gains a duplicate import',
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    {
      name: 'suppressing the carrier in a destructuring/`in` mix still lands the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const { [String(id)]: first } = obj;
const exists = String(id) in obj;
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const { [String(id)]: first } = obj;
const exists = assertSafe(id) in obj;
      `,
    },
    {
      name: 'the injected relative specifier is unaffected by a suppressed carrier',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1422: the fix inserts an import that binds `assertSafe`, so an
    // existing binding of that name makes the edit wrong twice over — a
    // module-scope declaration collides with the import (TS2440/TS2300), and
    // a shadow at the fix site captures the emitted call with no compile
    // error at all. The report stands; only the edit is withheld.
    // ------------------------------------------------------------------
    {
      name: 'a module-scope const named assertSafe withholds the fix',
      code: `
const assertSafe = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a function declaration named assertSafe withholds the fix',
      code: `
function assertSafe(key: string) { return key; }
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[String(id)];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a class declaration named assertSafe withholds the fix',
      code: `
class assertSafe {}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[\`\${id}\`];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a named assertSafe import from another module withholds the fix',
      code: `
import { assertSafe } from 'functions/src/util/legacyAssertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a namespace import named assertSafe withholds the fix',
      code: `
import * as assertSafe from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a default import named assertSafe withholds the fix',
      code: `
import assertSafe from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a type-only assertSafe import withholds the fix',
      code: `
import type { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a shadowing parameter named assertSafe withholds the fix at that site',
      code: `
const obj = { alpha: 1, beta: 2 };
function lookup(assertSafe, id) {
  return obj[id];
}
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a block-scoped assertSafe binding withholds the fix at that site',
      code: `
const obj = { alpha: 1, beta: 2 };
function lookup(id) {
  const assertSafe = (key) => key;
  return obj[id];
}
      `,
      errors: [lintError('id')],
      output: null,
    },
    {
      name: 'a shadowed site declines while an unshadowed site still carries the import',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[id];
      `,
      errors: [lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[assertSafe(id)];
      `,
    },
    {
      name: 'an equivalent relative spelling of the helper import is reused',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
import { assertSafe } from '../../../util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from '../../../util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'the repo-root spelling of the helper import is reused under an absolute filename',
      filename: path.join(process.cwd(), 'functions/src/util/a/b/fixture.ts'),
      code: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'an aliased helper import leaves the name free, so the import is added',
      code: `
import { assertSafe as ensureSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
import { assertSafe as ensureSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'a similarly named binding does not withhold the fix',
      code: `
const assertSafeKey = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
      `,
      errors: [lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const assertSafeKey = (key: string) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
      `,
    },
    {
      name: 'the ordinary no-collision fix is byte-identical under the binding guard',
      code: `
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
      `,
      errors: [lintError('id'), lintError('id'), lintError('id')],
      output: `
import { assertSafe } from 'functions/src/util/assertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[assertSafe(id)];
const second = obj[assertSafe(id)];
const third = obj[assertSafe(id)];
      `,
    },
  ],
});

// Issue #1408: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted assertSafe(...)
// call is never left without its import.
describe('enforce-assert-safe-object-key: inline disables and the import carrier (issue #1408)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  const IMPORT_LINE = `import { assertSafe } from 'functions/src/util/assertSafe';`;

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // prefix/substring heuristic.
    linter.defineRule(
      '@blumintinc/blumint/enforce-assert-safe-object-key-strict',
      {
        meta: { schema: [] },
        create: () => ({}),
      } as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    // A relative filename keeps the emitted specifier at its configured
    // repo-root value, isolating these cases from specifier resolution.
    const { output } = linter.verifyAndFix(code, config, 'lookup.ts');
    return output;
  };

  const expectNoUnboundAssertSafe = (output: string) => {
    if (/assertSafe\(/.test(output)) {
      expect(output).toContain(IMPORT_LINE);
    }
  };

  const countImports = (output: string) => output.split(IMPORT_LINE).length - 1;

  it('carries the import on the first surviving violation', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[String(id)];
const third = obj[\`\${id}\`];
const fourth = String(id) in obj;
`);

    expect(countImports(output)).toBe(1);
    expect(output).toContain('const first = obj[id];');
    expect(output).toContain('const second = obj[assertSafe(id)];');
    expect(output).toContain('const third = obj[assertSafe(id)];');
    expect(output).toContain('const fourth = assertSafe(id) in obj;');
    expectNoUnboundAssertSafe(output);
  });

  it('adds neither import nor wrapper when every violation is disabled', () => {
    const code = `const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('adds neither import nor wrapper under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable @blumintinc/blumint/enforce-assert-safe-object-key */
const third = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
/* eslint-disable @blumintinc/blumint/enforce-assert-safe-object-key */
const first = obj[id];
const second = obj[id];
/* eslint-enable @blumintinc/blumint/enforce-assert-safe-object-key */
const third = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key-strict
const first = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key-strict
const first = obj[assertSafe(id)];
`);
    expectNoUnboundAssertSafe(output);
  });

  it('never duplicates an import the file already has', () => {
    const output = lint(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id];
const second = obj[id];
`);

    expect(countImports(output)).toBe(1);
    expect(output).toContain('const second = obj[assertSafe(id)];');
  });
});

// Issue #1422: RuleTester stops after one fix pass, so it cannot show that a
// withheld fix stays withheld. These cases run the real multi-pass fixer and
// assert the invariant the bug violated: `assertSafe` is never declared twice.
describe('enforce-assert-safe-object-key: an existing assertSafe binding (issue #1422)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-assert-safe-object-key';
  const IMPORT_LINE = `import { assertSafe } from 'functions/src/util/assertSafe';`;

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceAssertSafeObjectKey as unknown as Rule.RuleModule,
    );
    const { output } = linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      // A relative filename keeps the emitted specifier at its configured
      // repo-root value, isolating these cases from specifier resolution.
      'lookup.ts',
    );
    return output;
  };

  // Counts statements that BIND the name `assertSafe`; a call site or a
  // parameter list merely mentioning it is not a declaration.
  const countAssertSafeDeclarations = (output: string) =>
    (
      output.match(
        /^\s*(?:import\s+assertSafe\b|import\s[^;]*\{[^}]*\bassertSafe\b[^}]*\}|(?:const|let|var)\s+assertSafe\b|function\s+assertSafe\b|class\s+assertSafe\b)/gm,
      ) ?? []
    ).length;

  it('leaves a file whose module scope already declares assertSafe untouched', () => {
    const code = `const assertSafe = (key) => key;
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
const second = obj[id];
`;

    expect(lint(code)).toBe(code);
    expect(countAssertSafeDeclarations(lint(code))).toBe(1);
  });

  it('leaves a file importing assertSafe from another module untouched', () => {
    const code = `import { assertSafe } from 'functions/src/util/legacyAssertSafe';
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
const first = obj[id];
`;

    expect(lint(code)).toBe(code);
  });

  it('fixes the unshadowed site only, with a single import', () => {
    const output = lint(`const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[id];
`);

    expect(output).toBe(`${IMPORT_LINE}
const obj = { alpha: 1, beta: 2 };
const id = 'alpha';
function shadowed(assertSafe) {
  return obj[id];
}
const outer = obj[assertSafe(id)];
`);
    expect(countAssertSafeDeclarations(output)).toBe(1);
  });
});
