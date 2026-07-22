import { ruleTesterTs } from '../utils/ruleTester';
import { enforceStableStringify } from '../rules/enforce-safe-stringify';

// The rewrite JSON.stringify -> stringify is offered as a SUGGESTION, never an
// auto-fix (#1332): `stringify` returns `string | undefined`, so a blind `--fix`
// silently widens the return type and breaks `: string` contracts (TS2322/
// TS2345) while lint passes. Every invalid case therefore asserts `output: null`
// (── `--fix` is a no-op) plus the opt-in suggestion output.
ruleTesterTs.run('enforce-safe-stringify', enforceStableStringify, {
  valid: [
    {
      code: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
    },
    {
      code: `
// Should not flag JSON.stringify in comments
// JSON.stringify example
const str = "JSON.stringify in string";
      `,
    },
  ],
  invalid: [
    {
      code: `
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
            },
          ],
        },
      ],
    },
    {
      code: `
import something from 'other-module';
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
import something from 'other-module';
const obj = { a: 1 };
const result = stringify(obj);
      `,
            },
          ],
        },
      ],
    },
    {
      // Import already present: the suggestion replaces only the call.
      code: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
            },
          ],
        },
      ],
    },
    {
      // Two call sites: each is an independent report + suggestion. Applying one
      // suggestion adds the import and rewrites only that call, leaving the other
      // untouched (a later re-lint suppresses the duplicate import).
      code: `
const obj = { a: 1 };
const result1 = JSON.stringify(obj);
const result2 = JSON.stringify(obj, null, 2);
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result1 = stringify(obj);
const result2 = JSON.stringify(obj, null, 2);
      `,
            },
          ],
        },
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result1 = JSON.stringify(obj);
const result2 = stringify(obj, null, 2);
      `,
            },
          ],
        },
      ],
    },
    {
      // The reported regression (#1332): result flows into a `: string` contract
      // via an `unknown`-typed argument. `--fix` must NOT touch it (output:
      // null); the migration is available only as an explicit suggestion, so the
      // author consciously handles `stringify`'s `string | undefined` return.
      code: `
type ExecFn = (cmd: string, args: unknown) => string;

const mockExec: ExecFn = (_cmd, args) => {
  return JSON.stringify(args);
};
`,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
import stringify from 'safe-stable-stringify';
type ExecFn = (cmd: string, args: unknown) => string;

const mockExec: ExecFn = (_cmd, args) => {
  return stringify(args);
};
`,
            },
          ],
        },
      ],
    },
  ],
});
