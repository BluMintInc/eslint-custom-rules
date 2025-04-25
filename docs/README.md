# ESLint Rule: prefer-nullish-coalescing-override

## Problem Fixed

This rule fixes an issue with the `@typescript-eslint/prefer-nullish-coalescing` rule, which incorrectly flags logical OR (`||`) operators when they are intentionally used to check for truthiness rather than just nullish values.

## Solution

The solution involves:

1. Creating a custom rule `prefer-nullish-coalescing-override` that doesn't report any issues itself
2. Disabling the original `@typescript-eslint/prefer-nullish-coalescing` rule
3. Enabling our custom rule instead

This approach allows us to maintain the benefits of the TypeScript ESLint plugin while avoiding false positives in cases where the logical OR operator is intentionally used for its truthiness checking behavior.

## Implementation Details

The implementation:

1. Creates an empty rule that doesn't report any issues
2. Disables the original rule in the ESLint configuration
3. Provides comprehensive documentation explaining the difference between `||` and `??` operators

## Usage

The rule is automatically enabled in the recommended configuration:

```js
// .eslintrc.js
module.exports = {
  extends: ['plugin:@blumintinc/blumint/recommended'],
  // ...
}
```

This will disable the original `@typescript-eslint/prefer-nullish-coalescing` rule and enable our custom rule instead.

## Examples

### Valid Code Examples

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
