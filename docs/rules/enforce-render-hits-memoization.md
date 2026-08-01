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
```

## When Not To Use It

If you don't use `useRenderHits` or `renderHits` in your codebase, you can safely disable this rule.
