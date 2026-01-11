# Discourage excessive use of the ref.parent property chain in Firestore and RealtimeDB change handlers (`@blumintinc/blumint/no-excessive-parent-chain`)

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Walking the `ref.parent` chain repeatedly in Firestore or RealtimeDB change handlers makes the code brittle and hard to maintain. This rule suggests reading path components from `event.params` instead.

## Why this rule?

- Long parent chains break when database paths change, requiring manual updates to multiple hops.
- Reading from `event.params` provides named, typed parameters that are more resilient to schema changes.
- Parent chains bypass the structured path parameters that the trigger already provides.

## Examples

### ❌ Incorrect

```ts
export const myHandler: DocumentChangeHandler<User> = async (event) => {
  const { data: change } = event;
  // Brittle navigation using multiple parent calls
  const userId = change.after.ref.parent.parent.parent.id;
};
```

Example message:

```text
Found 3 consecutive ref.parent hops in this handler. This rule is a suggestion; deep database paths sometimes require multiple hops if parameters are not available in the trigger event. If these hops are necessary, please use an // eslint-disable-next-line @blumintinc/blumint/no-excessive-parent-chain comment. Otherwise, consider reading path components from event.params to make the code more resilient to path changes.
```

### ✅ Correct

```ts
export const myHandler: DocumentChangeHandler<User, { userId: string }> = async (event) => {
  const { params: { userId } } = event;
  // Access named parameter directly
};
```

### ✅ Correct (With disable comment if hops are necessary)

```ts
export const myHandler: DocumentChangeHandler<User> = async (event) => {
  const { data: change } = event;
  // eslint-disable-next-line @blumintinc/blumint/no-excessive-parent-chain
  const rootId = change.after.ref.parent.parent.parent.id;
};
```

## Options

This rule accepts an options object:

- `max`: (Default: `2`) Maximum number of consecutive `.parent` calls allowed before warning.

## When Not To Use It

Disable this rule if you are working with extremely deep database paths where the trigger event does not provide enough path parameters, or when refactoring to use `params` is not feasible. Use an `// eslint-disable-next-line @blumintinc/blumint/no-excessive-parent-chain` comment for local exceptions.

## Further Reading

- [Cloud Functions for Firebase: Trigger a function on data changes](https://firebase.google.com/docs/functions/firestore-events)
- [Firestore: DocumentReference.parent](https://firebase.google.com/docs/reference/node/firebase.firestore.DocumentReference#parent)
