# Logical top-to-bottom grouping (`@blumintinc/blumint/logical-top-to-bottom-grouping`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keep related statements grouped in a logical, top-to-bottom order. The rule hoists guard clauses above skipped setup, places derived declarations next to their dependencies, keeps placeholder declarations near their first use, and lifts side effects (like logging) above unrelated initialization. Hook calls are left in place so React's Rules of Hooks are not broken.

## Rule Details

This rule rearranges statements inside a block to keep the execution flow readable and chronological.

### Examples of incorrect code for this rule:

```typescript
const { a } = props.group;
if (id !== null) {
  return null;
}
const b = a;
```

```typescript
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};
```

```typescript
let results = [];

console.log('Processing started');

for (const item of items) {
  results.push(processItem(item));
}
```

### Examples of correct code for this rule:

```typescript
if (id !== null) {
  return null;
}

const { a } = props.group;
const b = a;
```

```typescript
const group = useGroupDoc();
const { id } = group || {};
const { groupTabState } = useGroupRouter();
```

```typescript
console.log('Processing started');

let results = [];
for (const item of items) {
  results.push(processItem(item));
}
```

## When Not To Use It

Disable this rule if you intentionally rely on non-linear ordering for performance instrumentation or need to keep logging after initialization for audit requirements.

