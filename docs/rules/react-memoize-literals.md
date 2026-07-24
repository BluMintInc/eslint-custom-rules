# Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

React re-runs your component and hook bodies on every render. Inline object, array, and function literals create fresh references each time, which breaks referential equality checks inside hooks, cache layers, and child components. This rule keeps those references stable by requiring literals in React components and hooks to be either memoized (via `useMemo`/`useCallback`) or hoisted to module-level constants. Direct top-level hook arguments remain allowed, but nested literals inside those arguments are flagged because they still change on every render.

## Rule Details

- Reports object, array, and inline function literals created inside React components or custom hooks.
- Flags nested literals inside hook argument objects/arrays (e.g., `useQuery({ options: { cache: {...} } })`) while allowing the top-level argument itself.
- Detects custom hooks that return object/array/function literals directly, since callers receive a fresh reference each render.
- Skips literals that are destined to be thrown (e.g., `throw { message: 'error' }` or a variable where every usage is in a `throw` statement), as throwing aborts the render cycle and referential stability is irrelevant.
- Skips a function literal passed directly as the callback to an Array iteration method (`map`, `filter`, `forEach`, `reduce`, `reduceRight`, `some`, `every`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flatMap`, `sort`), e.g. `items.map((item) => <li key={item}>{item}</li>)`. The callback is invoked synchronously during render and then discarded, so its identity is never observed by a hook, prop, effect, or memoized child — and the rule's advice is unfollowable there anyway (the callback closes over loop scope, so it can't be hoisted, and `useCallback` can't run inside a `.map` loop). An inline function passed as a JSX-attribute prop *inside* the callback body (e.g. `onClick={() => ...}` on a child) is a separate node whose identity is observed, so it remains reported.
- Skips literals already inside callbacks passed to stable hooks (`useMemo`, `useCallback`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useImperativeHandle`, `useState`, `useReducer`, `useRef`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`, `useId`, `useLatestCallback`, `useDeepCompareMemo`, `useDeepCompareCallback`, `useDeepCompareEffect`, `useProgressionCallback`) and module-level constants.
- Skips literals that resolve to a JSX attribute named `sx` or `style` (e.g. `<Stack sx={{ ... }} />`, `<div style={{ ... }} />`). The exemption follows the value through conditional branches (`sx={active ? { ... } : { ... }}`), logical fallbacks (`sx={active && { ... }}`), array entries (`sx={[{ ... }, { ... }]}`, supported by MUI), nested object property values (`sx={{ display: { xs: 'none', md: 'inline' } }}`, MUI's responsive breakpoint syntax), and `as const`/parenthesized wrappers. These style descriptors are consumed by the library without referential equality checks, so inlining them does not break memoization or trigger extra renders. Literals that are instead passed through a function call (`sx={makeSx({ ... })}`) or attached to a non-style prop remain reported, since those references can be observed or stored.
- Skips an object/array literal passed as a direct argument to a plain (non-member, non-hook) function call when the literal's identity provably cannot reach a memoization boundary. Two independent conditions qualify. First, the **call's result is consumed primitively** — a ternary/`if`/`while`/`for` test, a `!`, a comparison, a logical chain ending in one of those, or a variable whose every reference lands in such a position. Second, the **callee is locally declared and its return cannot carry the argument back**: its return type annotation or its return expressions are demonstrably primitive, or no return expression syntactically references a whole-parameter binding (a destructured parameter holds a *property* of the argument, so returning it never exposes the argument's own identity). Callees that are imported, unresolvable, reassigned after initialization, `async`, generators, or that return the parameter itself remain reported, as do member calls (`obj.method({ ... })`), whose receiver could retain the reference. A callee that returns a *fresh object* also stays reported: its result is genuinely unstable, and the argument report is the only signal the rule emits for that shape.
- Accounts for `async` function boundaries, skipping literals inside `async` function expressions or declarations. While the synchronous portion before the first `await` runs immediately, async functions are typically used as event handlers or effect callbacks where internal literal references do not affect render stability.
- Offers suggestions to wrap component-level literals in `useMemo`/`useCallback` for a stable reference and injects a `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder so callers must supply real dependencies instead of accidentally shipping an empty array.

### Examples of incorrect code

```tsx
function UserProfile({ userId }) {
  const userData = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    options: {
      staleTime: 5000,
      cacheOptions: { ttl: 60000 },
    },
  });

  const defaults = { enabled: true };
  return <ProfileDisplay data={userData} defaults={defaults} />;
}
```

```tsx
function useUserSettings() {
  return {
    theme: 'dark',
    onChange: () => updateTheme(),
  };
}
```

### Examples of correct code

These examples show how you keep references stable by memoizing values with the right dependencies (or hoisting constants).

```tsx
const EMPTY_RESULTS: string[] = [];

function UserProfile({ userId, locale }) {
  const queryFn = useCallback(() => fetchUser(userId), [userId]);
  const queryKey = useMemo(() => ['user', userId], [userId]);
  const options = useMemo(
    () => ({
      staleTime: 5000,
      cacheOptions: { ttl: 60000 },
      labels: buildLabels(locale),
    }),
    [locale],
  );

  const userData = useQuery({ queryKey, queryFn, options });
  const [searchResults] = useState(EMPTY_RESULTS);
  return <ProfileDisplay data={userData} results={searchResults} />;
}
```

```tsx
function useUserSettings() {
  const onChange = useCallback(() => updateTheme(), []);
  return useMemo(
    () => ({
      theme: 'dark',
      onChange,
    }),
    [onChange],
  );
}
```

```tsx
// Array iteration callbacks are invoked synchronously and discarded, so the
// inline map/filter callbacks are fine — no memoization needed.
function List({ items }) {
  return (
    <ul>
      {items
        .filter((item) => item.active)
        .map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
    </ul>
  );
}
```

```tsx
// A jest module factory builds a replacement module; React never renders it,
// and jest's out-of-scope-variable restriction forbids importing `useMemo`
// inside the factory. Literals defined anywhere inside a `jest.mock`,
// `jest.doMock`, or `jest.setMock` factory are exempt.
jest.mock('../../contexts/BracketSeedsContext', () => {
  return {
    useBracketSeeds: () => {
      return { rankedTeamIds: mockRankedTeamIds() };
    },
  };
});
```

```ts
// A `use*`/PascalCase key on an object assembled inside an anonymous factory
// callback names a member of the built value, not a render body, so it is not
// treated as a hook or component.
registerModule('some/module', () => {
  return {
    useThing: () => {
      return { value: compute() };
    },
  };
});
```

The second carve-out is deliberately narrow: it requires the enclosing function
to be an anonymous callback argument. A named hook factory such as
`export function createApi(client) { return { useUser: () => ({ … }) }; }`
returns a hook React really does render, so its unstable literal stays reported.

```tsx
// `isTeamMembershipMutable` is declared locally and returns a boolean, so the
// argument literal's identity can never reach the dependency array — only the
// boolean it produces does, and booleans are compared by value.
function isTeamMembershipMutable({ roundsStatus, isContinuousRegistration }) {
  return isTournamentPreMatch(roundsStatus) || !!isContinuousRegistration;
}

function useDepArray({ roundsStatus, isContinuousRegistration, matchId }) {
  const isSeedingMutable = isTeamMembershipMutable({
    roundsStatus,
    isContinuousRegistration,
  });
  return useDeepCompareMemo(
    () => ({ matchId, isSeedingMutable }),
    [matchId, isSeedingMutable],
  );
}
```

```tsx
// The same exemption reached from the call site instead: the result lands in a
// boolean-test position, so it cannot carry the argument's reference anywhere
// even though `checkAnything` is opaque.
function Component({ isOpen }) {
  return checkAnything({ isOpen }) ? <Open /> : <Closed />;
}
```

#### How the suggestion placeholder looks

When the rule suggests a fix, it injects a dependency placeholder you must replace:

```tsx
const options = useMemo(
  () => ({ debounce: 50 }),
  [/* __TODO_MEMOIZATION_DEPENDENCIES__ */],
);
```

This placeholder must be replaced before committing.

## When Not To Use It

- Components that intentionally regenerate literals on every render (e.g., to force recalculation) and where the cost is acceptable.
- Codepaths outside React components or hooks where referential stability is irrelevant.

### Suppressing a single report

The report is anchored on the offending literal, not on the enclosing function,
so an `eslint-disable-next-line` comment belongs directly above the literal:

```tsx
function useSettings() {
  // eslint-disable-next-line @blumintinc/blumint/react-memoize-literals
  return { theme: 'dark' };
}
```

Placing the directive above the function signature leaves the error in place and
reports the directive itself as unused.
