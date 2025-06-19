# Enforce the use of event.params over directly accessing parent IDs through the reference chain (.ref.parent.id) (`@blumintinc/blumint/prefer-params-over-parent-id`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces the use of the `event.params` property over directly accessing parent IDs through the reference chain (`.ref.parent.id`). In our Firestore and RealtimeDB change handlers, we often need to access the ID of a parent collection or document. While developers commonly use `.ref.parent.id`, this approach is error-prone, brittle, and less readable. Our handler function signatures already provide the parent IDs through the structured `params` object, which offers a more reliable and type-safe way to access this data.

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
  // ... rest of implementation
};
```

```typescript
// Optional chaining is also discouraged
export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
  const { data: change } = event;
  const maybeParentId = change.after?.ref?.parent?.id;
};
```

```typescript
// Multiple parent levels
export const handler: DocumentChangeHandler<Round, RoundPath> = async (event) => {
  const { data: change } = event;
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
  // ... rest of implementation
};
```

```typescript
// Multiple parameters from params
export const handleTournamentUpdate: DocumentChangeHandler<
  Tournament,
  TournamentPath
> = async (event) => {
  const { params: { gameId, tournamentId } } = event;
  console.log(gameId, tournamentId);
};
```

## Why?

1. **Type Safety**: The `params` object is properly typed based on your path type definitions
2. **Maintainability**: Changes to document paths won't break your code
3. **Readability**: It's immediately clear what parameters are available
4. **Reliability**: Less prone to errors when document structures change

## Edge Cases Handled

- **Multi-Level Path Parameters**: Paths like `/Game/{gameId}/Tournament/{tournamentId}/Round/{roundId}` are properly handled
- **Variable Assignment**: The rule detects when `.ref.parent.id` is assigned to variables
- **Complex Reference Chains**: Handles patterns like `change.after.ref.parent.parent.id`
- **Optional Chaining**: Detects optional chaining variants like `change.after?.ref?.parent?.id`

## When Not To Use

This rule should not be disabled as it enforces a critical pattern for Firebase handler functions. However, it only applies to the specific handler types mentioned above, so it won't interfere with other code.
