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

- Prefer `Record<string, T & { index: number }>` keyed by id. Convert arrays to maps with `toMap` and back with `toArr` to preserve ordering via the `index` field.
- If you need per-item documents or cross-document queries, store items in a subcollection or keep an array of item IDs and fetch the documents individually.

## Examples

Valid (primitive arrays and map shapes):

```ts
export type UserProfile = {
  id: string;
  tags: string[];
  timestamps: Timestamp[];
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

> Array field "friends" stores objects in a Firestore document. Firestore cannot query inside object arrays, and updates rewrite the entire array so concurrent writes drop data. Store this collection as Record<string, T> keyed by id with an index for ordering (convert with toMap/toArr), or move the items into a subcollection or array of IDs.
