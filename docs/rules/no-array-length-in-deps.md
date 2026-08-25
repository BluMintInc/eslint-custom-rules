# Detects array.length entries in React hook dependency arrays because length ignores content changes; auto-fixes by memoizing stableHash(array) with useMemo and depending on the hash instead (`@blumintinc/blumint/no-array-length-in-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

**Prevent using `array.length` in React hook dependency arrays. Track the array contents via a memoized `stableHash(array)` and depend on the hash instead so hooks rerun when values change, not just when the array size changes.**

## Why this rule matters

- `length` only changes when items are added or removed. Sorting, replacing items in place, or mutating objects leaves `length` untouched, so effects and callbacks keep stale closures.
- Depending on a stable hash of the array content forces hooks to rerun when values change without relying on array identity. This prevents silent failures where UI or side effects fall behind data.
- The fixer wires in `stableHash` and `useMemo` so the dependency remains referentially stable and safe to share across hooks.

## How to fix

- Memoize a content hash inside the component/hook, after the array is declared: `const itemsHash = useMemo(() => stableHash(items), [items]);`
- Use the hash in dependency arrays: `[itemsHash]` instead of `[items.length]`.
- Imports for `useMemo` and `stableHash` are added automatically by the fixer; an existing `react` (or hash helper) import is extended rather than duplicated.

## Rule Details

This rule flags any usage of `array.length` in the dependency arrays of `useEffect`, `useCallback`, and `useMemo`.
It auto-fixes by:

- Inserting a memoized hash variable immediately before the statement containing the hook call, inside the same block as the tracked array — so the memo sits after the array's declaration and before its consumer:
  - `const itemsHash = useMemo(() => stableHash(items), [items]);`
- Adding imports (extending an existing declaration when one imports from the same module):
  - `import { useMemo } from 'react';`
  - `import { stableHash } from 'functions/src/util/hash/stableHash';`

**Note:** The fixer inserts the imports above using the repo’s internal `stableHash` path. Adjust that import to match your project layout if different.
- Replacing the `array.length` expression inside the dependency array with the memoized variable name.
- Generating unique variable names by appending `Hash` (e.g., `itemsHash`) or `Hash2`, `Hash3`, etc. on conflict.

### Naming the generated hash

The binding is named after the array (or its last property) with a `Hash` suffix
— `items` → `itemsHash`, `data.items` → `itemsHash`. A numeric suffix
disambiguates a name already in use (`itemsHash2`).

`<base>Hash` is not always a name the codebase accepts, and
[`no-hungarian`](./no-hungarian.md) has no fixer, so a rejected name would leave
a manual rename behind in a file that was clean before `--fix` ran. The fixer
therefore checks each candidate against that rule's predicate and takes the
first one it accepts:

| base | emitted name | why |
| --- | --- | --- |
| `items`, `a`, `x` | `itemsHash`, `aHash`, `xHash` | the preferred spelling |
| `b`, `i` | `hashOfB`, `hashOfI` | `bHash`/`iHash` read as the single-letter Hungarian type prefixes (`b` = boolean, `i` = integer), so the base moves out of the leading position |
| `obj`, `arr`, `str`, `array`, `number`, … | `contentHash` (`contentHash2`, …) | a base that is itself a type word or one of its abbreviations taints every name carrying it as a segment, so the type-coded base is dropped — which is the rename `no-hungarian` asks for |

### When the fixer bails (report-only)

The fixer only runs when the generated `useMemo` is provably safe at its insertion point. It reports without fixing when:

- The hook call sits at module scope or in an expression-bodied arrow — there is no legal statement position for a `useMemo` declaration.
- The array (or any variable the memoized expression reads) is not resolvable to a declaration visible at the insertion point — e.g. an ambient global, or a binding scoped to a block the insertion point does not share.
- The array is declared after the hook statement, where the hoisted read would hit the temporal dead zone.
- The hook sits in a position control flow may skip, with no block between it and that guard (see below).
- Either `useMemo` or the hash helper name already resolves to something else at the hook call (see below).

In those cases, memoize the hash manually in the appropriate scope.

### When a guard has no block of its own

The memo is spliced immediately before the statement holding the hook, inside
the nearest enclosing block. A guard that wraps the hook *without* braces has no
statement position inside itself, so that insertion point sits **outside** the
guard — and the emitted `[<array>]` dependency array dereferences the guarded
value on every render. The fix is withheld rather than rewrite code that does
not throw into code that does:

```tsx
const C = ({ data }) => {
  // reported, left untouched by --fix: hoisting `stableHash(data.items)` above
  // the `if` would throw whenever `data` is undefined
  if (data) useEffect(() => { process(data.items); }, [data.items.length]);
  return null;
};
```

The same applies to every position a guard may skip: a `&&`/`||`/`??` right
operand, either arm of a ternary, a braceless `switch` case, a braceless loop
body, and the arguments of an optional call (`data?.run(...)`).

A guard that *does* own a block gives the memo a home under the narrowing, so
those keep their fix:

```tsx
const C = ({ data }) => {
  if (data) {
    const itemsHash = useMemo(() => stableHash(data.items), [data.items]);
    useEffect(() => { process(data.items); }, [itemsHash]);
  }
  return null;
};
```

An early return is equally fixable — the memo lands among the statements the
return already narrows. So are positions that run regardless of the branch
taken, such as an `if` test or the left operand of `&&`.

### When a name the fix needs is already taken

The generated declaration spells both `useMemo` and `stableHash` bare and
imports both, so the edit breaks when either name already resolves to something
else at the hook call:

- A module-scope `const`/`function`/`class` of that name, or an import of it
  from another module, collides with the inserted import (TS2440 / TS2300).
- A shadowing parameter or block-scoped binding captures the emitted call with
  **no** compile error at all, so the memo would call the shadow.
- A type-only import erases at compile time and cannot back a call.

Each name is resolved through the scope chain at the hook call, and the fix is
withheld whenever the visible binding is anything other than a named, non-type
value specifier of that exact name imported from the module the fix would use
(`react` for `useMemo`, `hashImport.source` for the helper). A namespace import,
a default import, or an alias binds a different value, so those count as
collisions too. Because the emitted code needs *both* names, a clash on either
one withholds the whole edit — a partial one would still be broken. The report
still fires; only the automated edit is skipped:

```tsx
const stableHash = (value) => String(value); // a local of the same name

const C = ({ items }) => {
  useEffect(() => { track(items); }, [items.length]); // reported, left untouched by --fix
  return null;
};
```

A file that already imports `useMemo` from `react` (or the helper from its
module) reuses that import rather than gaining a second one, and an import
aliased to a different local name (`import { stableHash as hashOf }`) leaves
the name free, so it never blocks the fix.

Extending an existing declaration is width-aware, exactly like the emitted
`useMemo` statement. The added specifier joins the line only while the result
still fits `printWidth`; past that the fixer re-lays the import one specifier
per line — the same form Prettier prints for that overflow — and a declaration
Prettier already broke across lines gains the specifier on its own line:

```tsx
import {
  stableHash as hashOf,
  stableHash,
} from 'functions/src/util/hash/stableHash';
```

The re-layout rewrites only the separators between the braces and the
specifiers, so a comment inside a specifier survives verbatim. A comment
sitting in one of those separator gaps is text the re-layout would have to
delete; the fixer instead leaves that declaration untouched and adds a
separate `import { stableHash } ...` declaration, as it also does for
namespace forms (`* as ns`, `d, * as ns`) that leave no grammatical slot for
a named specifier.

This ensures effects re-run whenever array contents change, not just when its length changes. `stableHash` safely stringifies values to produce a stable hash for arrays and objects.

## Options

- `hashImport.source` (default `functions/src/util/hash/stableHash`): Module path for the hash helper used by the fixer.
- `hashImport.importName` (default `stableHash`): Imported name for the hash helper.
- `printWidth` (default `80`): Column the autofix wraps its emitted code at, both the memo declaration and an extended import.

```js
'@blumintinc/blumint/no-array-length-in-deps': ['error', {
  // Column the autofix wraps the emitted declaration at
  printWidth: 80,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix wraps at, matching Prettier's option of the same name.
Set it to your formatter's `printWidth` so the fixed source is already in the
shape the formatter would produce; a lint run carrying `--fix` otherwise leaves
the tree failing `prettier --check`.

The emitted declaration re-spells the array expression twice — once inside
`stableHash(...)` and once in the `useMemo` dependency array — so its width
grows with the input rather than being fixed. At a two-space indent the flat
statement measures `41 + len(hashName) + 2 * len(expression)` columns, which an
ordinary dependency name such as `participants` already pushes past 80.

Within the width the declaration stays on one line; past it the fixer emits
Prettier's break form for a two-argument call:

```tsx
const registrationsHash = useMemo(
  () => stableHash(state.tournament.registrations),
  [state.tournament.registrations],
);
```

Wrapping unconditionally would be wrong in the other direction. A formatter
collapses a hand-broken short argument list straight back onto one line, so
always wrapping would trade an over-width line on long expressions for a
needlessly split one on every short case. The fixer measures the exact statement
it is about to write and only breaks when that measurement overflows.

The same measurement governs the import edit: an existing declaration gains
`, stableHash` in place while the extended line still fits, and switches to
the one-specifier-per-line layout once it does not.

## Warnings & Considerations

- Ensure `stableHash` is available in your project; adjust the generated import path if your helper lives elsewhere.
- The fixer introduces one memoized hash per array and appends numeric suffixes on conflicts (for example, `itemsHash2`); verify the naming fits your code style. A base that `no-hungarian` would reject in `<base>Hash` position gets an alternative name instead (see [Naming the generated hash](#naming-the-generated-hash)).
- Keep added `useMemo` calls in hook order; do not move them above conditional hooks to avoid Rules of Hooks violations.
- If you only care about emptiness, prefer an explicit boolean check in the effect body and locally disable this rule for that dependency array.
- For large or frequently changing arrays, hashing can be non-trivial—benchmark if this is on a hot path and consider cheaper identity signals when appropriate.

## Examples

### Examples of incorrect code

```tsx
export const useThing = () => {
  const participants = useParticipants();

  useEffect(() => {
    // ...
  }, [participants.length]);
};
```

#### Optional chaining

```tsx
const C = ({ data }) => {
  useEffect(() => {}, [data?.items.length]);
  return null;
};
```

#### Several `array.length` dependencies in one hook

```tsx
const C = ({ items, users, messages }) => {
  useEffect(() => {}, [items.length, users.length, messages.length]);
  return null;
};
```

### Examples of correct code

```tsx
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useThing = () => {
  const participants = useParticipants();

  const participantsHash = useMemo(() => stableHash(participants), [participants]);
  useEffect(() => {
    // ...
  }, [participantsHash]);
};
```

#### Optional chaining

The optional chain is preserved in both the memoized expression and its own dependency array.

```tsx
const C = ({ data }) => {
  const itemsHash = useMemo(() => stableHash(data?.items), [data?.items]);
  useEffect(() => {}, [itemsHash]);
  return null;
};
```

#### Several `array.length` dependencies in one hook

Each array gets its own hash, named after the array (or its last property).

```tsx
const C = ({ items, users, messages }) => {
  const itemsHash = useMemo(() => stableHash(items), [items]);
  const usersHash = useMemo(() => stableHash(users), [users]);
  const messagesHash = useMemo(() => stableHash(messages), [messages]);
  useEffect(() => {}, [itemsHash, usersHash, messagesHash]);
  return null;
};
```

## Edge Cases

- Primitive and complex arrays: Works for arrays of primitives and arrays of objects.
- Nullable arrays and conditionals: Optional chaining on array references is preserved in both memo and deps (e.g., `s?.users`).
- Variable naming: Appends `Hash` to the array name or last property (e.g., `listHash`, `usersHash`), adding a numeric suffix on conflict.
- False positives: If you truly only care about length (e.g., emptiness), temporarily disable: `// eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps` on the previous line.

## Interaction with inline disable comments

Both `import { useMemo } from 'react';` and the `stableHash` import are added
once per file, attached to the fix of the first violation that is **not**
suppressed by an inline `eslint-disable` directive. Suppressing an individual
hook therefore never strands the remaining `useMemo(() => stableHash(...))`
declarations without their imports:

```tsx
const C = ({ items, others }) => {
  // eslint-disable-next-line @blumintinc/blumint/no-array-length-in-deps
  useEffect(() => { track(items); }, [items.length]); // left alone
  useEffect(() => { track(others); }, [others.length]); // fixed, and carries both imports
  return null;
};
```

The violation is reported on the dependency array, so for a hook call spanning
several lines the `eslint-disable-next-line` comment must sit above the line
holding the dependency array — a comment above the `useEffect(` line covers a
different line and suppresses nothing.

## When Not To Use It

- If performance requirements or architectural constraints mean you only want to trigger when the length changes and not when contents change. Prefer a targeted disable comment for specific cases.
