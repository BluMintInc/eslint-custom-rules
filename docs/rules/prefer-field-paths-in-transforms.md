# Flatten transformEach aggregation updates to field paths to avoid destructive deletes (`@blumintinc/blumint/prefer-field-paths-in-transforms`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

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

#### ❌ Incorrect

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

#### ✅ Correct

```typescript
const strategy = {
  transformEach(doc) {
    return {
      [`matchesAggregation.matchPreviews.${doc.id}`]: doc.preview,
    };
  },
};
```

## Options

- `containers` (string[]): glob patterns for container keys to enforce. Default: `['*Aggregation', 'previews', '*Previews']`.
- `allowNestedIn` (string[]): glob patterns for file paths that may keep nested returns (e.g., one-off scripts or migrations).

## When not to use it

Disable or relax the rule only for controlled contexts such as migration scripts where you intentionally return nested structures; prefer scoping those files through `allowNestedIn` rather than turning the rule off globally.
