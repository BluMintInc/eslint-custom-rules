# Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers (`@blumintinc/blumint/no-excessive-parent-chain`)

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

This rule helps enforce better practices in Firestore and RealtimeDB change handlers by discouraging excessive use of the `ref.parent` property chain. When developers need to access parent/ancestor documents in Firestore paths, they often use multiple chained `.parent` calls (e.g., `ref.parent.parent.parent`), which is error-prone, difficult to read, and fragile to refactoring. Instead, handlers should access path parameters via the `params` object provided in the event parameter, which offers a type-safe, more maintainable approach to accessing path components.

## Rule Details

This rule is aimed at preventing long chains of `.parent` calls in Firestore and RealtimeDB change handlers. It only applies to functions that are typed as one of the following handler types:

- `DocumentChangeHandler`
- `DocumentChangeHandlerTransaction`
- `RealtimeDbChangeHandler`
- `RealtimeDbChangeHandlerTransaction`

The rule allows up to 2 consecutive `.parent` calls before raising a warning, as this is often reasonable for simple relative path navigation.

## Options

This rule has no options. The maximum allowed consecutive `.parent` calls is fixed at `2`.

Examples of **incorrect** code for this rule:

```typescript
export const propagateOverwolfPlacement: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const { data: change } = event;
  const { gameId: overwolfGameId, data } = change.after.data() || {};

  // Brittle navigation using multiple parent calls
  const uid = change.after.ref.parent.parent!.parent.parent!.id;

  // Rest of the handler implementation...
};

// Also catches when event data is extracted to variables
export const anotherHandler: DocumentChangeHandler<SomeType, SomePath> = async (event) => {
  const change = event.data;
  const docId = change.after.ref.parent.parent.parent.id; // 3 parent calls - triggers warning
};
```

Examples of **correct** code for this rule:

```typescript
export const propagateOverwolfPlacement: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const {
    data: change,
    params: { userId } // Access path parameter directly from event params
  } = event;
  const { gameId: overwolfGameId, data } = change.after.data() || {};

  // Rest of the handler implementation using userId...
};

// Short parent chains are allowed (up to 2 consecutive calls)
export const validHandler: DocumentChangeHandler<SomeType, SomePath> = async (event) => {
  const { data: change } = event;
  const parentId = change.after.ref.parent.parent.id; // 2 parent calls - allowed
};

// Non-handler functions are not affected by this rule
export const regularFunction = async (docRef: DocumentReference) => {
  const ancestorId = docRef.parent.parent.parent.parent.id; // Not a handler - rule doesn't apply
};
```

This rule is not auto-fixable; violations must be corrected manually.

## Why This Rule Exists

### Problems with Long Parent Chains

1. **Fragility**: Changes to the Firestore path structure can break multiple chained `.parent` calls.
2. **Readability**: Long chains like `ref.parent.parent.parent.parent` are difficult to comprehend.
3. **Type Safety**: Manual navigation doesn't provide compile-time guarantees about path structure.
4. **Maintainability**: Refactoring path structures requires updating all hardcoded parent chains.

### Benefits of Using Params

1. **Type Safety**: The `params` object is automatically generated based on the path pattern and provides type-safe access
2. **Maintainability**: Path changes only require updating the path pattern, not individual handlers
3. **Clarity**: `params.userId` is much clearer than `ref.parent.parent.parent.id`
4. **Consistency**: All handlers use the same pattern for accessing path components.
