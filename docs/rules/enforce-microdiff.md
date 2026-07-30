# Enforce using microdiff for object and array comparison operations (`@blumintinc/blumint/enforce-microdiff`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Deep comparison of objects and arrays is standardized on [`microdiff`](https://github.com/AsyncBanana/microdiff). This rule reports competing diffing libraries, hand-rolled deep-comparison helpers, and `JSON.stringify` equality checks, steering them to `diff` from `microdiff`.

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

### Examples of **correct** code

```ts
import { diff } from 'microdiff';

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

Resolution keys on the local name a specifier binds, so `import { somethingElse as detailedDiff } from 'deep-object-diff'` is covered. An alias pointing the other way (`import { detailedDiff as dd } from 'deep-object-diff'`) is caught by the separate tracking of every specifier a competing library's import binds, which follows the local name regardless of what it is called.

## Autofix

The fix retires a competing library's import declaration and rewrites its call sites to `diff`, reusing an existing `microdiff` import when the file already has one. It declines whenever the file binds `diff` to something else — a module-scope declaration the inserted import would redeclare, or a narrower shadow that would silently capture the rewritten call — so the report stands for the author to resolve the name clash deliberately.

### lodash's difference family is report-only

`_.difference`, `_.differenceBy`, and `_.differenceWith` are reported but never rewritten. lodash returns the elements of the first array that have no match in the second — a subset of the input — while `diff(a, b)` returns a structural change list of `{type, path, value}` records. The two do not compute the same thing, and lodash's third argument (an iteratee or comparator) has no counterpart in microdiff's signature, whose third parameter is an options object. Any mechanical rewrite would change what the surrounding code receives, so the conversion is left to the author.
