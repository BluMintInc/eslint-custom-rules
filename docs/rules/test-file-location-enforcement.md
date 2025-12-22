# Enforce colocating *.test.ts(x) files with the code they cover (`@blumintinc/blumint/test-file-location-enforcement`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why this rule exists

Scattering tests into separate `tests/` directories hides which code they protect and makes refactors brittle. When a test file is not colocated with its subject, engineers and AI tools miss it during moves or renames, leaving features untested. Keeping `.test.ts(x)` files beside the implementation ensures refactors move code and coverage together and makes it obvious which behaviors are exercised.

## What the rule checks

- Looks at files named `*.test.ts` or `*.test.tsx`
- Verifies a sibling implementation file with the same basename exists in the same directory with one of: `.ts`, `.tsx`, `.js`, `.jsx`
- Skips any file under `node_modules`
- Reports a violation when no colocated sibling implementation is found (no auto-fix provided)

## Examples

### ❌ Incorrect

```text
/functions/tests/X.test.ts      // Implementation lives in /functions/src/util/X.ts
/components/tests/Button.test.tsx  // No Button.tsx next to the test
/shared/utils/value.test.ts     // Only value.d.ts exists in this folder
```

### ✅ Correct

```text
/functions/src/util/X.ts
/functions/src/util/X.test.ts

/components/Button.tsx
/components/Button.test.tsx

/shared/helpers/slugify.js
/shared/helpers/slugify.test.ts
```

## Options

This rule has no options.
