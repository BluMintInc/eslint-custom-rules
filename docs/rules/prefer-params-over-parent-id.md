# Prefer handler params for parent IDs instead of traversing ref.parent.id (`@blumintinc/blumint/prefer-params-over-parent-id`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Walking the `ref.parent` chain to read an ID in Firebase change handlers makes the code brittle. This rule suggests using the typed `params` provided by the trigger instead.

## Why this rule?

- Path traversal via `ref.parent` assumes a fixed path depth; if the collection layout changes, the code breaks or reads the wrong segment.
- `event.params` provides named, typed segments that stay aligned with your trigger's path template.
- Using `params` makes the code self-documenting (e.g., `params.userId` vs `ref.parent.id`).

## Examples

### ❌ Incorrect

```ts
export const myHandler: DocumentChangeHandler<User> = async (event) => {
  // Reads ID via ref.parent traversal
  const userId = event.data.after.ref.parent.id;
};
```

Example message:

```text
This code reads an ID via ref.parent...id instead of using the trigger's params.

This rule is a suggestion; deep database paths sometimes require multiple hops if parameters are not available in the trigger event. If these hops are necessary, please use an // eslint-disable-next-line @blumintinc/blumint/prefer-params-over-parent-id comment. Otherwise, consider reading the ID from params.userId to make the code more resilient to path changes.
```

### ✅ Correct

```ts
export const myHandler: DocumentChangeHandler<User, { userId: string }> = async (event) => {
  const { params: { userId } } = event;
  // Access named parameter
};
```

### ✅ Correct (With disable comment if traversal is necessary)

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-params-over-parent-id
const parentId = ref.parent.id;
```

## Options

This rule does not have any options.

## When Not To Use It

Disable this rule if your trigger path does not capture the required segment as a parameter, or when working with legacy code where refactoring to use `params` is not feasible. Use an `// eslint-disable-next-line @blumintinc/blumint/prefer-params-over-parent-id` comment for local exceptions.
