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
    {
      // A file that binds `stringify` itself but never calls JSON.stringify is
      // untouched: the collision handling below only withholds suggestions, it
      // never adds reports.
      code: `
const stringify = (value: unknown) => String(value);
const result = stringify({ a: 1 });
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
    {
      // #1419 half (a): a module-scope `const stringify` collides with the
      // inserted import (TS2440), so the suggestion is withheld while the
      // report stands.
      code: `
const stringify = (value: unknown) => String(value);
const result = JSON.stringify({ a: 1 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A function declaration binds the name just as a const does (TS2440).
      code: `
function stringify(value: unknown) {
  return String(value);
}
const result = JSON.stringify({ a: 1 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A class declaration binds the name as well (TS2440).
      code: `
class stringify {}
const result = JSON.stringify({ a: 1 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A named import of `stringify` from an unrelated module: inserting the
      // safe-stable-stringify import duplicates the identifier (TS2300) and the
      // replacement would call the wrong function.
      code: `
import { stringify } from 'querystring';
const query = stringify({ b: 2 });
const result = JSON.stringify({ a: 1 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A namespace import is not callable, so reusing the binding would break
      // the call even though it points at the right module.
      code: `
import * as stringify from 'safe-stable-stringify';
const result = JSON.stringify({ a: 1 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A named `stringify` specifier from safe-stable-stringify IS the right
      // binding, so the suggestion stands and must not append a duplicate
      // default import of the same module.
      code: `
import { stringify } from 'safe-stable-stringify';
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
import { stringify } from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
            },
          ],
        },
      ],
    },
    {
      // The import is hoisted, so a call site preceding it in source order is
      // already covered: reading the AST at fix time avoids emitting a second
      // copy of the import.
      code: `
const early = JSON.stringify({ a: 1 });
import stringify from 'safe-stable-stringify';
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [
            {
              messageId: 'replaceWithStringify',
              output: `
const early = stringify({ a: 1 });
import stringify from 'safe-stable-stringify';
      `,
            },
          ],
        },
      ],
    },
    {
      // #1419 half (b): a shadowing parameter captures the replacement with no
      // compile error, so the rewrite would silently call the parameter.
      code: `
import stringify from 'safe-stable-stringify';
export const run = (stringify: (value: unknown) => string) => {
  return JSON.stringify({ a: 1 }) + stringify({ b: 2 });
};
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A local declaration inside the function body shadows the import too.
      code: `
import stringify from 'safe-stable-stringify';
export function run() {
  const stringify = (value: unknown) => String(value);
  return JSON.stringify({ a: 1 }) + stringify({ b: 2 });
}
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // The shadow is found by walking the whole scope chain, not just the
      // innermost scope.
      code: `
import stringify from 'safe-stable-stringify';
export const outer = (stringify: (value: unknown) => string) => {
  const inner = () => {
    return JSON.stringify({ a: 1 });
  };
  return inner() + stringify({ b: 2 });
};
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
    {
      // A shadow in a sibling scope never reaches the call site, so resolution
      // through the scope chain (rather than a file-wide name search) keeps the
      // suggestion available.
      code: `
const helper = (stringify: (value: unknown) => string) => stringify({});
const result = JSON.stringify({ a: 1 });
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
const helper = (stringify: (value: unknown) => string) => stringify({});
const result = stringify({ a: 1 });
      `,
            },
          ],
        },
      ],
    },
    {
      // Two call sites under one collision: every report keeps firing, and each
      // suggestion is withheld independently.
      code: `
const stringify = (value: unknown) => String(value);
const first = JSON.stringify({ a: 1 });
const second = JSON.stringify({ b: 2 });
      `,
      output: null,
      errors: [
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
        {
          messageId: 'useStableStringify',
          suggestions: [],
        },
      ],
    },
  ],
});
