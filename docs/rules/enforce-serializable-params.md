# Enforce serializable parameters for Firebase callable/HTTPS functions (`@blumintinc/blumint/enforce-serializable-params`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Firebase Callable/HTTPS functions send and receive data over JSON. Some values (for example, `DocumentReference`, `Timestamp`, `Map`, `Set`, `Symbol`, `Function`, or `undefined`) are not JSON-safe and may be coerced, dropped, or fail serialization at runtime. This rule prevents those types from appearing in request parameter types so your request contracts stay JSON-safe.

## Rule Details

- Flags parameter properties typed as not JSON-safe values (defaults: `Date`, `DocumentReference`, `Timestamp`, `Map`, `Set`, `Symbol`, `Function`, `undefined`), including nested and generic usages.
- Encourages converting complex values to JSON-safe shapes before sending them (e.g., `Date` -> ISO string, `DocumentReference` -> document path string, `Map`/`Set` -> plain object or array).

### Why this matters

Firebase callable/HTTPS functions run over JSON. If parameters include not JSON-safe values, Firebase either fails to encode them (for example, `undefined`) or coerces them into JSON shapes that lose their semantic type (for example, `Timestamp` becomes a plain object shape, and `Date` typically stringifies to an ISO string that no longer behaves like a `Date`). Some runtime-only values such as `NaN` or `Infinity` also fail JSON encoding even though they are typed as `number`; validate or normalize those at runtime because the type-based rule cannot flag them. Declaring parameters as JSON-safe shapes makes request/response contracts reliable and avoids hidden data loss.

## Examples

### ✅ Good

```ts
type ValidParams = {
  userPath: string; // DocumentReference represented as a path string
  createdAt: string; // ISO string derived from a Date
  tags: string[];
  metadata?: { retryCount: number } | null;
};

export const validFunction = async (
  request: CallableRequest<ValidParams>,
) => {
  // Handle request safely; everything is JSON-serializable
};
```

### ❌ Bad

```ts
type InvalidParams = {
  userRef: DocumentReference;
  createdAt: Date;
  cache: Map<string, number>;
};

export const invalidFunction = async (
  request: CallableRequest<InvalidParams>,
) => {
  // These types are not JSON-safe; they may be coerced or lose meaning (e.g., send Date as an ISO string, DocumentReference as a path, Map/Set as arrays/objects)
};
```

A not JSON-safe type used directly as the request type parameter is flagged the same way, whether it stands alone or sits behind a generic:

```ts
export const invalidDirect = async (request: CallableRequest<Timestamp>) => {
  // Send an ISO string instead
};

export const invalidGeneric = async (
  request: CallableRequest<Map<string, number>>,
) => {
  // Send a plain object or an array of entries instead
};
```

Request contracts declared as an `interface` are resolved the same way as a type alias, and a namespaced type name is matched on its rightmost segment, so the firebase-admin and firebase-functions v1 spellings are covered too:

```ts
interface InvalidInterfaceParams {
  createdAt: admin.firestore.Timestamp;
}

export const invalidInterface = async (
  request: functions.https.CallableRequest<InvalidInterfaceParams>,
) => {
  // Send an ISO string instead
};
```

Resolution follows references, so a payload assembled from other locally declared types — including intersections, tuples and `readonly` arrays — is inspected as a whole. A type parameter that names nothing declared in the file is left alone, so an imported request type is never flagged on a guess.

## Options

This rule accepts an options object:

```ts
{
  additionalNonSerializableTypes?: string[];
  functionTypes?: string[];
}
```

### `additionalNonSerializableTypes`

Additional type names to treat as not JSON-safe beyond the defaults. Use this when your project wraps complex values in domain-specific types that still are not JSON-safe.

### `functionTypes`

Type names that represent Firebase request wrappers to inspect. Defaults to `['CallableRequest']`. Include additional wrapper names if your codebase uses custom request types.
