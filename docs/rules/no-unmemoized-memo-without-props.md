# Prevent wrapping prop-less Unmemoized components in memo since memo provides no benefit without props and adds unnecessary indirection (`@blumintinc/blumint/no-unmemoized-memo-without-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

`memo` skips a re-render only when the incoming props compare equal to the previous ones. A component that takes no props has nothing to compare, so `memo` never skips anything: the wrapper buys no performance and costs a second binding, a duplicate name, and an extra hop for anyone reading the file.

BluMint's convention pairs an implementation named `XUnmemoized` with `export const X = memo(XUnmemoized)`. This rule reports that pairing when `XUnmemoized` takes no props, and asks for a single function named `X` instead.

## Rule Details

A report requires all of the following:

- The file is a `.tsx` or `.jsx` file. The rule does no work in `.ts`/`.js` files, where there is no JSX component to memoize.
- The component's name ends in `Unmemoized`, its body returns JSX, and it is passed as the first argument of a `memo(...)` call. `memo` is recognized as the named `memo` export of `react` or of a `util/memo` module (under any local alias), the default export of a `util/memo` module, or a `memo` member access on a default or namespace import of `react` (`React.memo`). A `memo` imported from anywhere else is a different function and is ignored.
- The component takes no props.

"Returns JSX" is read the same way whichever way the body is spelled: a concise
arrow body and the `return` of a block body are the same value. A function is
not a JSX value, so a curried `XUnmemoized = () => () => <span />` returns a
render function rather than an element, is not a props-less component, and is
not reported — the same verdict the block-bodied `() => { return () => <span />; }`
has always received.

"No props" means the parameter list is empty, or it is a single parameter that is provably empty: an empty destructure (`({})`, or `({} = {})`), a parameter annotated with an empty type literal (`{}`), or a parameter annotated with a type alias or interface declared in the same file whose body is empty. Anything else counts as props — several parameters, a rest parameter, a rest property, an untyped identifier parameter, a non-empty inline type, or a type name the rule cannot see the definition of. When in doubt the rule stays silent, because a false positive here asks a developer to delete a memo that is doing real work.

### Examples of incorrect code

```tsx
import { memo } from 'react';

function BracketAdUnmemoized() {
  return <div>Ad</div>;
}

export const BracketAd = memo(BracketAdUnmemoized);
```

```tsx
import { memo } from 'src/util/memo';

export const SimpleUnmemoized = () => <span>text</span>;
export const Simple = memo(SimpleUnmemoized);
```

```tsx
import { memo } from 'react';

// An empty destructure is not a prop
function EmptyDestructureUnmemoized({}) {
  return <div />;
}

export const EmptyDestructure = memo(EmptyDestructureUnmemoized);
```

```tsx
import { memo } from 'react';

// A props type declared empty in this file is not a prop either
interface EmptyProps {}

const EmptyObjectPatternUnmemoized = ({}: EmptyProps) => <div />;
export const EmptyObjectPattern = memo(EmptyObjectPatternUnmemoized);
```

```tsx
import React from 'react';

const AliasedMemoUnmemoized = () => <div />;
export const AliasedMemo = React.memo(AliasedMemoUnmemoized);
```

### Examples of correct code

```tsx
// The fix: one function, one name, no wrapper
export function BracketAd() {
  return <div>Ad</div>;
}
```

```tsx
import { memo } from 'src/util/memo';

type Props = { title: string };

export function BannerUnmemoized({ title }: Props) {
  return <div>{title}</div>;
}

export const Banner = memo(BannerUnmemoized);
```

```tsx
import { memo } from 'react';

// A rest property means props the rule cannot enumerate
function WithRestUnmemoized({ heading, ...rest }) {
  return <div {...rest}>{heading}</div>;
}

export const WithRest = memo(WithRestUnmemoized);
```

```tsx
import { memo } from 'react';

// An inline non-empty type is props
const WithPropsUnmemoized = ({ id }: { id: string }) => <div>{id}</div>;
export const WithProps = memo(WithPropsUnmemoized);
```

```tsx
import { memo } from 'react';

// The rule governs the `Unmemoized`/`memo` pairing only, so a component that
// does not follow that naming convention is out of scope
function NotFollowingPattern() {
  return <div />;
}

export const StillMemoized = memo(NotFollowingPattern);
```

```tsx
import { memo } from 'different-memo';

// `memo` from an unrelated module is a different function
function ThirdPartyUnmemoized() {
  return <div />;
}

export const ThirdParty = memo(ThirdPartyUnmemoized);
```

## Options

This rule accepts an options object with the following properties:

- `ignoreHooks` (`string[]`, default `[]`) — hook names that exempt a component. A component whose body calls one of these hooks is not flagged.
- `ignoreHocs` (`string[]`, default `[]`) — higher-order-component names. A component wrapped by one of these HOCs is not flagged.

`ignoreHooks` exists for components that take no props but still re-render for a reason `memo` can short-circuit — a theme or context consumer, for example. Naming the hook keeps the wrapper.

### Examples of correct code with `ignoreHooks`

```tsx
// eslint-options: {"ignoreHooks": ["useTheme"]}
import { memo } from 'react';
import { useTheme } from '@mui/material/styles';

function ThemeConsumerUnmemoized() {
  const theme = useTheme();
  return <div>{theme.palette.mode}</div>;
}

export const ThemeConsumer = memo(ThemeConsumerUnmemoized);
```

The hook may be called anywhere in the component body, including inside a nested callback, and may be spelled as a member access (`Namespace.useTheme`).

## When Not To Use It

Disable this rule if your codebase does not use the `Unmemoized` naming convention, or if you intentionally memoize prop-less components to keep a uniform export shape.
