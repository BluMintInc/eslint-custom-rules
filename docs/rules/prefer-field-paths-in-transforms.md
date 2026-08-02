# Flatten aggregation updates inside transformEach so diff-based deletes remove only the intended fields instead of wiping sibling data (`@blumintinc/blumint/prefer-field-paths-in-transforms`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Propagation transforms often merge into shared aggregation containers. Returning nested objects under those containers causes diff-based apply steps to delete entire subtrees when any child is removed, which wipes sibling entries from other writers. Flattened field-path keys keep deletes scoped to the intended leaf and leave unrelated aggregation data intact.

## Rule Details

- Flags any `transformEach` that returns multi-level object literals under aggregation containers (default patterns: `*Aggregation`, `previews`, `*Previews`).
- Does not flag already-flattened dot-path keys or dynamic values that are not object literals.
- Sees through type assertions (`as const`, `as T`, `satisfies T`, `!`, `<T>x`) wherever they wrap the returned object, a container value or a nested value. An assertion changes no runtime value, so the write it produces is just as destructive.
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

An assertion on the returned object does not make the nested write safe, so it is flagged the same way:

```typescript
const STRATEGY = {
  transformEach(doc) {
    return {
      matchesAggregation: {
        matchPreviews: {
          [doc.id]: doc.preview,
        },
      },
    } as const;
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

1. Type assertions

   `enforce-object-literal-as-const` ships in the same `recommended` config and is fixable, so `eslint --fix` appends `as const` to exactly the literals this rule inspects. Assertions are therefore treated as transparent: the shape underneath is what gets judged, whether the wrapper sits on the returned object, on a container value, on a nested value, or on the transform function itself. Assertions nest (`as const satisfies T`), and every layer is stripped. A wrapper that hides a non-object — `matchesAggregation: updates as Updates` — is still not an object literal, so the rule stays silent.

## Options

```json
{
  "@blumintinc/blumint/prefer-field-paths-in-transforms": [
    "error",
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
