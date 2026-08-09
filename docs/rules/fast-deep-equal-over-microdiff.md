# Enforce using fast-deep-equal for equality checks instead of microdiff (`@blumintinc/blumint/fast-deep-equal-over-microdiff`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using fast-deep-equal for equality checks instead of microdiff.

## Rule Details

This rule enforces that boolean equality checks use `fast-deep-equal` instead of counting results from `microdiff`. `microdiff` builds and returns a change list for diff inspection, so using it for equality forces unnecessary allocations and obscures the intent of a simple true/false comparison. `fast-deep-equal` performs a direct equality check and keeps equality intent obvious.

### Why this matters

- `microdiff` creates diff entries (paths, types, values) before you ever count `.length`, which is wasted work when you only need a boolean.
- Equality intent is explicit with `isEqual(a, b)`, reducing the chance that future edits treat the value as a diff they can iterate.
- `fast-deep-equal` is optimized for equality and avoids the extra allocations that slow hot code paths.

### What this rule checks

- Comparisons such as `microdiff(a, b).length === 0`, `0 === diff(a, b).length`, or `!diff(a, b).length`.
- Comparisons that use a variable assigned to `diff(...)` when that variable is only used for `.length` checks.
- Aliased imports of both microdiff and the deep-equality function.
- The same comparisons written with an optional chain — `changes?.length === 0`, `diff(a, b)?.length === 0`, `!changes?.length`. The rule reports only after establishing that the receiver is a `diff(...)` result, and `diff()` returns an array, so the `?.` branch never runs and the check means exactly what its unchained spelling means. Enforcing on one spelling and not the other would leave a whole idiom unenforced.

### Which imports count as microdiff

Both specifiers are recognised, since they are the same library under two names:

- `@blumintinc/microdiff` — BluMint's fork, and the dependency this codebase declares.
- `microdiff` — upstream, for files not yet on the fork.

The specifier alone is not enough: the import has to bind microdiff's diff
function, through a default specifier or a named `diff` specifier. microdiff's
other exports are types, so `import type { Difference } from '@blumintinc/microdiff'`
brings no `diff` into the file, and an unrelated local `diff(...)` there is not a
microdiff call.

A namespace import (`import * as microdiff from '@blumintinc/microdiff'`) is
deliberately not matched. The local name is the module rather than the diff
function, and a member call through it cannot be attributed to microdiff without
guessing.

### Which imports count as the equality function

Four specifiers resolve to a deep-equality function of the same shape, and a
file on any of them already has the comparison this rule asks for:

- `@blumintinc/fast-deep-equal` — BluMint's fork, the dependency this codebase declares, and the specifier the fix emits.
- `@blumintinc/fast-deep-equal/react` — the fork's React entry point, for comparing props.
- `fast-deep-equal` — upstream.
- `fast-deep-equal/es6` — upstream's ESM build.

The import also has to bind something callable. A bare `import
'@blumintinc/fast-deep-equal';` and a namespace import bind no equality
function, so a file with only one of those still gets its own import rather than
a call to a name nothing declares.

### Autofix

- Adds an `@blumintinc/fast-deep-equal` import if missing, keeping any existing local alias or adding a default import named `isEqual`. The scoped fork is the declared dependency, so it is the only specifier the fix writes.
- Replaces `microdiff` length comparisons with the imported equality function call (for example, `isEqual(left, right)` or a local alias like `deepEqual(left, right)`), or its negation for inequality checks.
- Rewrites the comparison in place — only the callee name and the `.length` comparison change — so the argument list keeps its formatting and its comments. A comment inside the call is often an `eslint-disable` directive, and dropping one silently re-enables the rule it suppresses:

```ts
// before
return diff(
  // eslint-disable-next-line no-console
  console.log(a),
  b,
).length === 0;

// after
return isEqual(
  // eslint-disable-next-line no-console
  console.log(a),
  b,
);
```

- Declines to fix when the target name is already bound to something other than one of the equality-function imports above, since the inserted import would either collide with that declaration or bind the emitted call to the local value.
- Drops a `const changes = diff(a, b);` statement that exists only to be measured, once the call is inlined into the comparison. The statement is deleted by its own range, not by line boundaries:

  - A declaration that occupies its line alone takes the whole line, so no blank line is left behind.
  - A declaration that shares its line keeps everything else on it — the comparison being rewritten, the `;` separating a `for` header's clauses, and any comment. A trailing `// eslint-disable-next-line` governs the *surviving* next line, so swallowing it would silently re-enable the rule it suppresses:

  ```ts
  // before
  const changes = diff(a, b); // eslint-disable-next-line no-console
  return changes.length === 0 && !console.log(a);

  // after
  // eslint-disable-next-line no-console
  return isEqual(a, b) && !console.log(a);
  ```

- Reports without a fix when the comparison sits *inside* the declaration the fix would delete — a diff argument that reads `changes.length`, as in `const changes = diff(a, changes.length === 0);`. The two edits cannot be made disjoint there, and ESLint rejects overlapping edits within one report by throwing, which discards every message for the file. The violation is still reported, and the import is left for a violation that can be fixed.
- Removes the `microdiff` import when the rewrite deleted its last reference, in the *same* fix as the rewrite. Stripping a binding's last use and leaving the declaration behind turns a file that lints clean into one that fails `no-unused-vars` — and since the rewrite resolves this rule's own report, nothing re-reports the debt:

  ```ts
  // before
  import diff from 'microdiff';

  export const eq = (a, b) => diff(a, b).length === 0;

  // after
  import isEqual from '@blumintinc/fast-deep-equal';

  export const eq = (a, b) => isEqual(a, b);
  ```

  The removal is narrow, because deleting an import that is still read is the worse defect:

  - Only the specifier whose last reference the fix deleted goes. `import diff, { Difference } from '@blumintinc/microdiff';` keeps `Difference` when a type annotation elsewhere still names it, and gives up the whole statement only when no specifier survives.
  - A `diff` still called anywhere else in the file keeps its import, whether the surviving call is a diff-analysis use or a violation an inline `eslint-disable` suppressed.
  - The argument list is carried through verbatim rather than deleted, so an import read only by the arguments — `diff(normalize(a), b)` — survives the inlining.
  - The whole fix is declined when the import cannot be unbound cleanly: a comment inside the declaration, a directive comment bound to the line below it, or a same-named local elsewhere in the file that scope analysis and a text scan could disagree about. Half of this edit is worse than none of it.

### Examples of **incorrect** code for this rule:

```ts
import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

function areObjectsLooseEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}

function areObjectsEqual(obj1, obj2) {
  return !diff(obj1, obj2).length;
}

function updateIfNeeded(obj1, obj2) {
  if (diff(obj1, obj2).length === 0) {
    return false;
  }
  return true;
}
```

```ts
import diff, { Difference } from '@blumintinc/microdiff';

export function isSame(a: object, b: object) {
  const changes: Difference[] = diff(a, b);
  return changes.length === 0;
}
```

An optional chain on the length access does not change the check:

```ts
import diff from '@blumintinc/microdiff';

export function isSame(a: object, b: object) {
  const changes = diff(a, b);
  return changes?.length === 0;
}

export function isSameDirect(a: object, b: object) {
  return diff(a, b)?.length === 0;
}
```

### Examples of **correct** code for this rule:

```ts
import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}
```

```ts
import isEqual from '@blumintinc/fast-deep-equal/react';

function arePropsEqual(prevProps, nextProps) {
  return isEqual(prevProps, nextProps);
}
```

```ts
import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}
```

```ts
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}
```

### Valid usage of microdiff:

This rule does not flag the use of `microdiff` when it's being used for its intended purpose - analyzing specific differences between objects:

```ts
import { diff } from 'microdiff';

// Using microdiff to get detailed changes
function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}

function applyPartialUpdates(oldSettings, newSettings) {
  const changes = diff(oldSettings, newSettings);
  const needsRefresh = changes.some(change =>
    change.path.includes('critical_setting')
  );
  return needsRefresh;
}

function detectItemChanges(oldItems, newItems) {
  const changes = diff(oldItems, newItems);
  const addedItems = changes.filter(change => change.type === 'CREATE');
  const removedItems = changes.filter(change => change.type === 'REMOVE');
  const updatedItems = changes.filter(change => change.type === 'UPDATE');
  return { addedItems, removedItems, updatedItems };
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}
```

The same holds for the fork, and for a file that imports only microdiff's types:

```ts
import diff from '@blumintinc/microdiff';
import type { Difference } from '@blumintinc/microdiff';

export function summarize(before: object, after: object) {
  const changes: Difference[] = diff(before, after);
  return changes.map((change) => change.path.join('.'));
}
```

### Interaction with inline disable comments

Every rewrite in a file ships as a single fix, carried by the first violation
that is **not** suppressed by an inline `eslint-disable` directive. That fix also
adds the `import isEqual from '@blumintinc/fast-deep-equal';` statement once, and
removes the `microdiff` import when the batch leaves it unread — the three have
to be one edit, since ESLint applies a fix whole or not at all and a partial
application would either strand an `isEqual(...)` call without its import or
delete an import a surviving call still needs.

Suppressing an individual check therefore never strands the remaining
`isEqual(...)` calls without their import, and keeps the `microdiff` import the
suppressed check still reads:

```ts
import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;  // left alone
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;  // fixed to !isEqual(a, b), and carries the import
}
```

## When Not To Use It

You should not use this rule if:

1. You deliberately want to rely on `microdiff` for both diffing and equality checks and accept the extra allocations.
1. Your code path is not performance-sensitive and you prefer to avoid importing `fast-deep-equal`.
1. You maintain compatibility with code that depends on `microdiff`’s change objects even when equality is all that is needed.

## Further Reading

- [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) - A fast deep equality check library
- [microdiff](https://github.com/AsyncBanana/microdiff) - A tiny, fast, zero-dependency object and array comparison library
- [Performance Comparison](https://github.com/epoberezkin/fast-deep-equal#benchmark) - Benchmark comparisons of deep equality libraries
