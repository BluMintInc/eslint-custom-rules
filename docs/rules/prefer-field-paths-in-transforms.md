# Flatten aggregation updates inside transformEach so diff-based deletes remove only the intended fields instead of wiping sibling data (`@blumintinc/blumint/prefer-field-paths-in-transforms`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Propagation transforms often merge into shared aggregation containers. Returning nested objects under those containers causes diff-based apply steps to delete entire subtrees when any child is removed, which wipes sibling entries from other writers. Flattened field-path keys keep deletes scoped to the intended leaf and leave unrelated aggregation data intact.

## Rule Details

- Flags any `transformEach` that returns multi-level object literals under aggregation containers (default patterns: `*Aggregation`, `previews`, `*Previews`).
- Does not flag already-flattened dot-path keys or dynamic values that are not object literals.
- Allows opt-outs per file via the `allowNestedIn` option.

## Why this rule matters

- Nested objects trigger destructive deletes during diff reconciliation, wiping sibling aggregation entries.
- Field-path keys align with merge semantics, so only the targeted leaf changes.
- Flattening keeps aggregation writers independent and lowers the chance of accidental data loss when adding or removing items.

## Examples

### ❌ Incorrect

```typescript
const strategy = {
  transformEach(doc) {
    return {
      matchesAggregation: {
        matchPreviews: {
          [doc.id]: doc.preview,
        },
      },
    };
  },
};
```

### ✅ Correct

```typescript
const strategy = {
  transformEach(doc) {
    return {
      [`matchesAggregation.matchPreviews.${doc.id}`]: doc.preview,
    };
  },
};
```

## Edge Cases

1. Intentional parent deletion

   If a parent container is exclusively owned by the source and deleting it is intended, disable inline:

   ```ts
   // eslint-disable-next-line @blumintinc/blumint/prefer-field-paths-in-transforms
   return { matchesAggregation: { matchPreviews: {} } };
   ```

1. Arrays and array operations

   Arrays are handled by the diff’s array extraction. This rule focuses on nested object shapes under containers. Returning flattened keys that include array indices or leaf fields is valid.

1. Mixed outputs (nested + flattened)

   Only nested shapes under configured containers are flagged. Other top-level flattened keys in the same return are allowed.

1. Dynamic keys

   Computed dot-keys like ``[`matchesAggregation.matchPreviews.${matchId}`]`` are encouraged and not flagged.

1. Non-aggregation targets

   If a transform writes to fields that aren’t shared containers, the rule is silent by default. Scope can be configured via options.

## Options

```json
{
  "@blumintinc/blumint/prefer-field-paths-in-transforms": [
    "warn",
    {
      "containers": ["*Aggregation", "previews", "*Previews"],
      "allowNestedIn": ["**/scripts/**", "**/migrations/**"]
    }
  ]
}
```

- `containers`: glob patterns for container keys to enforce. Default: `["*Aggregation", "previews", "*Previews"]`.
- `allowNestedIn`: glob patterns for file paths that may keep nested returns (e.g., one-off scripts or migrations).

## When not to use it

Disable or relax the rule only for controlled contexts such as migration scripts where you intentionally return nested structures; prefer scoping those files through `allowNestedIn` rather than turning the rule off globally.
