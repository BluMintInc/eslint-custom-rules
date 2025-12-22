# Disallow circular references in objects (`@blumintinc/blumint/no-circular-references`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Circular object graphs throw during `JSON.stringify()`, keep objects reachable longer (leading to leaks), and make mutation paths harder to reason about. This rule reports any assignment or property wiring that makes an object point back to itself, directly or through another object, method, or promise callback.

## Rule Details

When the rule fires, the message explains which expression created the cycle and how to break it:

> Reference "{{referenceText}}" makes this object point back to itself (directly or through other objects). Circular object graphs throw in `JSON.stringify()` and keep members reachable longer, which causes memory leaks and unexpected mutations. Store a copy or a serialize-safe identifier instead of the original object when assigning.

Why this matters:

- `JSON.stringify()` throws on circular structures, blocking logging, telemetry, and API payloads.
- Cycles keep entire graphs reachable, which delays garbage collection and can leak large trees.
- Shared references spread mutations in surprising directions, hiding the source of state changes.

How to fix:

- Store stable identifiers (IDs, paths) instead of assigning the original object.
- Clone data (`structuredClone`, spread, or serialization) before attaching it back to a parent.
- Avoid reattaching resolved values in async chains back onto the source object.

## Examples

Examples of **incorrect** code for this rule:

```ts
// Direct self-reference
const obj = {};
obj.self = obj;

// Indirect cycle across objects
const obj1 = {};
const obj2 = { ref: obj1 };
obj1.ref = obj2;

// Async path that reattaches the resolved value back to the source
const obj = {};
const promise = Promise.resolve(obj);
promise.then((result) => (obj.self = result));
```

Examples of **correct** code for this rule:

```ts
// Store a serializable ID instead of the full object
const user = { id: 'u123', name: 'Ada' };
const profile = { userId: user.id };

// Clone data before attaching it back to the parent
const original = { settings: { theme: 'dark' } };
const snapshot = structuredClone(original.settings);
const viewModel = { settings: snapshot };

// Keep async flows acyclic
const obj = { id: 'u123' };
const promise = Promise.resolve(obj);
promise.then((result) => {
  obj.selfId = result.id; // store a stable identifier, not the object
});
```

## When Not To Use It

Consider disabling this rule when you intentionally model cyclic graphs (for example, linked structures, graph nodes, or caches) and you handle serialization or memory considerations yourself.

## Further Reading

- [MDN: Working with Objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects)
- [JSON.stringify() and Circular References](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#exceptions)
- [Memory Management and Garbage Collection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
