# Enforce colocating *.test.ts or *.test.tsx files with the code they cover (`@blumintinc/blumint/test-file-location-enforcement`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why this rule exists

Scattering tests into separate `tests/` directories hides which code they protect and makes refactors brittle. When a test file is not colocated with its subject, engineers and AI tools miss it during moves or renames, leaving features untested. Keeping `*.test.ts` or `*.test.tsx` files beside the implementation ensures refactors move code and coverage together and makes it obvious which behaviors are exercised.

## What the rule checks

- Looks at files named `*.test.ts` or `*.test.tsx`
- Verifies a sibling implementation file with the same basename exists in the same directory with one of: `.ts`, `.tsx`, `.js`, `.jsx`
- Accepts the suite-qualifier convention: when the full basename has no sibling, each shorter dot-prefix is tried, so `Subject.qualifier.test.tsx` resolves to `Subject.tsx` in the same directory (see below)
- Skips any file under `node_modules`
- Reports a violation when no colocated sibling implementation is found (no auto-fix provided)

## Suite qualifiers

A large suite is often split by concern into several files that all cover one subject:

```text
src/hooks/guard/useGuardFlow.ts
src/hooks/guard/useGuardFlow.test.tsx
src/hooks/guard/useGuardFlow.onClose.test.tsx
src/hooks/guard/useGuardFlow.ownerToken.test.tsx
```

These are colocated, so the rule accepts them. The basename is matched by dropping trailing dot-segments one at a time — `useGuardFlow.onClose` first, then `useGuardFlow` — which handles qualifiers of any depth (`Subject.a.b.test.ts` matches `Subject.a.ts` or `Subject.ts`).

Only qualifiers are stripped, never directory segments, so a test that has drifted away from its subject still reports. `web/tests/Detached.qualifier.test.tsx` is a violation even when `web/src/Detached.tsx` exists.

## Options

This rule accepts an options object with the following property:

### `additionalSubjectExtensions`

- Type: `string[]`
- Default: `[]`

Registers extra file extensions that count as a valid subject when they sit next to the test with the same basename. Use this when a jest test covers a sibling artifact written in another language — a jq filter, a shell script, a YAML fixture — instead of a JavaScript/TypeScript module. Each entry is normalized to include a leading dot, so both `jq` and `.jq` are accepted. The built-in `.ts`, `.tsx`, `.js`, and `.jsx` extensions are always honored regardless of this option.

```js
{
  '@blumintinc/blumint/test-file-location-enforcement': [
    'error',
    { additionalSubjectExtensions: ['.jq', '.sh'] },
  ],
}
```

With the configuration above, `scripts/pr-check-comments.test.ts` is valid when it sits beside `scripts/pr-check-comments.jq`, and `scripts/deploy.test.ts` is valid beside `scripts/deploy.sh`.

## Examples

### ❌ Incorrect

```text
/functions/tests/X.test.ts      // Implementation lives in /functions/src/util/X.ts
/components/tests/Button.test.tsx  // No Button.tsx next to the test
/shared/utils/value.test.ts     // Only value.d.ts exists in this folder
/components/Orphan.qualifier.test.tsx  // Neither Orphan.qualifier.tsx nor Orphan.tsx is here
```

### ✅ Correct

```text
/functions/src/util/X.ts
/functions/src/util/X.test.ts

/components/Button.tsx
/components/Button.test.tsx

/shared/helpers/slugify.js
/shared/helpers/slugify.test.ts

/components/tournaments/HeadsUpMatchDisplay.tsx
/components/tournaments/HeadsUpMatchDisplay.test.tsx
/components/tournaments/HeadsUpMatchDisplay.danglingOverride.test.tsx
```
