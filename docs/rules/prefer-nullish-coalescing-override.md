# Enforce using nullish coalescing operator instead of logical OR operator, but only when appropriate (`@blumintinc/blumint/prefer-nullish-coalescing-override`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> Enforce using nullish coalescing operator instead of logical OR operator, but only when appropriate

## Rule Details

`@typescript-eslint/prefer-nullish-coalescing` can flag every `||` fallback, even when the code intentionally treats all falsy values as “missing.” This override keeps the guidance but only applies it when a fallback is meant for `null` or `undefined`, avoiding false positives in boolean or truthiness-driven code paths.

Why this matters:
- `||` replaces empty strings, `0`, and `false` with the fallback, which hides legitimate values in user input, configuration, and feature flags.
- `??` keeps those falsy-but-valid values intact and only falls back when the value is actually `null` or `undefined`.
- By being conservative, this override preserves boolean logic that relies on truthiness while still nudging developers toward `??` when the intent is a nullish-only default.

### ✅ Correct

```tsx
// Nullish fallback keeps falsy-but-valid values intact
const port = config.port ?? 0;
const title = payload.title ?? '';

// Boolean logic where truthiness is intentional remains allowed
if (isMatchMember || isTournamentAdmin) {
  console.log('Has access');
}
const canEdit = isOwner || hasEditPermission;
```

### ❌ Incorrect

```tsx
// Using || hides valid falsy values such as 0
const port = config.port || 0;

// Empty strings get replaced even when they are meaningful
const title = payload.title || '(untitled)';
```

Use `??` when the fallback should only run for `null` or `undefined`:

```tsx
const port = config.port ?? 0;
const title = payload.title ?? '(untitled)';
```

## When Not To Use It

If you want to strictly enforce using the nullish coalescing operator in all cases, you should use the original `@typescript-eslint/prefer-nullish-coalescing` rule instead.

### Setup Example

```jsonc
{
  "rules": {
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@blumintinc/blumint/prefer-nullish-coalescing-override": "warn"
  }
}
```

## Further Reading

- [TypeScript: Nullish Coalescing Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing)
- [MDN: Nullish coalescing operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator)
- [MDN: Logical OR operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
