# Enforce logical top-to-bottom grouping of related statements (`@blumintinc/blumint/logical-top-to-bottom-grouping`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keeping related statements grouped together makes code easier to scan and helps readers follow the logical flow. This rule suggests grouping guard clauses, derived variables, and side effects so the execution order remains obvious.

## Why this rule?

- Scattered dependencies increase cognitive load; you have to scroll to find where a value was declared or used.
- Late guard clauses can lead to unnecessary work being performed.
- Grouping related logic clarifies the input-to-output flow of a function or block.

## Examples

### ❌ Incorrect

```ts
const { id } = props;
const { a } = props.group;
if (id == null) {
  return null;
}
const b = a;
```

Example message for guard clause:

```text
The guard "id == null" appears after setup it can skip. This rule is a suggestion; grouping logic is subjective and evaluation order might be intentional. If this order is correct, please use an // eslint-disable-next-line @blumintinc/blumint/logical-top-to-bottom-grouping comment. Otherwise, consider placing the guard before the setup it protects.
```

### ✅ Correct

```ts
const { id } = props;
if (id == null) {
  return null;
}
const { a } = props.group;
const b = a;
```

### ✅ Correct (With disable comment if grouping is intentional)

```ts
function process(data) {
  setupWork();
  // eslint-disable-next-line @blumintinc/blumint/logical-top-to-bottom-grouping
  if (debugMode) log(data);
  mainLogic(data);
}
```

## When Not To Use It

Disable this rule if you prefer a different organizational style for your logic or if the rule's suggestions conflict with specific evaluation requirements. Use an `// eslint-disable-next-line @blumintinc/blumint/logical-top-to-bottom-grouping` comment for local exceptions.

## Further Reading

- [Clean Code: Vertical Density](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter05.html#ch5lev1sec4)
- [Refactoring: Slide Statements](https://refactoring.com/catalog/slideStatements.html)
