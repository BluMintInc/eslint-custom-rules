# Suggest compareDeeply for memoized components that receive object/array props to avoid shallow comparison re-renders (`@blumintinc/blumint/memo-compare-deeply-complex-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Rule Details

- **Why**: `React.memo` performs a shallow prop comparison. Object and array props often receive new references on every render, so shallow comparison re-renders the component even when the data did not change. Using `compareDeeply(...)` from `src/util/memo` keeps memoization effective by comparing prop values instead of references.
- **What it checks**: Memoized components (`React.memo` or `memo` from `src/util/memo`) that lack a custom comparison function and have props typed as objects or arrays.
- **How to fix**: Pass `compareDeeply('propName')` (listing each complex prop) as the second argument to `memo`, and ensure it is imported from `src/util/memo`.

The rule ignores components that already provide a comparison function and skips the `children` prop to avoid noisy signals on intentionally dynamic children.

## Examples

### Examples of incorrect code

Memoized with shallow comparison on an object prop.

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

### Examples of correct code

Deep-compare the object prop so memoization stays effective.

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

Props inherited from a third-party type are not reported — only the props the component's own code declares.

```tsx
import { memo } from 'src/util/memo';
import type { TypographyProps } from '@mui/material';

type Props = TypographyProps & { title: string };

const Heading = ({ title }: Props) => <h1>{title}</h1>;

export const HeadingMemo = memo(Heading); // ✅ MUI's ~110 inherited props are not demanded
```

An open-ended literal union (`primitive & {}`) is a primitive at runtime, so it is not reported.

```tsx
import { memo } from 'src/util/memo';

// The shape of React's own `AriaRole`, spelled out here rather than imported.
type AriaRole = 'alert' | 'alertdialog' | 'button' | (string & {});
type Props = { role?: AriaRole; kind?: 'alert' | 'button' | (string & {}) };

const Banner = ({ role, kind }: Props) => <div role={role}>{kind}</div>;

export const BannerMemo = memo(Banner); // ✅ neither prop needs compareDeeply
```

## Edge Cases

- Already supplying a comparison function (including `compareDeeply`) — rule does not report.
- Props that are only primitives or callbacks — rule does not report because shallow comparison is sufficient.
- `children` prop — ignored to avoid warnings on intentionally dynamic children.
- Higher-order wrappers (e.g., `memo(forwardRef(...))`, `memo(connect(...)(Component))`) are analyzed; the comparator is added after the wrapped expression.
- Immutable data structures — still reported; add an inline disable if deep comparison is not desired for that component.
- React render types (`ReactNode`, `ReactElement`, `ComponentType`, `FC`, render-prop functions) and DOM element types (`HTMLElement | null` anchors, containers) — not reported; they are stable references, and deep-comparing a DOM node walks React's circular fiber back-references.
- Reserved React slots (`ref`, `key`) — skipped, because React strips them before the memo equality function runs.
- Props declared by a dependency — not reported. TypeScript surfaces inherited members, so a props type that extends or intersects a library interface (MUI's `TypographyProps`, React's `HTMLAttributes`) exposes that library's entire surface, and demanding all of it produces lists past a hundred names for props the component neither declares nor receives. A prop is kept only when at least one of its declaration sites is authored code — i.e. not a declaration file and not under `node_modules`. A prop with no declaration site at all is classified instead by the type that carries it, found by decomposing intersections and generic wrappers. Consequences worth knowing:
  - A prop the author redeclares alongside the library's own (`LibProps & { classes: { root: string } }`) carries both declaration sites and is still reported.
  - A base type the author owns in a plain `.ts` module is authored code, so its complex members are still reported; the gate is the declaration file, not "the prop came from another module".
  - `Pick`/`Omit`/`Readonly` over a type carry the source declarations through, so a mapped type over the author's own props is still reported while one over a library type is not.
  - A keyed mapped type (`{ [K in SomeKeys]?: … }`, the shape MUI's `SystemProps<Theme>` gives every `Box`-derived component) declares no member symbols at all, whoever wrote it, so ownership follows the carrier: the library's ~100 style shorthands (`bgcolor`, `border*`, `display`) are not reported, while the author's own `{ [K in Keys]: { label: string } }` is — including when a dependency's `Readonly<…>` wraps it.
  - There is no option to opt back in. Naming a library's inherited props is a remedy nobody can act on, and `blumintAreEqual` already deep-compares `sx` / `style` unconditionally, which covers the library props that actually change by value.
- `sx` / `*Sx` / `style` / `*Style` — skipped when `memo` comes from `src/util/memo`, since `blumintAreEqual` already deep-compares them.
- Intersections carrying a primitive member — not reported. A value of `string & X` is still assignable to `string`, so it is a primitive at runtime whatever `X` is. This covers both the open-ended literal union idiom (`'alert' | (string & {})`, of which React's `AriaRole` is the most widespread instance) and branded primitives (`string & { readonly __brand: 'UserId' }`). `compareDeeply` on such a prop would be dead code: `blumintAreEqual` only reaches deep equality behind a `typeof value === 'object'` guard, and deep equality on two primitives is `===` anyway. The exemption keys on the primitive member rather than on the object member being empty, so every spelling of the widener (`{}`, `Record<never, never>`, `Record<string, never>`) is covered. An intersection with no primitive member (`{ a: string } & { b: number }`) is still reported, as is an array of an exempt type (`('alert' | (string & {}))[]`).

## Version

- Introduced in v1.12.6
