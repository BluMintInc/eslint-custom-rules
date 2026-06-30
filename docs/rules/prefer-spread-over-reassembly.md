# Prefer spread syntax over destructure-then-reassemble when all destructured fields are forwarded identically to a single target (`@blumintinc/blumint/prefer-spread-over-reassembly`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

When a function destructures its single object parameter into named fields and then forwards all those fields identically to a single target (a JSX element or an object literal), the destructure-then-reassemble pattern is an antipattern. It requires manual updates in two places every time the type evolves, and silently drops any new fields added to the source type.

Using spread syntax (`{...props}`) expresses the forwarding intent directly: new fields propagate automatically, the code is shorter, and the change surface shrinks to a single location.

The rule only fires when **all** of the following hold:

- The function has exactly one parameter that is a plain object destructuring.
- The destructured parameter has no rest element (`...rest`), no renamed bindings (`{ a: b }`), no default values, and no nested patterns.
- All destructured fields are forwarded with identical key names to a **single** target JSX element or object literal.
- No destructured field is used anywhere else in the function body (conditional logic, side effects, transformations, etc.).

The autofix:

1. Replaces the destructured parameter with a single identifier (`props`, or a fresh non-colliding name).
2. Replaces the identically-forwarded fields in the target with a spread (`{...props}`).
3. Places the spread **first**, then any additional (non-destructured) props after it, so explicit overrides are preserved and remain effective.

### ❌ Incorrect

```tsx
const GameCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, onGameSelect }) => {
    return (
      <GameDropdownSearch
        hits={hits}
        isLoading={isLoading}
        onGameSelect={onGameSelect}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
```

```tsx
const ChannelManagerCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, header }) => {
    return (
      <UserVerticalCarousel
        ContentCard={UserCardAddWithMaxMembers}
        header={header}
        hits={hits}
        isLoading={isLoading}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
```

### ✅ Correct

```tsx
const GameCatalogWrapperStable = memo(
  (props) => <GameDropdownSearch {...props} />,
  compareDeeply('hits'),
);
```

```tsx
const ChannelManagerCatalogWrapperStable = memo(
  (props) => (
    <UserVerticalCarousel
      {...props}
      ContentCard={UserCardAddWithMaxMembers}
    />
  ),
  compareDeeply('hits'),
);
```

```tsx
// Valid — `isLoading` is used for conditional logic, not just forwarded.
const Wrapper = ({ hits, isLoading, onNearEnd }) => {
  if (isLoading) {
    return <Spinner />;
  }
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
};
```

## Options

```javascript
{
  '@blumintinc/blumint/prefer-spread-over-reassembly': [
    'error',
    {
      minFields: 2, // Minimum number of identically-forwarded fields to trigger (default: 2)
    }
  ]
}
```

### `minFields` (default: `2`)

The minimum number of identically-forwarded fields required to trigger the rule. Increase this to suppress the rule for small objects.

## When Not To Use It

Disable this rule if your codebase intentionally uses explicit prop forwarding for documentation or if you rely on TypeScript strictness to catch missing props at call sites.
