# Enforce proper memoization and usage of useRenderHits and renderHits (`@blumintinc/blumint/enforce-render-hits-memoization`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces proper memoization and usage of `useRenderHits` and `renderHits` throughout the codebase. Since these functions play a key role in rendering search results efficiently, improper use can lead to unnecessary re-renders, performance issues, and unexpected behaviors.

## Rule Details

This rule aims to ensure:
1. `transformBefore` and `render` props passed to `useRenderHits` are always memoized.
2. `renderHits` is only used inside a memoized context (e.g., `useMemo` or `useCallback`).
3. React components are never passed directly to `render`, but rather wrapped in a memoized arrow function.

Examples of **incorrect** code for this rule:

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

// ❌ renderHits not in useMemo/useCallback
const result = renderHits(hits, (hit) => <HitComponent hit={hit} />);

// ❌ Nested renderHits not in useMemo/useCallback
function renderResults(hits) {
  return renderHits(hits, (hit) => <HitComponent hit={hit} />);
}
```

Examples of **correct** code for this rule:

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
```

## When Not To Use It

If you don't use `useRenderHits` or `renderHits` in your codebase, you can safely disable this rule.
