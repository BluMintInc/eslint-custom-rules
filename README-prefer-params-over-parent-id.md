# prefer-params-over-parent-id

This ESLint rule enforces the use of the `event.params` property over directly accessing parent IDs through the reference chain (`.ref.parent.id`) in Firebase change handlers.

## Overview

In Firestore and RealtimeDB change handlers, developers often need to access the ID of a parent collection or document. While developers commonly use `.ref.parent.id`, this approach is error-prone, brittle, and less readable. Handler function signatures already provide the parent IDs through the structured `params` object, which offers a more reliable and type-safe way to access this data.

## Rule Details

This rule only applies to functions that are either:
- `DocumentChangeHandler`
- `DocumentChangeHandlerTransaction`
- `RealtimeDbChangeHandler`
- `RealtimeDbChangeHandlerTransaction`

The rule detects the pattern of accessing a parent document's ID through `.ref.parent.id` and suggests using the corresponding property from the `params` object instead.

## Examples

### ❌ Bad Code

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

### ✅ Good Code

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

## Edge Cases Handled

### 1. Multi-Level Path Parameters

For paths with multiple levels of parameters, the rule recognizes accessing any parent ID in the reference chain and suggests the corresponding parameter from the params object.

**Example:**
In a path like `/Game/{gameId}/Tournament/{tournamentId}/Round/{roundId}`, the event.params would contain `{gameId, tournamentId, roundId}`.

### 2. Variable Assignment and Reuse

The rule detects variable assignment patterns and suggests using destructured params instead:

```typescript
// ❌ Bad
const parentId = change.after.ref.parent.id;
// Used in multiple places...

// ✅ Good
const { params: { userId } } = event;
// Used in multiple places...
```

### 3. Complex Reference Chains

The rule handles various patterns of parent reference access and suggests the appropriate params property:

```typescript
// ❌ Bad
const grandparentId = change.after.ref.parent.parent.id;

// ✅ Good (suggests parentId for deeper levels)
const { params: { parentId } } = event;
```

### 4. Optional Chaining

The rule detects optional chaining variants and preserves them in the auto-fix:

```typescript
// ❌ Bad
const maybeParentId = change.after?.ref?.parent?.id;

// ✅ Auto-fixed to
const maybeParentId = params?.userId;
```

### 5. Parameter Naming

The rule suggests appropriate parameter names:
- For single `.parent` access: suggests `userId`
- For multiple `.parent.parent` access: suggests `parentId`

## Configuration

This rule is enabled by default in the recommended configuration with error severity:

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-params-over-parent-id": "error"
  }
}
```

## Auto-fix

This rule provides automatic fixes that replace `.ref.parent.id` patterns with appropriate `params` access. The auto-fix preserves optional chaining when present.

## Benefits

1. **Type Safety**: Using params provides better type safety than accessing reference chains
2. **Maintainability**: Code is easier to understand and maintain
3. **Reliability**: Less prone to errors when document paths change
4. **Performance**: Avoids unnecessary reference traversal
5. **Consistency**: Enforces consistent patterns across the codebase

## When Not To Use

This rule should not be used if:
- You're not using Firebase change handlers
- You're working with functions that don't have the handler type annotations
- You need to access reference properties other than parent IDs

## Related Rules

- `enforce-firestore-doc-ref-generic` - Enforces generic types for Firestore references
- `enforce-firestore-path-utils` - Enforces use of path utilities for Firestore operations

## Further Reading

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Realtime Database Triggers](https://firebase.google.com/docs/functions/database-events)
