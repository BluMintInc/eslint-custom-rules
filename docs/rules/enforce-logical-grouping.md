# enforce-logical-grouping

Enforces a logical, top-to-bottom grouping of code, prioritizing readability and maintainability. This rule helps organize code by ensuring related declarations and statements are grouped together in a logical flow.

## Rule Details

This rule aims to improve code readability by enforcing:
- Early returns at the top of the function
- Related declarations grouped together
- Logical ordering of side effects
- Proper handling of React Hooks and closures

### ✅ Correct Code Examples

```ts
// Early returns before other code
if (id !== null) {
  return null;
}
const a = props.group;
const b = a;

// Related declarations grouped together
const group = useGroupDoc();
const { id } = group || {};

const { groupTabState } = useGroupRouter();

// Logical order with side effects
console.log('Processing started');

let results = [];
for (const item of items) {
  results.push(processItem(item));
}

// Function expressions with dependencies
const userId = getUserId();
const handler = (x: number) => {
  return x + userId;
};
console.log(handler(10));
```

### ❌ Incorrect Code Examples

```ts
// Early return after dependent code
const { a } = props.group;
if (id !== null) {
  return null;
}
const b = a;

// Related declarations scattered
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};

// Side effects after dependent code
let results = [];
console.log('Processing started');
for (const item of items) {
  results.push(processItem(item));
}

// Function expressions before dependencies
const handler = (x: number) => {
  return x + 1;
};
const userId = getUserId();
console.log(handler(10));
```

## Rule Options

This rule has no options.

## When Not To Use It

You might want to disable this rule if:
- Your codebase has a different preferred organization style
- You're working with code that requires a specific order for technical reasons
- You're dealing with complex initialization patterns that don't fit the standard top-to-bottom flow

## Version

This rule was introduced in version 1.0.0
