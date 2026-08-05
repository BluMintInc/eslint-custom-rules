# Enforce proper memoization and usage of useRenderHits and renderHits (`@blumintinc/blumint/enforce-render-hits-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces proper memoization and usage of `useRenderHits` and `renderHits` throughout the codebase. Since these functions play a key role in rendering search results efficiently, improper use can lead to unnecessary re-renders, performance issues, and unexpected behaviors.

## Rule Details

This rule aims to ensure:
1. `transformBefore` and `render` props passed to `useRenderHits` are always memoized.
1. `renderHits` is only used inside a memoized context (`useMemo`, `useCallback`, or `useLatestCallback`).
1. React components are never passed directly to `render`, but rather wrapped in a memoized arrow function.

### Accepted memoization boundaries

`useCallback`, `useMemo` and `useLatestCallback` all count. `useLatestCallback`
is accepted under whatever local name the file binds it to, because
[`use-latest-callback`](./use-latest-callback.md) — enabled in the same
`recommended` config and fixable — rewrites `useCallback` calls into it as a
default import, falling back to `useLatestCallback2` when the plain name is
already taken. A type-only import binds no callable value, so its local name is
not accepted.

### Shorthand and written-out props are read identically

`useRenderHits({ hits, render })` and `useRenderHits({ hits, render: render })`
pass the same value, so both are checked. There is no shorthand exemption, and
there cannot be one: the core `object-shorthand` rule — `['error', 'always']` in
consuming configs, and fixable — rewrites the second spelling into the first, so
exempting shorthand would let a single `eslint --fix` erase every report about a
prop whose variable is named after it. That is the spelling idiomatic code
reaches for first (`const render = ...; useRenderHits({ hits, render })`), so the
exemption would have swallowed the rule's central case.

A memoized declaration is recognised wherever it sits on the scope chain, not
only in the scope that encloses the `useRenderHits` call. A call nested in a
block or in an inner component still sees the `useCallback` its component
declared.

`noDirectComponentInRender` is unreachable through a shorthand prop by
construction: shorthand requires the variable's name to equal the prop's name,
and `render` is lowercase, so the value can never look like a component.

### A declaration outside the calling function is already a memoization boundary

A `transformBefore` or `render` prop that points at a declaration outside the
body of the function calling `useRenderHits` needs no hook at all. The binding is
created once per run of the enclosing scope, and the calling function is created
in that same run, so its identity is fixed for the whole life of that closure —
strictly more stable than anything `useCallback` can hand back.

The test is **relative**, not absolute: what matters is whether at least one
function boundary separates the declaration from the `useRenderHits` call. Module
scope is the degenerate case, where the declaration has no enclosing function at
all. These forms are accepted:

| Form | Accepted |
| --- | --- |
| `const f = () => {}` at module scope (including `export const`) | ✅ |
| `function f() {}` at module scope | ✅ |
| `import { f } from './f'` / `import f from './f'` | ✅ |
| `const f = () => {}` in a factory/HOC/`describe` that encloses the calling function | ✅ — created once per run of the enclosing scope, and the caller is created with it |
| `let` / `var` anywhere | ❌ — reassignable, so a later render can see a different function |
| type-only import | ❌ — binds no value |
| a parameter of the calling function or of any function enclosing it | ❌ — the caller decides the identity, so memoize it there |
| `const f = () => {}` in the calling function itself, or in a block inside it | ❌ — re-created every time that function runs |

Both module scope and global scope count as "no enclosing function", because
under `sourceType: 'script'` a top-level declaration binds to the *global* scope
and no module scope exists at all.

Gating on module scope alone rejected shapes whose remedy does not exist. In a
component factory, `useCallback` cannot legally be called in the factory (it is
neither a component nor a hook, so the rules of hooks forbid it), and a helper
closing over a factory parameter cannot be hoisted to module scope either — the
only ways to satisfy an absolute gate are a rules-of-hooks violation or an
`eslint-disable`.

A custom hook is not special-cased. A hook body re-runs on every render of its
caller, so a helper declared there and consumed by a `useRenderHits` call in that
same body is reported; the same helper consumed from a component the hook
*returns* is accepted, because that component is rebuilt alongside it.

This carve-out is what keeps the `recommended` config self-consistent:
[`no-empty-dependency-use-callbacks`](./no-empty-dependency-use-callbacks.md) is
`error` in the same config and fixable, and it hoists a dependency-free callback
to module scope while dropping the hook. A single `eslint --fix` therefore
rewrites a correctly memoized prop into exactly the module-scope form above, and
without the carve-out the config would demand the very hook its own fixer just
removed.

### Examples of **incorrect** code for this rule:

```js
// ❌ transformBefore and render are not memoized
useRenderHits({
  hits,
  transformBefore: (hits) => hits.filter(h => h.isActive),
  render: (hit) => <HitComponent hit={hit} />,
});

// ❌ Directly passing a component
useRenderHits({
  hits,
  render: HitComponent,
});

// ❌ renderHits outside any memoization boundary
const result = renderHits(hits, (hit) => <HitComponent hit={hit} />);

// ❌ Nested renderHits outside any memoization boundary
function renderResults(hits) {
  return renderHits(hits, (hit) => <HitComponent hit={hit} />);
}

// ❌ An arbitrary wrapper is not a memoization boundary
import wrap from './wrap';
const wrapped = wrap(() => renderHits(hits, (hit) => <HitComponent hit={hit} />));

// ❌ Declared inside the component, so it is re-created every render
const render = (hit) => <HitComponent hit={hit} />;
const Component = ({ hits }) => {
  const transform = (hits) => hits.filter(h => h.isActive);
  useRenderHits({ hits, transformBefore: transform, render });
};

// ❌ The same thing in shorthand — the spelling changes nothing
const HitsList = ({ hits }) => {
  const transformBefore = (hits) => hits.filter(h => h.isActive);
  const render = (hit) => <HitComponent hit={hit} />;
  useRenderHits({ hits, transformBefore, render });
};

// ❌ A shorthand prop filled by a component parameter forwards a value whose
// identity the caller decides, so memoize it where it is created
const Forwarder = ({ hits, transformBefore, render }) => {
  useRenderHits({ hits, transformBefore, render });
};

// ❌ Declared in the very function that calls the hook, even though that
// function is itself nested inside a factory — no boundary separates them
function createHitList() {
  return function HitList({ hits }) {
    const transform = (hits) => hits.filter(h => h.isActive);
    useRenderHits({ hits, transformBefore: transform });
  };
}

// ❌ A custom hook body re-runs on every render of its caller
function useHitList(hits) {
  const render = (hit) => <HitComponent hit={hit} />;
  useRenderHits({ hits, render });
}
```

### Examples of **correct** code for this rule:

```js
// ✅ Memoized transformBefore and render
const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
const render = useCallback((hit) => <HitComponent hit={hit} />, []);

useRenderHits({
  hits,
  transformBefore,
  render,
});

// ✅ renderHits inside useMemo
const result = useMemo(() => renderHits(hits, (hit) => <HitComponent hit={hit} />), [hits]);

// ✅ renderHits inside useCallback
const renderResults = useCallback(() => renderHits(hits, (hit) => <HitComponent hit={hit} />), [hits]);

// ✅ renderHits inside useLatestCallback, including the suffixed name the
// use-latest-callback autofix falls back to when useLatestCallback is taken
import useLatestCallback from 'use-latest-callback';
const renderLatest = useLatestCallback(() => renderHits(hits, (hit) => <HitComponent hit={hit} />));

// ✅ useRenderHits props memoized with useLatestCallback
const transform = useLatestCallback((hits) => hits.filter(h => h.isActive));
const renderHit = useLatestCallback((hit) => <HitComponent hit={hit} />);
useRenderHits({ hits, transformBefore: transform, render: renderHit });

// ✅ Module-scope declarations need no hook — they are created once
const transformActive = (hits) => hits.filter(h => h.isActive);
function renderRow(hit) {
  return <HitComponent hit={hit} />;
}
const HitsList = ({ hits }) => {
  useRenderHits({ hits, transformBefore: transformActive, render: renderRow });
};

// ✅ Shorthand props pointing at memoized declarations
const HitsSection = ({ hits }) => {
  const transformBefore = useCallback((hits) => hits.filter(h => h.isActive), []);
  const render = useCallback((hit) => <HitComponent hit={hit} />, []);
  useRenderHits({ hits, transformBefore, render });
};

// ✅ A factory: the helpers are built once per createHitList() call and the
// HitList closure is built in the same call, so every render sees the identical
// references. useCallback is not even legal in createHitList, and transform
// closes over `pred`, so neither remedy the message names exists here.
function createHitList(pred) {
  const transform = (hits) => hits.filter(pred);
  const renderHit = (hit) => <HitComponent hit={hit} />;
  return function HitList({ hits }) {
    useRenderHits({ hits, transformBefore: transform, render: renderHit });
  };
}

// ✅ A describe-scope helper consumed from a nested it
describe('useRenderHits', () => {
  const renderHit = () => null;
  it('renders', () => {
    renderHook(() => useRenderHits({ hits: [], render: renderHit }));
  });
});
```

## When Not To Use It

If you don't use `useRenderHits` or `renderHits` in your codebase, you can safely disable this rule.
