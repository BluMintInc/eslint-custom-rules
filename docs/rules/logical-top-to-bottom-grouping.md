# Enforce logical top-to-bottom grouping of related statements (`@blumintinc/blumint/logical-top-to-bottom-grouping`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

You keep related statements grouped in a logical, top-to-bottom order. You hoist guard clauses above skipped setup, place derived declarations next to their dependencies, keep placeholder declarations near their first use, and lift side effects (like logging) above unrelated initialization. Hook calls stay in place as boundaries so React's Rules of Hooks are preserved; you do not move non-hook statements across hook calls.

You only move placeholder declarations across pure declarations that do not reference the placeholder or its initializer, so closure timing and TDZ behavior remain unchanged.

## Rule Details

This rule rearranges statements inside a block to keep the execution flow readable and chronological.

### Examples of incorrect code for this rule:

```typescript
const { id } = props;
const { a } = props.group;
if (id == null) {
  return null;
}
const b = a;
```

```typescript
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const extra = readExtra();
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
const { id } = props;
if (id == null) {
  return null;
}

const { a } = props.group;
const b = a;
```

```typescript
const group = useGroupDoc();
const { groupTabState } = useGroupRouter();
const { id } = group || {};
const extra = readExtra();
```

```typescript
console.log('Processing started');

let results = [];
for (const item of items) {
  results.push(processItem(item));
}
```

## When Not To Use It

Disable this rule if you intentionally rely on non-linear ordering (e.g., staged startup logging for distributed tracing) or need to keep audit/compliance logging after initialization even when it breaks top-to-bottom grouping.

