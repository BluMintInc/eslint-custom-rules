# Prefer event.params over ref.parent.id for type-safe Firebase trigger paths (`@blumintinc/blumint/prefer-params-over-parent-id`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Prefer handler params for parent IDs instead of traversing `ref.parent.id` so Firebase triggers stay aligned with path templates and type-safe.

In Firestore and Realtime Database change handlers, you already get trigger path variables through `event.params`. Reconstructing those IDs with `ref.parent.id`:

- drifts as soon as collection nesting changes, so handlers silently read the wrong parent
- bypasses the type-safe params object, hiding typos behind optional chaining or `undefined`
- makes intent harder to scan because readers must mentally follow the reference chain

The rule targets handlers typed as `DocumentChangeHandler`, `DocumentChangeHandlerTransaction`, `RealtimeDbChangeHandler`, or `RealtimeDbChangeHandlerTransaction` and reports any `ref.parent...id` access inside them.

## Setup Example

This rule is enabled by default in the recommended config. To configure it explicitly:

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-params-over-parent-id": "error"
  }
}
```

## Auto-fix

When `params` is available, the fixer replaces `ref.parent.id` with a corresponding path parameter. The resolution follows this algorithm:

1. **Identify Depth**: The number of `.parent` traversals determines the target nesting level (e.g., `ref.parent.id` is depth 1, `ref.parent.parent.id` is depth 2).
1. **Map to Default Name**: Each depth maps to a default parameter name:
   - Depth 1 → `userId`
   - Depth 2 → `parentId`
   - Depth 3+ → `parentNId` (e.g., `parent3Id`)
1. **Check Scope**: The rule looks for an existing `params` object (from `event.params` or destructured `const { params } = event`).
1. **Resolve Identifier**:
   - If `params` is destructured and contains the default name (e.g., `const { params: { userId } } = event`), the fixer uses the local variable.
   - Otherwise, it uses `event.params.[defaultName]` (or `event?.params?.[defaultName]` if optional chaining was used in the original expression).

This ensures that `ref.parent.id` becomes `event.params.userId` (or a local `userId` variable) and deeper traversals like `ref.parent.parent.id` map to `event.params.parentId` or `event.params.parent3Id` in accordance with common nesting patterns. Existing destructured names will only be used if they match these generic defaults.

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
  const userId = change.after?.ref?.parent?.id; // ❌ Brittle: derives IDs from refs
  // ✅ Prefer: const { params: { userId } } = event;
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

### ✅ Correct (Generic names)

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

### ✅ Correct (Domain-specific params - manual)

Developers must manually name their parameters in the path template and destructure them if they want domain-specific names. The auto-fixer will not generate these names.

```typescript
export const nestedPathHandler: DocumentChangeHandler<
  GameData,
  GamePath
> = async (event) => {
  const {
    params: { gameId, tournamentId, roundId }
  } = event;

  const path = `Game/${gameId}/Tournament/${tournamentId}/Round/${roundId}`;
  await db.doc(path).get();
};
```

## Edge Cases Handled

### 1. Multi-Level Path Parameters

The rule maps each `ref.parent[.parent].id` access to generic parameter names by depth (userId, parentId, parent3Id).

### 2. Variable Assignment and Reuse

The rule detects variable assignment patterns:

```typescript
// ❌ Incorrect
const parentId = change.after.ref.parent.id;

// ✅ Correct
const { params: { userId } } = event;
```

### 3. Complex Reference Chains

The rule handles various patterns of parent reference access and always emits generic names by depth:

```typescript
// ❌ Incorrect
const grandparentId = change.after.ref.parent.parent.id;

// ✅ Correct (use the specific parameter)
const { params: { parentId } } = event;
```

### 4. Optional Chaining

The rule detects optional chaining variants and preserves them in the fix:

```typescript
// ❌ Incorrect
const maybeParentId = change.after?.ref?.parent?.id;

// ✅ Fixed to
const maybeParentId = event?.params?.userId;
```

## Benefits

- Keeps handlers aligned with the trigger path template when collections move or nesting changes
- Uses the typed `params` object instead of brittle reference traversal
- Makes parent ID usage readable without re-deriving it from document references
- Avoids redundant lookups on the reference chain

## When Not To Use It

Do not use this rule if:

- You are not using Firebase change handlers.
- The function is not typed as a supported handler.
- You need reference properties other than the parent ID.

## Related Rules

- `enforce-firestore-doc-ref-generic`
- `enforce-firestore-path-utils`

## Further Reading

- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Realtime Database Triggers](https://firebase.google.com/docs/functions/database-events)
