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

## Autofix

The fix retires a competing library's import declaration and rewrites its call sites to `diff`, reusing an existing `microdiff` import when the file already has one. It declines whenever the file binds `diff` to something else — a module-scope declaration the inserted import would redeclare, or a narrower shadow that would silently capture the rewritten call — so the report stands for the author to resolve the name clash deliberately.

### lodash's difference family is report-only

`_.difference`, `_.differenceBy`, and `_.differenceWith` are reported but never rewritten. lodash returns the elements of the first array that have no match in the second — a subset of the input — while `diff(a, b)` returns a structural change list of `{type, path, value}` records. The two do not compute the same thing, and lodash's third argument (an iteratee or comparator) has no counterpart in microdiff's signature, whose third parameter is an options object. Any mechanical rewrite would change what the surrounding code receives, so the conversion is left to the author.
