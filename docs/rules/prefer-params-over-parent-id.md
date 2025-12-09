# Enforce the use of event.params over .ref.parent.id in Firebase change handlers (`@blumintinc/blumint/prefer-params-over-parent-id`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Change handlers already expose trigger path variables through `event.params`. Reconstructing those IDs with `ref.parent.id`:

- drifts as soon as collection nesting changes, so handlers silently read the wrong parent
- bypasses the type-safe params object, hiding typos behind optional chaining or `undefined`
- makes intent harder to scan because readers must mentally follow the reference chain

The rule targets handlers typed as `DocumentChangeHandler`, `DocumentChangeHandlerTransaction`, `RealtimeDbChangeHandler`, or `RealtimeDbChangeHandlerTransaction` and reports any `ref.parent...id` access inside them.

## Configuration

This rule is enabled by default in the recommended config. To configure it explicitly:

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-params-over-parent-id": "error"
  }
}
```

## Auto-fix

When `params` is already available, the fixer replaces `ref.parent.id` with `params.userId` (or `params?.userId` if optional chaining is present). For deeper `parent.parent` traversals it suggests `params.parentId` so IDs still come from the trigger params rather than the reference chain.

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
export const nestedPathHandler: DocumentChangeHandler<
  GameData,
  GamePath
> = async (event) => {
  const { params: { gameId, tournamentId, roundId } } = event;

  const path = `Game/${gameId}/Tournament/${tournamentId}/Round/${roundId}`;
  await db.doc(path).get();
};
```

## Edge Cases Handled

- Optional chaining: `change.after?.ref?.parent?.id` is reported and auto-fixed to `params?.userId` when `params` is present.
- Multi-level traversal: any `parent.parent...id` hop is flagged so the ID is pulled from the trigger params instead of the reference chain.
- Nested expressions and callbacks: the rule still reports `ref.parent.id` inside template literals, callbacks, or object literals.
- Params already destructured: even if `{ params }` is in scope, using `ref.parent.id` still reports to keep handlers aligned with the trigger path.

## Benefits
- Keeps handlers aligned with the trigger path template when collections move or nesting changes
- Uses the typed `params` object instead of brittle reference traversal
- Makes parent ID usage readable without re-deriving it from document references
- Avoids redundant lookups on the reference chain

## When Not To Use It

This rule should not be used if:
- You're not using Firebase change handlers
- You're working with functions that don't have the handler type annotations
- You need to access reference properties other than parent IDs

## Related Rules
- `enforce-firestore-doc-ref-generic`
- `enforce-firestore-path-utils`

## Further Reading

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Realtime Database Triggers](https://firebase.google.com/docs/functions/database-events)
