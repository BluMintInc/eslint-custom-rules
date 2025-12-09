# Enforce using util/ instead of utils/ directory (`@blumintinc/blumint/avoid-utils-directory`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule exists

Generic `utils/` directories attract unrelated helpers, which turns them into dumping grounds with unclear ownership. When utilities pile up behind a vague folder name, teammates and AI agents struggle to discover the right helper, duplicate logic, or keep track of who maintains which file. Using a singular `util/` directory encourages purpose-specific utilities—callers can infer responsibility from the path and know where to add related helpers.

## What the rule checks

- Flags files that live in a `utils/` directory (case-insensitive)
- Skips files inside `node_modules`
- Does not flag names where `utils` is part of another word (for example `myutils/`)
- No auto-fix is supplied because directory renames and import updates need manual review

## Examples

### ❌ Incorrect

```
/src/utils/helper.ts
/src/components/utils/format.ts
/src/Utils/math.ts
```

### ✅ Correct

```
/src/util/helper.ts
/src/components/util/date/format.ts
/src/util/string/capitalize.ts
```

## Options

This rule has no options.
