# Enforce the use of event.params over .ref.parent.id in Firebase change handlers (`@blumintinc/blumint/prefer-params-over-parent-id`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces the use of the `event.params` property over directly accessing parent IDs through the reference chain (`.ref.parent.id`). In Firestore and RealtimeDB change handlers, developers often need to access the ID of a parent collection or document. While developers commonly use `.ref.parent.id`, this approach is error-prone, brittle, and less readable. Handler function signatures already provide the parent IDs through the structured `params` object, which offers a more reliable and type-safe way to access this data.

This rule only applies to functions that are either `DocumentChangeHandler`, `DocumentChangeHandlerTransaction`, `RealtimeDbChangeHandler`, or `RealtimeDbChangeHandlerTransaction` types.

## Examples

### ❌ Incorrect

```typescript
export const updateRelatedDocuments: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const { data: change } = event;

  // Brittle way to access the parent document ID
  const userId = change.after.ref.parent.id;

  // Using the parent ID to query or update other documents
  const userProfile = await db.doc(`UserProfile/${userId}`).get();
};
```

```typescript
export const handleUpdate: DocumentChangeHandler<
  UserData,
  UserPath
> = async (event) => {
  const { data: change } = event;

  // Direct usage in expressions
  const userProfile = await db.doc(`UserProfile/${change.after.ref.parent.id}`).get();
};
```

```typescript
export const optionalChaining: DocumentChangeHandler<
  UserData,
  UserPath
> = async (event) => {
  const { data: change } = event;

  // Optional chaining usage
  const userId = change.after?.ref?.parent?.id;
};
```

```typescript
export const grandparentAccess: DocumentChangeHandler<
  UserData,
  UserPath
> = async (event) => {
  const { data: change } = event;

  // Multiple parent levels (grandparent)
  const grandparentId = change.after.ref.parent.parent.id;
};
```

### ✅ Correct

```typescript
export const updateRelatedDocuments: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const {
    data: change,
    params: { userId } // Access parent ID directly from params
  } = event;

  // Using the parent ID from params to query or update other documents
  const userProfile = await db.doc(`UserProfile/${userId}`).get();
};
```

```typescript
export const handleUpdate: DocumentChangeHandler<
  UserData,
  UserPath
> = async (event) => {
  const { params: { userId } } = event;

  // Direct usage with params
  const userProfile = await db.doc(`UserProfile/${userId}`).get();
};
```

```typescript
export const handlerWithDestructuring: DocumentChangeHandler<
  UserData,
  UserPath
> = async ({ data: change, params: { userId, docId } }) => {
  console.log(`User ${userId}, doc ${docId}`);
};
```

## Edge Cases Handled

### 1. Multi-Level Path Parameters
For paths like `/Game/{gameId}/Tournament/{tournamentId}/Round/{roundId}`, the rule recognizes accessing any parent ID in the reference chain and suggests the corresponding parameter from the params object.

### 2. Variable Assignment and Reuse
The rule detects variable assignment patterns:
```typescript
// ❌ Incorrect
const parentId = change.after.ref.parent.id;

// ✅ Correct
const { params: { userId } } = event;
```

### 3. Complex Reference Chains
The rule handles various patterns of parent reference access:
```typescript
// ❌ Incorrect
const grandparentId = change.after.ref.parent.parent.id;

// ✅ Correct (suggests parentId for deeper levels)
const { params: { parentId } } = event;
```

### 4. Optional Chaining
The rule detects optional chaining variants and preserves them in the fix:
```typescript
// ❌ Incorrect
const maybeParentId = change.after?.ref?.parent?.id;

// ✅ Fixed to
const maybeParentId = params?.userId;
```

## When Not To Use It

This rule should not be used if:
- You're not using Firebase change handlers
- You're working with functions that don't have the handler type annotations
- You need to access reference properties other than parent IDs

## Further Reading

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Realtime Database Triggers](https://firebase.google.com/docs/functions/database-events)
