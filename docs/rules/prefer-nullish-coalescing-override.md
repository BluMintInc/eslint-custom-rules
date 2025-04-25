# prefer-nullish-coalescing-override

> Enforce using nullish coalescing operator instead of logical OR operator, but only when appropriate

## Rule Details

This rule overrides the behavior of `@typescript-eslint/prefer-nullish-coalescing` to only suggest using the nullish coalescing operator (`??`) when checking for null/undefined, not when intentionally checking for all falsy values.

The nullish coalescing operator (`??`) and logical OR operator (`||`) serve different purposes:
- `??` only checks for `null` or `undefined`
- `||` checks for any falsy value (`false`, `0`, `''`, `null`, `undefined`, `NaN`)

This rule recognizes contexts where the logical OR operator is intentionally used for its truthiness checking behavior and doesn't suggest replacing it with the nullish coalescing operator.

### ✅ Correct

```tsx
// Boolean contexts where truthiness matters
if (isMatchMember || isTournamentAdmin) {
  console.log("Has access");
}

// Conditional rendering in JSX where truthiness matters
{(isMatchMember || isTournamentAdmin) && <MatchLobbyIconButton />}

// Boolean logic operations
const canEdit = isOwner || hasEditPermission;

// Default values when falsy values should trigger the default
const displayName = username || 'Anonymous';

// Nullish coalescing for null/undefined checks
const value = maybeNull ?? defaultValue;
```

### ❌ Incorrect

This rule doesn't report any issues itself. It's meant to override the `@typescript-eslint/prefer-nullish-coalescing` rule by turning it off and providing more specific guidance.

## When Not To Use It

If you want to strictly enforce using the nullish coalescing operator in all cases, you should use the original `@typescript-eslint/prefer-nullish-coalescing` rule instead.

## Further Reading

- [TypeScript: Nullish Coalescing Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing)
- [MDN: Nullish coalescing operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator)
- [MDN: Logical OR operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
