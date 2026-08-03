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

The fix splices out only the forwarded fields, so every retained prop keeps its original text, its line, and the comments attached to it. A directive such as `// eslint-disable-next-line no-console` sitting above a prop the fix keeps therefore stays attached to that prop, and cannot be silently discarded (which would re-enable the rule it suppresses). Comments attached to a field that the spread absorbs are removed along with that field, since the code they annotate no longer exists.

The parameter's type annotation is preserved verbatim, so `({ hits, isLoading }: ChildProps)` becomes `(props: ChildProps)` — generics, unions, imported aliases, and multi-line object types all survive the fix unchanged.

A parameter with a default value (`({ a, b }: FooProps = {} as FooProps)`) is never reported: spreading over a defaulted destructuring changes which value the default applies to, so the rule leaves that shape alone.

Type-only wrappers on the target — `as const`, `satisfies T`, `as T`, `!`, and chains of them such as `as unknown as T` — are stripped before the target is classified. They compile away entirely, so a wrapped reassembly is the same reassembly; the autofix rewrites the literal in place and leaves the wrapper exactly as written.

### Narrowing picks are never reported

A destructuring that deliberately takes a **subset** of a wider source type is left alone, because spreading the parameter would put every omitted member back on the result. The pick exists precisely so that those members do not flow through, so the rewrite changes what the function produces — for an object literal it adds keys, and for a JSX element it forwards props the child never asked for. The same protection covers both target kinds.

The subset relation is established from syntax alone, without type information, so the rule stays silent only where the widening is demonstrable. Two shapes are read:

- **The parameter's own annotation** — `({ path, body }: Unit)` or an inline `({ path, body }: { path: string; body: string; findings: unknown[] })`.
- **The element type of an array method's receiver** — the callback of `.map()`, `.forEach()`, `.filter()` or `.flatMap()` whose receiver resolves to something annotated `Unit[]`, `readonly Unit[]`, `Array<Unit>` or `ReadonlyArray<Unit>`. The receiver is traced through `const` initializers, annotated bindings (an annotation holds on a `let` too, since it constrains every assignment), `as` assertions, `await`, and the declared return type of a local function.

The referenced type must be a plain, fully written-out member list declared in the same file. A union, an intersection, a mapped or conditional type, a generic instantiation, an interface with an `extends` clause, an index signature and an imported alias all describe a member set assembled elsewhere, so none of them proves anything: those keep reporting, exactly as before. So does a member set that matches the pick **exactly** — that reassembly is exhaustive, and the spread rewrite is behavior-preserving.

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

```tsx
const Bar = ({ a, b }: FooProps) => {
  return <Foo a={a} b={b} />;
};
```

```ts
// An `as const` on the reassembled literal changes nothing at runtime.
const toPreviews = (subgroups) => {
  return subgroups.map(({ username, id }) => {
    return { username, id } as const;
  });
};
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
// The type annotation survives the autofix.
const Bar = (props: FooProps) => {
  return <Foo {...props} />;
};
```

```ts
// The wrapper survives the autofix; only the reassembly collapses.
const toPreviews = (subgroups) => {
  return subgroups.map((props) => {
    return { ...props } as const;
  });
};
```

```ts
// Valid — a narrowing projection drops `c`, so spread would smuggle it back in.
const pick = ({ a, b, c }) => {
  return { a, b } as const;
};
```

```ts
// Valid — `Unit` declares five members and the callback picks four, so the
// spread rewrite would put `findings` on every payload.
type Unit = {
  path: string;
  line: number;
  side: string;
  body: string;
  findings: unknown[];
};
const toComments = (units: Unit[]) => {
  return units.map(({ path, line, side, body }) => {
    return { path, line, side, body } as const;
  });
};
```

```tsx
// Valid — the JSX target narrows too: `Wide` has a third member the child
// must not receive.
type Wide = { a: string; b: string; c: string };
const Narrowed = ({ a, b }: Wide) => <Child a={a} b={b} />;
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
