# Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs (`@blumintinc/blumint/no-firestore-object-arrays`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## What this rule enforces

- Flags any Firestore model field under `functions/src/types/firestore` whose type is an array of objects (type literals, interfaces, unions/intersections of objects, mapped types, or indexed access types).
- Allows arrays of Firestore primitives such as `string`, `number`, `boolean`, `Date`, `Timestamp`, `GeoPoint`, including qualified names such as `firebase.firestore.Timestamp`.
- Allows map-like structures such as `Record<string, T>` or `{ [key: string]: T }`, which support targeted updates.
- Allows arrays of a const-array-derived union: `(typeof X)[number]` is treated as the underlying union of `X`'s elements when `X` is a const array in scope at the reference whose elements are all primitive literals. This is the shape [`prefer-union-from-const-array`](./prefer-union-from-const-array.md) autofixes toward, so `eslint --fix` cannot turn a passing model type into a violation.

### How element type names are resolved

An element type spelled by name (`Comment[]`, `Array<Comment>`, `ReadonlyArray<Comment>`) is resolved against the same file, searching every statement container enclosing the reference — file scope, function and block bodies, `namespace` bodies, class static blocks, and `switch` cases — from the innermost outward, looking through `export`. Declaration position does not change the verdict: a model type written inside a function body is judged exactly as one written at file scope, and a declaration written below its own reference still resolves, matching TypeScript's hoisting of type declarations.

The nearest declaration wins, so an inner declaration shadows a same-named outer one. A declaration in a scope the reference cannot see — a sibling function body, or another module — is not consulted, and an unresolvable name keeps the conservative non-object classification rather than being assumed to be an object.

A **type parameter** shadows the same way. In `interface UserProfile<Friend> { friends: Friend[] }` the element type is the interface's own opaque parameter, not an outer `Friend` declaration, so it stays unresolved and keeps the non-object classification. Only type-space binders shadow a type name: a value named `Friend` — a parameter, a `catch` binding, a `for` head — leaves the declaration resolvable.

```ts
// File: functions/src/types/firestore/Post.ts
export function buildDefaults() {
  type Comment = { text: string; author: string };
  type Post = {
    comments: Comment[]; // ❌ Reported: `Comment` resolves in the enclosing block
  };
}
```

### Limits of the `(typeof X)[number]` exemption

The lookup is syntactic, so the exemption applies only when every part is verifiable in the file being linted. These forms keep the default object-lookup classification:

- `X` is imported, or declared only in a scope the reference cannot see.
- `X` holds anything other than an array literal (for example an object literal).
- Any element of `X` is an object literal, or any other expression that is not a primitive literal, a nested primitive array, or a spread of another qualifying const array.
- The index is not `number` (for example `(typeof X)['length']`), or the object side is not a `typeof` query (for example `DataShape['user']`).

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

### Valid (primitive arrays and map shapes)

```ts
// File: functions/src/types/firestore/UserProfile.ts
export const MEMBER_ROLE_VALUES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number]; // Union of string literals, not an object lookup

export type UserProfile = {
  id: string;
  tags: string[];
  timestamps: Timestamp[];
  roles: MemberRole[];
  path: [number, number][]; // Tuple of primitives is allowed (array of arrays, not objects)
  friends: Record<string, { id: string; name: string; index: number }>;
  contacts: { [id: string]: { email: string; index: number } };
};
```

### Invalid (arrays of objects — convert to a map keyed by id and index)

```ts
// File: functions/src/types/firestore/UserProfile.ts
export const FRIEND_VALUES = [{ id: 'a' }, { id: 'b' }] as const;

export type UserProfile = {
  friends: { id: string; name: string }[]; // ❌ Use Record<string, Friend & { index: number }>
  entries: (typeof FRIEND_VALUES)[number][]; // ❌ A const array of objects is still an object array
};
```

## Error message

When the rule fires, it points to the problematic field and suggests a replacement:

> What's wrong: friends stores an array of objects in a Firestore document.
> Why it matters: Firestore cannot query inside object arrays, and updating one item rewrites the whole array; concurrent writes can overwrite each other and lose data.
> How to fix: Store items as Record<string, T> keyed by id with an index field for ordering (use toMap/toArr helpers), or move items into a subcollection or store only an array of IDs.
