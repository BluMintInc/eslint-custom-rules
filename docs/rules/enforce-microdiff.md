# Enforce using microdiff for object and array comparison operations (`@blumintinc/blumint/enforce-microdiff`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Deep comparison of objects and arrays is standardized on `@blumintinc/microdiff`, BluMint's fork of [`microdiff`](https://github.com/AsyncBanana/microdiff). This rule reports competing diffing libraries, hand-rolled deep-comparison helpers, and `JSON.stringify` equality checks, steering them to that package's `diff`.

Both packages export their diff function as the module **default**, so the import is `import diff from '@blumintinc/microdiff'` — `Difference`, `MicrodiffOptions` and the `default*` predicates are the only named exports, and a `{ diff }` specifier binds nothing. A file already importing from upstream `microdiff` satisfies the rule and is left as it is.

`fast-deep-equal` (and `fast-deep-equal/es6`) is an allowed alternative for plain equality checks and is never reported.

### Examples of **incorrect** code

```ts
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}
```

```ts
function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}
```

```ts
export const hasConfigChanged = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
```

### Examples of **correct** code

```ts
import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}
```

```ts
import isEqual from 'fast-deep-equal';

function isTournamentEqual(beforeTournament, tournament) {
  return isEqual(beforeTournament, tournament);
}
```

```ts
// A local definition owns its name, whatever a diff library calls its exports.
function detailedDiff(a, b) {
  return { added: [], removed: [] };
}

export const changes = detailedDiff(oldState, newState);
```

### Names are resolved, not matched

Calls to `deepDiff`, `fastDiff`, `diffArrays`, and `detailedDiff` are reported only when the callee resolves through the scope chain to an import from one of the libraries this rule replaces (`deep-diff`, `fast-diff`, `diff`, `deep-object-diff`). A name bound to a local function, a variable, a parameter, or an import from any other module is the file's own — it is neither reported nor rewritten. An unbound name is left alone too, since renaming it to `diff` would only trade one unresolved name for another.

Resolution keys on the local name a specifier binds, so `import { somethingElse as detailedDiff } from 'deep-object-diff'` is covered. An alias pointing the other way (`import { detailedDiff as dd } from 'deep-object-diff'`) is caught by the separate tracking of every specifier a competing library's import binds, whatever name it is bound under.

That tracking resolves call sites too, so a local binding that shadows the imported name answers its own calls:

```ts
import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  // Calls the local arrow, so it is neither reported nor rewritten. The import
  // above is reported, but left in place: nothing it binds is read.
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}
```

Rewriting such a call would substitute microdiff's structural change list for whatever the shadow computed — a swap that compiles cleanly and leaves the shadow unused, so nothing downstream would flag it. Shadowing an import is its own smell, and [`no-shadow`](https://eslint.org/docs/latest/rules/no-shadow) is the rule that reports it.

## Autofix

The fix retires a competing library's import declaration and rewrites its call sites to `diff`, reusing an existing microdiff import when the file already has one. It declines whenever the file binds `diff` to something else — a module-scope declaration the inserted import would redeclare, or a narrower shadow that would silently capture the rewritten call — so the report stands for the author to resolve the name clash deliberately.

### The import and its call sites move together

Retiring an import is what frees the name `diff` and binds it to microdiff, so the two halves of the fix are all-or-nothing. The import is retired only when every reference it binds is a call this rule rewrites, and a call is renamed only when the import binding its callee is retired in the same pass (or microdiff is already imported). Either half alone leaves a name unresolved, so the following are reported without a fix:

```ts
// `applyChange` has no microdiff counterpart, so the declaration binding it has
// to stay — and `deepDiff` stays with it.
import { diff as deepDiff, applyChange } from 'deep-diff';

export function compare(oldConfig, newConfig) {
  applyChange(oldConfig, newConfig);
  return deepDiff(oldConfig, newConfig);
}
```

```ts
// Passed as a value rather than called: there is no call site to rewrite.
import { detailedDiff } from 'deep-object-diff';

export const chosen = detailedDiff;
```

```ts
// `diff(obj, newObj, options?)` needs both operands, so a one-argument call has
// no conversion.
import deepDiff from 'deep-diff';

export const f = (oldConfig) => deepDiff(oldConfig);
```

### Neither half may leave a binding behind

The same accounting runs in the other direction: a fix that resolves every reference can still leave a *binding* nothing reads, which the consumer's `no-unused-vars` and `noUnusedLocals` fail the build on even though the output compiles and the fix loop converges.

Replacing a competing import with microdiff's is a fix only when that import feeds a call the same pass rewrites. A declaration whose names are all shadowed, or that nothing references at all, feeds none — so it is reported and left alone rather than swapped for a `diff` no code reads:

```ts
// Reported, not rewritten: the calls belong to the shadow, so replacing this
// import would trade one unused name for another.
import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}
```

Once the file imports microdiff — because another comparison in it was converted, or because it already did — such an import is *removed* instead, which binds nothing new.

A call rename obeys the mirror of the rule: it stops referencing whatever bound the callee, so either the import binding it is retired in the same pass, or some other reference has to keep that name read.

```ts
// Reported, not rewritten: `applyChange` keeps the declaration alive, so
// renaming the only call of `deepDiff` would leave that specifier bound to
// nothing.
import diff from '@blumintinc/microdiff';
import { diff as deepDiff, applyChange } from 'deep-diff';

export function compare(oldConfig, newConfig) {
  applyChange(oldConfig, newConfig);
  return deepDiff(oldConfig, newConfig).length + diff(oldConfig, newConfig).length;
}
```

### `JSON.stringify` comparisons are rewritten in place

A `JSON.stringify(x) !== JSON.stringify(y)` comparison becomes `diff(x, y).length > 0`; `===` becomes `.length === 0`. The operands are the comparison's own, and only the comparison's range is replaced, so the enclosing body keeps every statement it shares with it — side effects, guard clauses, locals, and the comments around them:

```ts
import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  recordComparison(oldConfig, newConfig);
  if (!oldConfig) {
    return true;
  }
  // A comparison of two properties stays a comparison of those properties.
  return diff(oldConfig.settings, newConfig.settings).length > 0;
}
```

Both spellings of a comparison function carry the same rewrite — a `function` declaration and an arrow bound to a `const` — so an identical violation is auto-remediable however it is written. The signature is outside the replaced range in either spelling, so the `export`, the parameters and their annotations all survive, and an arrow's concise expression body needs no `return` and no semicolon because the body is never part of the range:

```ts
import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) =>
  diff(oldConfig, newConfig).length > 0;
```

The fix is declined, leaving the report for the author, when the body holds no such comparison or more than one — there is either nothing to rewrite or no way to tell which comparison the answer turns on — and when either `JSON.stringify` call has no argument to pass on. A comparison inside a nested callback is left alone too, since the check that `diff` is emittable inspects the reported function's scope rather than the callback's.

A comparison function whose body compares only with `===` is reported without a rewrite in either spelling: the rewrite follows bodies that phrase the question the way the name does, `!==`. The sense of what is emitted still comes off the comparison's own operator, so an `===` comparison reached past a `!==` guard becomes `.length === 0`.

### lodash's difference family is report-only

`_.difference`, `_.differenceBy`, and `_.differenceWith` are reported but never rewritten. lodash returns the elements of the first array that have no match in the second — a subset of the input — while `diff(a, b)` returns a structural change list of `{type, path, value}` records. The two do not compute the same thing, and lodash's third argument (an iteratee or comparator) has no counterpart in microdiff's signature, whose third parameter is an options object. Any mechanical rewrite would change what the surrounding code receives, so the conversion is left to the author.
