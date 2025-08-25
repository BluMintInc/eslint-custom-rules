# Disallow arrays of objects in Firestore type definitions to optimize performance and avoid unnecessary fetches (`@blumintinc/blumint/no-firestore-object-arrays`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

### What this rule enforces

- Disallows arrays whose element type is an object (including type literals, interfaces, unions/intersections of objects, mapped types, and indexed access types) in Firestore model definitions located under `functions/src/types/firestore`.
- Allows arrays of Firestore primitives such as `string`, `number`, `boolean`, `Date`, `Timestamp`, `GeoPoint`, including qualified names like `firebase.firestore.Timestamp`.
- Allows map-like structures such as `Record<string, T>` or `{ [key: string]: T }`.

### Why arrays of objects are problematic in Firestore

- Arrays of objects are not queryable in Firestore.
- Updating a single item requires rewriting the entire array (destructive updates).
- Concurrency issues arise when multiple writers update the array simultaneously.

### Recommended alternative: Array-Map Conversion system

To preserve order while maintaining queryability and safe updates, store collections as maps keyed by id and add an `index` field to each value. Convert between arrays and maps at the edges of your system.

- Convert arrays to maps: `toMap<T extends Identifiable>(arr)` adds an `index` field to each item.
- Convert maps back to arrays: `toArr<T extends Indexed>(map)` sorts by `index` and returns an ordered array.

This pattern enables:
- Querying and updating individual items without rewriting the entire collection.
- Preserving the original order via the `index` field.

### Examples

Valid (maps and primitive arrays):
```ts
export type UserProfile = {
  id: string;
  tags: string[];
  timestamps: Timestamp[];
  friends: Record<string, { id: string; name: string; index: number }>;
  contacts: { [id: string]: { email: string; index: number } };
};
```

Invalid (arrays of objects):
```ts
export type UserProfile = {
  friends: { id: string; name: string }[]; // ❌ Use Record<string, Friend & { index: number }>
};
```

### When not to use maps

- Primitive arrays (e.g., `string[]`, `number[]`) are fine to store as arrays in Firestore.
- If you need per-item documents or cross-document queries, consider subcollections instead of embedding.

### Common pitfalls

- Arrays of object unions/intersections are still arrays of objects and thus disallowed.
- Readonly arrays (`ReadonlyArray<T>`) of objects are disallowed.
- Namespaced primitives are allowed: `firebase.firestore.Timestamp[]` is valid.
- Arrays of arrays of primitives are allowed (`string[][]`), but arrays of arrays of objects are disallowed (`{x:number}[][]`).

### Error message

When this rule flags a violation, it provides actionable guidance:

> Arrays of objects are problematic in Firestore: not queryable, destructive updates, and concurrency risks. Prefer `Record<string, T>` keyed by id and include an `index` field for order (use toMap/toArr), or use subcollections/arrays of IDs where appropriate.
