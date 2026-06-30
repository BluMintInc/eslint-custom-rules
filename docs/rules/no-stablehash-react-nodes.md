# Prevent passing ReactNodes or render-tree values to stableHash(), which deep-stringifies its argument and can freeze the browser (`@blumintinc/blumint/no-stablehash-react-nodes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

**Do not pass ReactNodes, JSX elements, or render-tree values to `stableHash()` or `sortedHash()`.**

`stableHash` deep-stringifies its argument. Stringifying a ReactNode walks the
entire component tree (props, children, event handlers, closures) and can freeze
or crash the browser tab. Hash stable keys or primitive identifiers instead.

## Rule Details

The rule tracks bindings imported from any module path ending in
`util/hash/stableHash` (absolute or relative) — covering both `stableHash` and
`sortedHash`. It flags a call when the first argument is, or provably contains,
a React render tree value based purely on AST evidence (no type-checker
required):

1. **Direct JSX** — the argument is a JSX element (`<div />`) or fragment
   (`<>...</>`).
2. **Object literal with node-shaped props** — the argument is an object
   literal that has a `children` or `Node` property.
3. **Typed identifier** — the identifier has a TypeScript type annotation (on
   a function parameter or variable declaration) of `ReactNode`,
   `React.ReactNode`, `ReactElement`, `React.ReactElement`, `JSX.Element`,
   `KeyedNode`, `KeyedNode[]`, `readonly KeyedNode[]`, or `OrNode<...>`.

The rule is **conservative**: arguments typed `any` or `unknown`, or
identifiers whose annotation cannot be resolved syntactically, are not flagged.

Import styles tracked:

- `import { stableHash } from '...'`
- `import { stableHash as myHash } from '...'` (alias tracked)
- `import * as Hash from '...'` → `Hash.stableHash(...)` flagged

There is no auto-fix; callers should hash stable keys instead
(e.g. `stableHash(nodes.map((n) => n.key))`).

## Examples

### Incorrect

```tsx
import { stableHash } from 'functions/src/util/hash/stableHash';

// JSX element passed directly
const hash1 = stableHash(<div className="card" />);

// JSX fragment
const hash2 = stableHash(<>hello world</>);

// Identifier typed ReactNode
function hashNode(node: ReactNode) {
  return stableHash(node); // node is a render tree
}

// Identifier typed KeyedNode
function hashKeyed(node: KeyedNode) {
  return stableHash(node);
}

// Array of KeyedNodes
function hashList(content: readonly KeyedNode[]) {
  return stableHash(content);
}

// Object literal with a `children` prop
const hash3 = stableHash({ id: row.id, children: row.children });
```

### Correct

```tsx
import { stableHash } from 'functions/src/util/hash/stableHash';

// Hash only the stable keys, not the nodes themselves
function hashList(content: readonly KeyedNode[]) {
  return stableHash(content.map((n) => n.key));
}

// String argument — safe
const hash = stableHash(item.id);

// Object with only primitive / identity props — safe
const hash2 = stableHash({ uid: user.id, role: user.role });
```

## When to Disable

Disable only when you have confirmed the argument cannot produce a large render
tree (e.g., you are hashing a plain POJO that happens to have a `children`
field that is a string, not a ReactNode). Prefer refactoring to remove the
`children` key instead.

```ts
// eslint-disable-next-line @blumintinc/blumint/no-stablehash-react-nodes
const hash = stableHash({ children: item.label }); // label is a string
```
