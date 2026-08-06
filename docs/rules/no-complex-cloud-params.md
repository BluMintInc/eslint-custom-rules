# Disallow passing complex objects to cloud functions (`@blumintinc/blumint/no-complex-cloud-params`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Cloud function parameters must be JSON-serializable. Class instances, functions, RegExp/BigInt values, typed arrays, or objects with symbol keys are not portable and lead to dropped values or runtime errors when Firebase transports the payload.

## Why this rule exists

- Cloud functions receive payloads through JSON; non-serializable values either throw or get stripped, so the backend sees missing or corrupted params.
- Methods, getters/setters, bound/generator/async functions, and proxies cannot be marshalled, which makes behavior diverge between client and server.
- Enforcing plain data keeps request contracts predictable and debuggable.

## How to fix

- Pass only primitives and plain objects/arrays with JSON-safe properties.
- Convert complex values into serializable forms (for example, use `regexp.source`, `date.toISOString()`, or plain data objects).
- Pre-serialize payloads with `JSON.stringify` when appropriate, or move behavior into the cloud function and only pass the data it needs.

## Examples

### ❌ Examples of incorrect code

```typescript
const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
const groupFilter = {
  pattern: /test-.*/, // RegExp is not serializable
  validate: () => true, // functions cannot cross the wire
};
await exitChannelGroupExternal({ groupFilter });
```

```typescript
const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
const proxyFilter = new Proxy({ name: 'test' }, {});
await exitChannelGroupExternal({ groupFilter: proxyFilter });
```

### ✅ Examples of correct code

```typescript
const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
const groupFilter = { pattern: 'test-.*', name: 'test' };
await exitChannelGroupExternal({ groupFilter });
```

```typescript
const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
const groupFilter = JSON.stringify({ name: 'test-group', ids: [1, 2, 3] });
await exitChannelGroupExternal({ groupFilter });
```

## Detection scope

A function is treated as a cloud function when it is destructured from a dynamic
import whose module path contains `firebaseCloud`. The path may be written as a
string literal or as a template literal without substitutions — both spell the
same module, so both are tracked:

```typescript
const { exitChannelGroupExternal } = await import(
  `src/firebaseCloud/messaging/exitChannelGroupExternal`
);
const groupFilter = { pattern: 'test-.*' };
await exitChannelGroupExternal({ groupFilter });
```

An interpolated path such as
``await import(`src/firebaseCloud/messaging/${name}`)`` resolves to a different
module on each call, so its exports are not tracked and calls to them are not
checked.

The `JSON.stringify`, `Object.create(null)`, and `.bind` escape hatches are
recognized through computed member access as well, so `Object['create'](null)`
behaves the same as `Object.create(null)`.
