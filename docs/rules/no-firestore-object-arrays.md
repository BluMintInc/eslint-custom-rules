# Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs (`@blumintinc/blumint/no-firestore-object-arrays`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## What this rule enforces

- Flags any Firestore model field under `functions/src/types/firestore` whose type is an array of objects (type literals, interfaces, unions/intersections of objects, mapped types, or indexed access types).
- Allows arrays of Firestore primitives such as `string`, `number`, `boolean`, `Date`, `Timestamp`, `GeoPoint`, including qualified names such as `firebase.firestore.Timestamp`.
- Allows map-like structures such as `Record<string, T>` or `{ [key: string]: T }`, which support targeted updates.

## Why arrays of objects are risky in Firestore

- Firestore cannot query inside array items, so object arrays force full-document reads and client-side filtering.
- Updating a single item rewrites the entire array; concurrent writers overwrite each other and silently drop items.
- Arrays grow without per-item security rules or indexing; map/subcollection shapes keep per-item isolation.

## How to structure object collections safely

To preserve order while maintaining queryability and safe updates, store collections as maps keyed by id and add an `index` field to each value. Convert between arrays and maps at your domain boundaries.

- Convert arrays to maps using a helper that adds an `index` field to each item (for example, a `toMap` utility).
- Convert maps back to arrays by sorting on the `index` field (for example, a `toArr` utility).

This pattern enables you to:

- Query and update individual items without rewriting the entire collection.
- Preserve the original order via the `index` field.

## Examples

Valid (primitive arrays and map shapes):

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

Invalid (arrays of objects — convert to a map keyed by id and index):

```ts
export type UserProfile = {
  friends: { id: string; name: string }[]; // ❌ Use Record<string, Friend & { index: number }>
};
```

## Error message

When the rule fires, it points to the problematic field and suggests a replacement:

> What's wrong: friends stores an array of objects in a Firestore document.
> Why it matters: Firestore cannot query inside object arrays, and updating one item rewrites the whole array; concurrent writes can overwrite each other and lose data.
> How to fix: Store items as Record<string, T> keyed by id (with an index field for ordering; convert with toMap/toArr), or move items into a subcollection or store only an array of IDs.
