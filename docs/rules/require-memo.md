# React components must be memoized (`@blumintinc/blumint/require-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces memoizing React components that render JSX using our custom `memo` helper. The rule supports both absolute imports (`src/util/memo`) and relative imports (for example, `../util/memo`) based on the file location. Components suffixed with `Unmemoized` are treated as intentional opt-outs.

## Rule Details

Components that render JSX and receive props must be wrapped with `memo` from `util/memo`. Without memoization the component function is recreated on every parent render, which breaks referential equality, forces avoidable child re-renders, and invalidates memoized callbacks or selectors. If a component must stay unmemoized, suffix its name with `Unmemoized` to opt out explicitly.


### Why this rule exists
- Preserves stable component identities so downstream memoized children do not rerender unnecessarily.
- Keeps prop-derived callbacks and selectors referentially consistent across renders.
- Forces intentional opt-out (`Unmemoized`) to document when a component should remain un-memoized.

### Examples of **incorrect** code

```jsx
const Component = ({ foo, bar }) => {
  return <SomeOtherComponent foo={foo} bar={bar} />;
};
```

```jsx
function ProfileCard({ user }) {
  return <UserAvatar {...user} />;
}
```

### Examples of **correct** code

```jsx
import { memo } from 'src/util/memo';

const Component = memo(function ComponentUnmemoized({ foo, bar }) {
  return <SomeOtherComponent foo={foo} bar={bar} />;
});
```

```jsx
const ProfileCardUnmemoized = ({ user }) => {
  return <UserAvatar {...user} />;
};
```

