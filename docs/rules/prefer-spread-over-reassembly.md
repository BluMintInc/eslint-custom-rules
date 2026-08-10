# Prefer spread syntax over destructure-then-reassemble when all destructured fields are forwarded identically to a single target (`@blumintinc/blumint/prefer-spread-over-reassembly`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

When a function destructures its single object parameter into named fields and then forwards all those fields identically to a single target (a JSX element or an object literal), the destructure-then-reassemble pattern is an antipattern. It requires manual updates in two places every time the type evolves, and silently drops any new fields added to the source type.

Using spread syntax (`{...props}`) expresses the forwarding intent directly: new fields propagate automatically, the code is shorter, and the change surface shrinks to a single location.

All three function spellings are examined: an arrow function, a function expression, and a `function` **declaration**. A declaration is an ordinary way to write a component or a helper, and the reassembly it holds is the same reassembly — every condition and carve-out below is expressed over the parameter and the body, which each spelling carries identically. A body-less signature (a TypeScript overload, `declare function`) has nothing to read and is left alone.

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

The referenced type must be a plain, fully written-out member list, reached either directly or through one of the three **key-preserving type operators**: `Readonly<T>`, `Required<T>` and `Partial<T>`. Each of those rewrites the modifiers of every member and leaves the key set identical, so the member list is read straight through the wrapper — `Readonly<{ path: string; body: string; findings: unknown[] }>`, `Readonly<Unit>` where `Unit` is an alias or interface, and a nested `Readonly<Partial<Unit>>` all enumerate exactly what they wrap.

Within the file, the name is resolved **lexically**: it is looked up in every enclosing statement container — the module body, a function body, a bare block, a `namespace` body, a `switch` case, a class static block — innermost outward. A type declared beside the code that uses it therefore resolves at any nesting depth, and the nearest declaration shadows a same-named outer one. Type declarations hoist, so an alias written below its own reference resolves as well. A declaration in a **sibling** scope is not in scope at the reference and proves nothing, so the pick keeps reporting.

The declaration may live in the file itself or in a **relative sibling module**, since organising a module's types in a neighbouring `types.ts` is the ordinary layout. The cross-file lookup is deliberately narrow:

- **Relative specifiers only.** `./types`, `../types` and `./nested` (which resolves to `nested/index.ts`) are read; the search tries `<source>.ts`, `.tsx`, `.js`, `.jsx`, then `<source>/index.*`. A **bare package specifier** (`shared-types`, `@scope/types`) names a module whose location depends on resolution settings the rule does not read, so it proves nothing. A relative specifier that resolves to nothing on disk proves nothing either.
- **Named imports only.** `import type { Unit } from './types'`, `import { Unit } from './types'` and an import alias (`import type { Unit as U }`) all resolve. A namespace import is referenced as a qualified name (`Types.Unit`) and a default import carries no exported name, so neither resolves.
- **One hop only.** The sibling must spell `export type X = …` or `export interface X { … }` directly. A `export { X }` specifier, a re-export (`export { X } from './y'`), a barrel (`export * from './y'`) and a type in the sibling that is itself imported from a third module all stop the walk. Inside that one sibling, resolution is the same as in the file under lint: alias chains, key-preserving operators and the shadowing rule below all apply there.

Every other shape describes a member set assembled elsewhere and proves nothing, so it keeps reporting: a union, an intersection, a mapped or conditional type, an interface with an `extends` clause, an index signature, and any generic instantiation other than the three above. `Pick`, `Omit`, `Record`, `Exclude` and `Extract` are the notable exclusions — each rewrites the key set, and a wrong proof would silence a report the rule owes rather than merely fail to find one. A member set that matches the pick **exactly** keeps reporting too: that reassembly is exhaustive, so the spread rewrite is behavior-preserving.

A file that declares its own `Readonly`, `Required` or `Partial` — as a type alias, an interface, a class, an enum or an import of that name — is read as naming that declaration rather than the lib utility, so no unwrapping applies and the pick is treated as unprovable.

The protection covers a **partial** reassembly as well as a whole-object one: `({ number, headRefName, updatedAt }: LinkedPullRequest) => ({ number, state: 'OPEN', headRefName, updatedAt })` collapses only the three forwarded fields, and the omitted `closesIssue` would still arrive with the spread.

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

```tsx
// The `function` declaration spelling of the same reassembly.
export default function Wrapper({ hits, isLoading, onNearEnd }) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
}
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

```ts
// Valid — the pick is read through `Readonly`, which leaves the key set of the
// record it wraps identical, so `findings` is still proven absent from the pick.
type ReviewCommentUnit = Readonly<{
  path: string;
  line: number;
  side: string;
  body: string;
  findings: readonly unknown[];
}>;
const toComments = (units: readonly ReviewCommentUnit[]) => {
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

```tsx
// The declaration spelling after the autofix.
export default function Wrapper(props) {
  return <Child {...props} />;
}
```

```ts
// Valid — the narrowing-pick protection reads the declaration's annotation
// exactly as it reads an arrow's, so `c` still stops the report.
type Wide = { a: string; b: string; c: string };
function pick({ a, b }: Wide) {
  return { a, b };
}
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
