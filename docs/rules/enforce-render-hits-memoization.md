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

### Module scope is already a memoization boundary

A `transformBefore` or `render` prop that points at a declaration outside every
component body needs no hook at all: the binding is created once for the
program's lifetime, so its identity is strictly more stable than anything
`useCallback` can hand back. These forms are accepted:

| Form | Accepted |
| --- | --- |
| `const f = () => {}` at module scope (including `export const`) | ✅ |
| `function f() {}` at module scope | ✅ |
| `import { f } from './f'` / `import f from './f'` | ✅ |
| `let` / `var` at module scope | ❌ — reassignable, so a later render can see a different function |
| type-only import | ❌ — binds no value |
| `const f = () => {}` inside a component or any nested block | ❌ — re-created every render |

Both module scope and global scope count, because under
`sourceType: 'script'` a top-level declaration binds to the *global* scope and
no module scope exists at all.

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
const Component = ({ hits }) => {
  const transform = (hits) => hits.filter(h => h.isActive);
  useRenderHits({ hits, transformBefore: transform, render });
};
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
```

## When Not To Use It

If you don't use `useRenderHits` or `renderHits` in your codebase, you can safely disable this rule.
