# Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers (`@blumintinc/blumint/no-excessive-parent-chain`)

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Firestore and RealtimeDB triggers already surface typed path segments through `event.params`. Long `ref.parent` chains bypass those params and assume the collection layout never changes, which makes handlers brittle and difficult to follow. This rule reports handler code that walks more than two consecutive `ref.parent` hops and points developers toward the typed params they already receive.

## What this rule checks

- Applies only to handler functions typed as:
  - `DocumentChangeHandler`
  - `DocumentChangeHandlerTransaction`
  - `RealtimeDbChangeHandler`
  - `RealtimeDbChangeHandlerTransaction`
- Reports `ref.parent` chains longer than two consecutive hops inside those handlers, including when the event data is assigned to another variable.
- Ignores non-handler functions and member access unrelated to a `ref.parent` chain.

The rule allows up to two `.parent` hops for simple relative navigation; anything longer triggers a message explaining why the chain is risky and how to replace it with params-based access. The message template is:

```text
Found {{count}} consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.
```

## Options

- `max` (integer): Maximum number of consecutive `.parent` hops allowed before triggering a violation. Defaults to `2`.

```json
{
  "@blumintinc/blumint/no-excessive-parent-chain": ["error", { "max": 2 }]
}
```

## How to fix

- Prefer `event.params` for path data (for example, `const { userId } = event.params;`).
- Keep `ref.parent` usage to at most two hops when necessary (for example, walking to the immediate parent collection).
- When you see the lint message, replace the chained `ref.parent` access with the equivalent `params` lookup from the handler arguments.
- This rule provides editor suggestions that replace the entire parent chain with `<handlerParameter>.params`, named after the handler's actual parameter — a handler written as `async (e) => …` gets `e.params`, not `event.params`. Apply the suggestion via your editor's quick-fix menu.
- The suggestion keeps the property that followed the chain (for example `.id`) as a placeholder, because the rule cannot know which params key corresponds to a given ancestor level. Replace it with the intended key (for example `e.params.userId`) after applying.
- When the event binding has no identifier to reference — such as a handler destructured in its signature, `async ({ data: change }) => …` — the rule reports the chain but offers no suggestion rather than emitting an undefined name.

### The suggestion also removes a binding it leaves unused

Replacing the chain deletes the read that walked it, which can take away a binding's **last** use. The suggestion removes such a binding in the same edit, so accepting it never trades this rule's report for a `no-unused-vars` one:

- The whole declaration goes when it declares nothing else — `const { data: change } = event;` above `const path = change.after.ref.parent.parent.parent.key;` disappears with the rewrite.
- Only the orphaned property goes when the pattern binds something still in use — `const { data: change, params } = event;` becomes `const { params } = event;`.
- A declaration whose removal strands a further binding takes that one with it too, so a re-destructure (`const { data: change } = event; const { after } = change;`) is cleaned up in full.
- Nothing is removed while any reference survives the rewrite. A handler that also calls `change.before.data()` keeps its `const { data: change } = event;` exactly as written.
- Handler parameters are never removed: they are part of the function's signature.

The removal is declined — and with it the whole suggestion, leaving the chain reported but unfixed — whenever it cannot be proven safe: a `let` binding (which can be assigned from anywhere its scope reaches), a comment inside the declaration (the removal spans separators, so the comment would be swallowed), a rest element in the pattern (which absorbs whatever the pattern does not name), an initializer that is not a plain read, or a name whose occurrences inside the declaring scope do not all belong to the binding being removed.

## Examples

### Incorrect

```typescript
export const myHandler: DocumentChangeHandler<
  MyDataType,
  MyDataPath
> = async (event) => {
  const { data: change } = event;

  const uid = change.after.ref.parent.parent.parent.parent.id; // 4 parent calls - triggers warning
};

// Also catches when event data is extracted to variables
export const anotherHandler: DocumentChangeHandler<MyOtherDataType, MyOtherDataPath> = async (event) => {
  const change = event.data;
  const docId = change.after.ref.parent.parent.parent.id; // 3 parent calls - triggers warning
};
```

### Correct

```typescript
export const myHandler: DocumentChangeHandler<
  MyDataType,
  MyDataPath
> = async (event) => {
  const {
    data: change,
    params: { userId }, // Access path parameter directly from event params
  } = event;

  // Use params instead of walking parents
  await doSomething(userId);
};

// Short parent chains are allowed (up to 2 consecutive calls)
export const validHandler: DocumentChangeHandler<MyOtherDataType, MyOtherDataPath> = async (event) => {
  const { data: change } = event;
  const parentId = change.after.ref.parent.parent.id; // 2 parent calls - allowed
};

// Non-handler functions are not affected by this rule
export const regularFunction = async (docRef: DocumentReference) => {
  const ancestorId = docRef.parent.parent.parent.parent.id; // Not a handler - rule doesn't apply
};
```

## When Not To Use It

You might want to disable this rule if:

1. You're working with legacy code that extensively uses parent chains and cannot be refactored immediately
1. Your Firestore path structure is guaranteed never to change (rare)
1. You're in a non-handler context where `event.params` is not available (though the rule already ignores non-handler functions)

In these cases, you can disable the rule for specific files or lines:

```typescript
/* eslint-disable @blumintinc/blumint/no-excessive-parent-chain */
```

However, consider that leaving long parent chains unaddressed increases technical debt and fragility.

## Why This Rule Exists

1. **Type Safety & Resilience**: The `params` object is automatically generated from the trigger path, ensuring type-safe access. Path changes only require updating the trigger's path pattern; handlers using `params` remain valid, while long parent chains break at runtime.
2. **Explicit Intent & Clarity**: `params.userId` clearly communicates which path component is being accessed, making the code self-documenting, while long parent chains hide intent.
3. **Consistent Patterns**: Using `params` establishes a uniform, readable approach for accessing data across all database triggers.
4. **Alignment with Trigger Design**: `event.params` is typed from the trigger path, so using it keeps handlers aligned with declared routes rather than assuming collection layout.
