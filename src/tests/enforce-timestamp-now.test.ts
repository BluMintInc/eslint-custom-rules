import { ruleTesterTs } from '../utils/ruleTester';
import { enforceTimestampNow } from '../rules/enforce-timestamp-now';

// Mock the context.getFilename() to simulate backend files
const backendFilePath = 'functions/src/some/path/file.ts';
const frontendFilePath = 'src/components/SomeComponent.tsx';
const backendTestFilePath = 'functions/src/some/path/file.test.ts';
// Windows backslash form of a backend path (issue #1266).
const windowsBackendFilePath = 'C:\\repo\\functions\\src\\some\\path\\file.ts';

ruleTesterTs.run('enforce-timestamp-now', enforceTimestampNow, {
  valid: [
    // Valid usage of Timestamp.now() in backend
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage with aliased import
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage with dynamic import
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Valid usage in frontend (rule should not apply)
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      filename: frontendFilePath,
    },
    // Valid usage in frontend with Date.now()
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const timestamp = Timestamp.fromMillis(Date.now());
      `,
      filename: frontendFilePath,
    },
    // Valid usage in frontend with new Date()
    {
      code: `
        const now = new Date();
        const formattedDate = now.toLocaleDateString();
      `,
      filename: frontendFilePath,
    },
    // Valid usage in backend test files (rule should not apply)
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const mockTimestamp = Timestamp.fromDate(new Date('2023-01-01'));
      `,
      filename: backendTestFilePath,
    },
    // Issue #1266: a Windows backslash FRONTEND path stays exempt after
    // separator normalization — the rule only applies to functions/src.
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      filename: 'C:\\repo\\src\\components\\SomeComponent.tsx',
    },
    // Valid usage with custom date calculation
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const futureTimestamp = Timestamp.fromDate(futureDate);
      `,
      filename: backendFilePath,
    },
    // Valid usage with explicit date string
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const specificTimestamp = Timestamp.fromDate(new Date('2023-01-01'));
      `,
      filename: backendFilePath,
    },
    // Issue #1521: a backend file with no Timestamp import must not be flagged.
    // The autofix would otherwise emit an unbound `Timestamp` reference and turn
    // compiling code into TS2304.
    {
      code: `
        export function f() {
          const now = new Date();
          return now.toLocaleDateString();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1521: same for a timestamp-named variable with no usage at all —
    // the variable name alone must not unlock a fix that references an
    // identifier the file never binds.
    {
      code: `
        const createdAt = new Date();
      `,
      filename: backendFilePath,
    },
    // Issue #1521: an unrelated module exporting a `Timestamp` binding is not
    // evidence of the Firestore class, so rewriting to `Timestamp.now()` would
    // silently call something else. Stay silent.
    {
      code: `
        import { Timestamp } from './my-own-clock';
        const createdAt = new Date();
      `,
      filename: backendFilePath,
    },
    // Issue #1521: a local binding shadowing the import captures the emitted
    // reference, so `Timestamp.now()` here would call something else entirely
    // (issues #1455/#1456). Stay silent rather than swap the value.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(getClock: () => { now: () => Date }) {
          const Timestamp = getClock();
          const createdAt = new Date();
          return { Timestamp, createdAt };
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1521: a dynamic import inside another function leaves the alias
    // out of scope at the `new Date()` site, so no fix can be offered there.
    {
      code: `
        async function load() {
          const { Timestamp } = await import('firebase-admin/firestore');
          return Timestamp.now();
        }
        const createdAt = new Date();
      `,
      filename: backendFilePath,
    },
    // Issue #1528: `Timestamp` exposes none of `Date`'s formatting helpers or
    // `getX` accessors, so rewriting the initializer turns each of these calls
    // into TS2339. Every member below was measured as broken by the autofix.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toLocaleDateString();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toLocaleTimeString();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.getTime();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.getFullYear();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toDateString();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: the members the original denylist happened to name stay
    // exempt — the fix generalizes the guard, it does not narrow it.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toISOString();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toLocaleString();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toString();
        }
      `,
      filename: backendFilePath,
    },
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          return expiresAt;
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: `Timestamp` declares `valueOf()` too, but it returns an
    // encoded `string` where `Date#valueOf()` returns a `number`. The call site
    // keeps compiling while the value silently changes type, so decline.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.valueOf();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: a use that escapes the declaration carries a type this rule
    // cannot see. Passing the binding to a function typed `(date: Date)` would
    // become TS2345.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        declare function elapsed(since: Date): number;
        export function f() {
          const now = new Date();
          return elapsed(now);
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: returning the binding exports the swapped type to every
    // caller, and an annotated return type would become TS2322.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(): Date {
          const now = new Date();
          return now;
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: a comparison relies on `Date`'s numeric primitive; the
    // `Timestamp` primitive is a string.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(deadline: Date) {
          const now = new Date();
          return now > deadline;
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: interpolation renders a completely different string.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return \`run at \${now}\`;
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: a computed member access hides which member is read.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(key: 'toMillis') {
          const now = new Date();
          return now[key]();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: an exported binding is read by files this rule never sees,
    // so the rewrite would move the breakage into an importer.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export const createdAt = new Date();
      `,
      filename: backendFilePath,
    },
    // Issue #1528: a later write rebinds the variable to a real `Date`, which
    // no longer matches the rewritten initializer.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(override?: Date) {
          let now = new Date();
          if (override) {
            now = override;
          }
          return now;
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: a whole-declaration `import type` binds `Timestamp` as a
    // type only, so emitting `Timestamp.now()` against it is TS1361.
    {
      code: `
        import type { Timestamp } from 'firebase-admin/firestore';
        export function f(): void {
          const now = new Date();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: the inline-specifier spelling is type-only just the same.
    {
      code: `
        import { type Timestamp } from 'firebase-admin/firestore';
        export function f(): void {
          const now = new Date();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: an aliased type-only import is no more usable as a value.
    {
      code: `
        import type { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const createdAt = new Date();
      `,
      filename: backendFilePath,
    },
    // Issue #1530: a Timestamp-compatible member use does not rescue a
    // type-only binding — the emitted receiver is still unusable as a value.
    {
      code: `
        import type { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toMillis();
        }
      `,
      filename: backendFilePath,
    },
  ],
  invalid: [
    // Invalid usage of Timestamp.fromDate(new Date()) in backend
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'Timestamp.fromDate(new Date())',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with aliased import
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.fromDate(new Date());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'FirestoreTimestamp.fromDate(new Date())',
            timestampAlias: 'FirestoreTimestamp',
          },
        },
      ],
      output: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const timestamp = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with Timestamp.fromMillis(Date.now())
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.fromMillis(Date.now());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'Timestamp.fromMillis(Date.now())',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with direct new Date() assignment
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with createdAt naming
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const createdAt = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const createdAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with updatedAt naming
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const updatedAt = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const updatedAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Invalid usage with dynamic import
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'Timestamp.fromDate(new Date())',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Issue #1266: a Windows backslash backend path must be enforced. Before
    // separator normalization the forward-slash `functions/src/` fragment never
    // matched, so the rule silently no-op'd on Windows.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'Timestamp.fromDate(new Date())',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        const timestamp = Timestamp.now();
      `,
      filename: windowsBackendFilePath,
    },
    // Issue #1521: with the import present the `new Date()` fix still applies —
    // the guard must be reachable in both directions. The use has to be one
    // `Timestamp` supports, or the #1528 usage guard declines instead.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = new Date();
          return now.toMillis();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const now = Timestamp.now();
          return now.toMillis();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1521: a shadow in a sibling function cannot reach this site, so the
    // fix still applies here. The shadow check is per report site, not per file.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        function other() {
          const Timestamp = 1;
          return Timestamp;
        }
        export function f() {
          const createdAt = new Date();
          return { createdAt: createdAt.toMillis(), other };
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        function other() {
          const Timestamp = 1;
          return Timestamp;
        }
        export function f() {
          const createdAt = Timestamp.now();
          return { createdAt: createdAt.toMillis(), other };
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1521: the fix names the imported alias, not the default name.
    {
      code: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const createdAt = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'FirestoreTimestamp',
          },
        },
      ],
      output: `
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        const createdAt = FirestoreTimestamp.now();
      `,
      filename: backendFilePath,
    },
    // Issue #1521: a module-scope dynamic import binds the alias for the whole
    // module, so the `new Date()` fix is safe.
    {
      code: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const createdAt = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        const { Timestamp } = await import('firebase-admin/firestore');
        const createdAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Issue #1521: the client SDK entrypoint counts as an import too.
    {
      code: `
        import { Timestamp } from 'firebase/firestore';
        const updatedAt = new Date();
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase/firestore';
        const updatedAt = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Issue #1521: import bindings are hoisted, so an import written after the
    // usage still authorizes the fix. Collecting imports in traversal order
    // would miss this.
    {
      code: `
        const createdAt = new Date();
        import { Timestamp } from 'firebase-admin/firestore';
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        const createdAt = Timestamp.now();
        import { Timestamp } from 'firebase-admin/firestore';
      `,
      filename: backendFilePath,
    },
    // Issue #1521: `Timestamp.fromDate(...)` rewrites an identifier the source
    // already binds, so it stays reportable even when the import is invisible
    // to the rule (here a `require`). Only the synthesized-name path needs the
    // import guard.
    {
      code: `
        const { Timestamp } = require('firebase-admin/firestore');
        const timestamp = Timestamp.fromDate(new Date());
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'Timestamp.fromDate(new Date())',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        const { Timestamp } = require('firebase-admin/firestore');
        const timestamp = Timestamp.now();
      `,
      filename: backendFilePath,
    },
    // Issue #1528: `toDate()` is part of the `Timestamp` surface, so the
    // rewritten binding still answers the call.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const createdAt = new Date();
          return createdAt.toDate();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const createdAt = Timestamp.now();
          return createdAt.toDate();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: the `seconds` / `nanoseconds` fields and `isEqual()` are
    // `Timestamp` members too, so a binding using only those is safe to rewrite.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(other: Timestamp) {
          const updatedAt = new Date();
          return updatedAt.seconds + updatedAt.nanoseconds + Number(updatedAt.isEqual(other));
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(other: Timestamp) {
          const updatedAt = Timestamp.now();
          return updatedAt.seconds + updatedAt.nanoseconds + Number(updatedAt.isEqual(other));
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530 control: the same file with a value import still fixes, so
    // the type-only screen narrows nothing it should not.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(): void {
          const now = new Date();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(): void {
          const now = Timestamp.now();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: an inline `type` specifier disqualifies only itself, so a
    // value import of `Timestamp` alongside it still authorizes the fix.
    {
      code: `
        import { type DocumentData, Timestamp } from 'firebase-admin/firestore';
        export function f(data: DocumentData): void {
          const createdAt = new Date();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { type DocumentData, Timestamp } from 'firebase-admin/firestore';
        export function f(data: DocumentData): void {
          const createdAt = Timestamp.now();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: a separate type-only import declaration from the same module
    // does not taint the value import that sits beside it.
    {
      code: `
        import type { DocumentData } from 'firebase-admin/firestore';
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(data: DocumentData): void {
          const updatedAt = new Date();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import type { DocumentData } from 'firebase-admin/firestore';
        import { Timestamp } from 'firebase-admin/firestore';
        export function f(data: DocumentData): void {
          const updatedAt = Timestamp.now();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1530: a type-only import of `Timestamp` in one declaration and a
    // value import of it in another still leaves a usable value binding.
    {
      code: `
        import type { Timestamp } from 'firebase-admin/firestore';
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        export function f(previous: Timestamp): void {
          const createdAt = new Date();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'FirestoreTimestamp',
          },
        },
      ],
      output: `
        import type { Timestamp } from 'firebase-admin/firestore';
        import { Timestamp as FirestoreTimestamp } from 'firebase-admin/firestore';
        export function f(previous: Timestamp): void {
          const createdAt = FirestoreTimestamp.now();
        }
      `,
      filename: backendFilePath,
    },
    // Issue #1528: a binding with no member access at all keeps its fix — there
    // is no `Date` surface for the rewrite to break.
    {
      code: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const createdAt = new Date();
        }
      `,
      errors: [
        {
          messageId: 'preferTimestampNow',
          data: {
            expression: 'new Date()',
            timestampAlias: 'Timestamp',
          },
        },
      ],
      output: `
        import { Timestamp } from 'firebase-admin/firestore';
        export function f() {
          const createdAt = Timestamp.now();
        }
      `,
      filename: backendFilePath,
    },
  ],
});
