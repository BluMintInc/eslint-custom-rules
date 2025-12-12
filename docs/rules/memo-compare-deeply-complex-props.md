# Suggest compareDeeply for memoized components that receive object/array props so memo does not shallow-compare unstable references (`@blumintinc/blumint/memo-compare-deeply-complex-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting). Configure `parserOptions.project` so the rule can inspect prop types.

<!-- end auto-generated rule header -->

## Rule Details

- **Why**: `React.memo` performs a shallow prop comparison. Object and array props often receive new references on every render, so shallow comparison re-renders the component even when the data did not change. Using `compareDeeply(...)` from `src/util/memo` keeps memoization effective by comparing prop values instead of references.
- **What it checks**: Memoized components (`React.memo` or `memo` from `src/util/memo`) that lack a custom comparison function and have props typed as objects or arrays.
- **How to fix**: Pass `compareDeeply('propName')` (listing each complex prop) as the second argument to `memo`, and ensure it is imported from `src/util/memo`.

The rule ignores components that already provide a comparison function and skips the `children` prop to avoid noisy signals on intentionally dynamic children.

## Examples

Bad: memoized with shallow comparison on an object prop.

```tsx
import React, { memo } from 'react';

type UserSettings = { theme: string; preferences: string[] };
type Props = { userId: string; userSettings: UserSettings };

const UserProfileCard: React.FC<Props> = ({ userId, userSettings }) => (
  <div>
    <p>{userId}</p>
    <p>{userSettings.theme}</p>
  </div>
);

export const UserProfileCardMemo = memo(UserProfileCard); // 🔴 shallow compare re-renders on every new object reference
```

Good: deep-compare the object prop so memoization stays effective.

```tsx
import { memo, compareDeeply } from 'src/util/memo';

type UserSettings = { theme: string; preferences: string[] };
type Props = { userId: string; userSettings: UserSettings };

const UserProfileCard: React.FC<Props> = ({ userId, userSettings }) => (
  <div>
    <p>{userId}</p>
    <p>{userSettings.theme}</p>
  </div>
);

export const UserProfileCardMemo = memo(
  UserProfileCard,
  compareDeeply('userSettings'),
);
```

## Edge Cases

- Already supplying a comparison function (including `compareDeeply`) — rule does not report.
- Props that are only primitives or callbacks — rule does not report because shallow comparison is sufficient.
- `children` prop — ignored to avoid warnings on intentionally dynamic children.
- Higher-order wrappers (e.g., `memo(forwardRef(...))`, `memo(connect(...)(Component))`) are analyzed; the comparator is added after the wrapped expression.
- Immutable data structures — still reported; add an inline disable if deep comparison is not desired for that component.

## Version

- Introduced in v1.12.6
