# Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers (`@blumintinc/blumint/no-excessive-parent-chain`)

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Firestore and RealtimeDB triggers already surface typed path segments through `event.params`. Long `ref.parent` chains bypass those params and assume the collection layout never changes, which makes handlers brittle and hard to follow. This rule reports handler code that walks more than two consecutive `ref.parent` hops and points developers toward the typed params they already receive.

## What this rule checks

- Applies only to handler functions typed as:
  - `DocumentChangeHandler`
  - `DocumentChangeHandlerTransaction`
  - `RealtimeDbChangeHandler`
  - `RealtimeDbChangeHandlerTransaction`
- Reports `ref.parent` chains longer than two consecutive hops inside those handlers, including when the event data is assigned to another variable.
- Ignores non-handler functions and member access unrelated to a `ref.parent` chain.

The rule allows up to two `.parent` hops for simple relative navigation; anything longer triggers a message explaining why the chain is risky and how to replace it with params-based access. The message template is:
`Found {{count}} consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.`

## Why this rule matters

- **Path drift creates runtime bugs**: A collection rename or nesting change invalidates every `ref.parent.parent.parent` chain and fails at runtime.
- **Params already hold the identifiers**: `event.params` is typed from the trigger path, so using it keeps handlers aligned with declared routes.
- **Intent is clearer**: `params.userId` communicates which path component is being read, while a long parent chain hides intent.
- **Consistent handler pattern**: Using params yields the same readable approach across all triggers.

## How to fix

- Prefer `event.params` for path data (for example, `const { userId } = event.params;`).
- Keep `ref.parent` usage to at most two hops when necessary (for example, walking to the immediate parent collection).
- When you see the lint message, replace the chained `ref.parent` access with the equivalent `params` lookup from the handler arguments.

## Examples

### Incorrect

```typescript
export const propagateOverwolfPlacement: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const { data: change } = event;

  // Brittle navigation using multiple parent calls
  const uid = change.after.ref.parent.parent.parent.parent.id;
};

// Also catches when event data is extracted to variables
export const anotherHandler: DocumentChangeHandler<SomeType, SomePath> = async (event) => {
  const change = event.data;
  const docId = change.after.ref.parent.parent.parent.id; // 3 parent calls - triggers warning
};
```

### Correct

```typescript
export const propagateOverwolfPlacement: DocumentChangeHandler<
  OverwolfUpdate,
  OverwolfUpdatePath
> = async (event) => {
  const {
    data: change,
    params: { userId }, // Access path parameter directly from event params
  } = event;

  // Use params instead of walking parents
  await doSomething(userId);
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
