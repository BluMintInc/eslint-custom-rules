# Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs (`@blumintinc/blumint/no-firestore-object-arrays`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## What this rule enforces

- Disallows arrays whose element type is an object (including type literals, interfaces, unions/intersections of objects, mapped types, and indexed access types) in Firestore model definitions located under any `types/firestore/` directory.
- Allows arrays of Firestore primitives such as `string`, `number`, `boolean`, `Date`, `Timestamp`, and `GeoPoint`, including qualified names such as `firebase.firestore.Timestamp`.
- Allows map-like structures such as `Record<string, T>` or `{ [key: string]: T }`.

## Why arrays of objects are problematic in Firestore

- Arrays of objects are not queryable in Firestore.
- Updating a single item requires rewriting the entire array (destructive updates).
- They are prone to write conflicts when multiple clients update items concurrently.

## Recommended alternative: Array-to-Map conversion pattern

To preserve order while maintaining queryability and safe updates, store collections as maps keyed by id and add an `index` field to each value. Convert between arrays and maps at your domain boundaries.

- Convert arrays to maps using a helper that adds an `index` field to each item (for example, a `toMap` utility).
- Convert maps back to arrays by sorting on the `index` field (for example, a `toArr` utility).

This pattern enables you to:

- Query and update individual items without rewriting the entire collection.
- Preserve the original order via the `index` field.

## Examples

Valid (maps and primitive arrays). These shapes are accepted by the rule:

```ts
export type UserProfile = {
  id: string;
  tags: string[];
  timestamps: Timestamp[];
  path: [number, number][]; // Tuple of primitives is allowed (array of arrays, not objects)
  friends: Record<string, { id: string; name: string; index: number }>;
  contacts: { [id: string]: { email: string; index: number } };
};
```

Invalid (arrays of objects). Replace with a map keyed by id and include `index`:

```ts
export type UserProfile = {
  friends: { id: string; name: string }[]; // ❌ Use Record<string, Friend & { index: number }>
};
```

## When not to use maps

- Primitive arrays (e.g., `string[]`, `number[]`) are appropriate to store as arrays in Firestore.
- If you need per-item documents or cross-document queries, use subcollections instead of embedding.

## Common pitfalls

- Arrays of object unions/intersections are still arrays of objects and are disallowed.
- Readonly forms are also disallowed: `ReadonlyArray<T>` or `readonly T[]` when `T` is an object.
- Nested arrays follow the same rule: `string[][]` is allowed; `{ x: number }[][]` is disallowed.

## Error message

When this rule flags a violation, it provides actionable guidance:

> Arrays of objects are problematic in Firestore: not queryable, destructive updates, and concurrency risks. Prefer `Record<string, T>` keyed by id and include an `index` field for order (e.g., using an array-to-map helper), or use subcollections/arrays of IDs where appropriate.
