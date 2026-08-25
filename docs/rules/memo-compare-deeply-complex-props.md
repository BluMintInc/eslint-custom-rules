# Suggest compareDeeply for memoized components that receive object/array props to avoid shallow comparison re-renders (`@blumintinc/blumint/memo-compare-deeply-complex-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Rule Details

- **Why**: `React.memo` performs a shallow prop comparison. Object and array props often receive new references on every render, so shallow comparison re-renders the component even when the data did not change. Using `compareDeeply(...)` from `src/util/memo` keeps memoization effective by comparing prop values instead of references.
- **What it checks**: Memoized components (`React.memo` or `memo` from `src/util/memo`) that lack a custom comparison function and have props typed as objects or arrays.
- **How to fix**: Pass `compareDeeply('propName')` (listing each complex prop) as the second argument to `memo`, and ensure it is imported from `src/util/memo`.

The rule ignores components that already provide a comparison function and skips the `children` prop to avoid noisy signals on intentionally dynamic children. It also skips props whose deep comparison could not answer anything — React render types, DOM nodes and error instances — since none of those is a plain-data shape.

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

Error props are not reported. An error instance has no enumerable own properties,
so a deep comparison of two distinct errors reports them equal and would suppress
the re-render that carries a fresh failure.

```tsx
import { memo } from 'src/util/memo';

type Props = { err: Error | null; statusCode: number };

const ErrorPageContent = ({ err, statusCode }: Props) => (
  <div>
    <p>{statusCode}</p>
    <p>{err ? err.message : 'no error'}</p>
  </div>
);

export const ErrorPageContentMemo = memo(ErrorPageContent); // ✅ `err` is not demanded
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

## Options

```js
'@blumintinc/blumint/memo-compare-deeply-complex-props': ['error', {
  // Column the autofix wraps the emitted memo() call at
  printWidth: 80,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix wraps at, matching Prettier's option of the same name.
Set it to your formatter's `printWidth` so the fixed source is already in the
shape the formatter would produce; a lint run carrying `--fix` otherwise leaves
the tree failing `prettier --check`.

## Autofix

The fixer adds `compareDeeply('propName', ...)` as `memo`'s second argument,
importing `compareDeeply` from `src/util/memo` (merging into an existing import
from that module when there is one).

### Line width

The comparator's text is not bounded: its length grows with the component's
complex-prop count and with each prop's name, so a four-prop component turns a
25-column `export const M = memo(C);` into a 97-column line. The fixer therefore
simulates each emission — the line it lands on, the text it inserts, and what
stays to its right — and breaks the argument list open only when that
measurement overflows [`printWidth`](#printwidth):

```tsx
export const M = memo(
  C,
  compareDeeply('activeChannel', 'metadata', 'participants', 'watchers'),
);
```

A prop list too long even on a line of its own breaks one prop per line, which
is the next shape a formatter takes it to.

Wrapping is not the safe default here. An argument list a formatter judges short
enough is collapsed back onto one line — unlike an object literal, whose
expansion a formatter preserves — so blanket wrapping would trade an over-width
line on long prop lists for a needlessly split one on every short call. The
measurement is what keeps both directions correct.

A trailing comment on the line is left out of the measurement, so the layout the
fixer emits is a function of the code alone. That also tracks the common case: a
formatter counts a trailing block comment toward the line but emits a trailing
line comment as a suffix that never forces a break.

An inline component the formatter *hugs* is a special case in the other
direction. A formatter groups a first argument that is a `function` expression
or a block-bodied arrow — it keeps the header on the call's line and prints the
comparator after the closing brace — so the inline form is already the
formatter's own output and the fixer emits it:

```tsx
export const Wrapped = memo((props: Props) => {
  return <div>{props.activeChannelData.id}</div>;
}, compareDeeply('activeChannelData', 'metadataRecords', 'participantsCollection'));
```

The two hugged spellings part company once that closing line itself overflows:
the formatter leaves the arrow's long, but breaks the comparator's own argument
list for a `function` expression. The fixer emits each shape as measured, since
writing either one for both is churn in one direction or the other:

```tsx
export const Wrapped = memo(function Impl(props: Props) {
  return <div>{props.activeChannelData.id}</div>;
}, compareDeeply(
  'activeChannelData',
  'metadataRecords',
  'participantsCollection',
));
```

A **concise-bodied** arrow is *not* grouped, so adding the comparator withdraws
the hug and the formatter prints one argument per line. The component moves one
nesting step in — a uniform shift of every line it owns, which keeps its
interior aligned:

```tsx
export const WrappedInline = memo(
  ({ beta, alpha }: Props) => (
    <section>
      {beta.value}
      {alpha.value}
    </section>
  ),
  compareDeeply('alpha', 'beta'),
);
```

Prop names are quoted the way a formatter quotes them: the quote needing fewer
escapes wins, so a prop containing an apostrophe is emitted double-quoted even
under `singleQuote`.

Whitespace inside a template literal is *data*, not layout, so lines inside a
multi-line template are left exactly where they are while everything around them
shifts — which is what a formatter does with them too.

**The fix is declined (report only) rather than written over the width** when the
emitted shape cannot be reproduced faithfully: a comment inside the argument list
(rebuilding the list would drop it), or a component argument too long to sit on
its own line. Emitting a shape a formatter would rewrite is what the decline
avoids, so the report stands on its own and the source is left untouched.

## Edge Cases

- Already supplying a comparison function (including `compareDeeply`) — rule does not report.
- Props that are only primitives or callbacks — rule does not report because shallow comparison is sufficient.
- `children` prop — ignored to avoid warnings on intentionally dynamic children.
- Higher-order wrappers (e.g., `memo(forwardRef(...))`, `memo(connect(...)(Component))`) are analyzed; the comparator is added after the wrapped expression.
- Immutable data structures — still reported; add an inline disable if deep comparison is not desired for that component.
- React render types (`ReactNode`, `ReactElement`, `ComponentType`, `FC`, render-prop functions) and DOM element types (`HTMLElement | null` anchors, containers) — not reported; they are stable references, and deep-comparing a DOM node walks React's circular fiber back-references.
- Error props (`Error`, `TypeError`, `NodeJS.ErrnoException`, an authored `class AppError extends Error`, and arrays/tuples of those) — not reported. An error instance exposes no enumerable own properties: `name`, `message` and `stack` are all non-enumerable, so `fast-deep-equal` — and every structural comparison like it — rates any two same-class errors equal whatever they report. `compareDeeply('err')` would therefore swallow the re-render that carries a *fresh* failure, and on a path where the error object's identity is the semantic signal (an error page staying mounted while a second route fails) that suppressed render is a correctness bug rather than a saved render. Deep comparison is demanded only for plain-data shapes where structural equality is semantically valid. Consequences worth knowing:
  - Because the prop never enters the report, the autofix cannot re-insert `compareDeeply('err')` either. A deliberate removal is stable, with no `eslint-disable` comment needed to hold it.
  - The exemption is decided by the type's heritage, so a project-authored type that merely reuses the name (`type Error = { field: string }`) is still reported — as is an error-*shaped* plain object (`{ message: string }`), whose `message` is an enumerable own property a deep comparison can read.
  - A union carries the exemption only when every non-nullish member is an error, so `Error | null` is exempt while `Error | { theme: string }` is still reported.
  - An error prop sitting beside a genuine data prop narrows the report rather than silencing it: `{ err: Error; settings: { theme: string } }` still demands `compareDeeply('settings')`.
  - Where the checker cannot resolve the annotation at all (an unresolvable import, an absent lib), the written name decides: a type reference whose rightmost name ends in `Error` or `Exception` is treated as one. That fallback applies *only* to an unresolved annotation — a resolvable `ValidationError` is answered by its heritage and keeps its report.
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
