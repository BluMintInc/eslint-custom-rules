# Prefer flattened field paths in propagation transforms (`@blumintinc/blumint/prefer-field-paths-in-transforms`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforces returning flattened dot-path keys (FieldPaths) from idempotent propagation transforms (e.g., `transformEach`). Nested objects like `{ a: { b: value } }` can cause destructive parent-level deletes when the source document is removed. Flattened keys ensure diffs target leaf keys precisely.

## Why

BluMint commonly aggregates child documents into shared parent containers (e.g., `matchesAggregation.matchPreviews`). Our pipeline intentionally skips the “after” transform on deletes, so diffing “nested before” vs `{}` often produces parent-level REMOVE operations (e.g., removing `a` entirely). Firestore interprets that as deleting the whole container, which breaks sibling children. Using flattened dot-path keys avoids this by diffing at the leaf.

## Rule Details

- Targets idempotent transform outputs (e.g., functions named `transformEach` in a propagation strategy).
- Does not target varipotent transforms (e.g., `transformEachVaripotent`).
- Warns when a transform returns object literals with nesting deeper than one level under configured container fields (e.g., `*Aggregation`, `*Previews`, `previews`).
- Encourages computed dot-path keys to address exact leaf paths.

### ❌ Incorrect

```ts
// In a propagation strategy transformEach
return {
  matchesAggregation: {
    matchPreviews: {
      [matchId]: matchPreview,
    },
  },
};
```

### ✅ Correct

```ts
// Use field paths (dot-notation) to target the exact leaf
return {
  [`matchesAggregation.matchPreviews.${matchId}`]: matchPreview,
};
```

```ts
// Multiple fields under the same container
return {
  [`matchesAggregation.matchPreviews.${matchId}.name`]: preview.name,
  [`matchesAggregation.matchPreviews.${matchId}.stage`]: preview.stage,
};
```

## Edge Cases

1) Intentional parent deletion
- If a parent container is exclusively owned by the source and deleting it is intended, disable inline:
```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-field-paths-in-transforms
return { matchesAggregation: { matchPreviews: {} } };
```

2) Arrays and array operations
- Arrays are handled by the diff’s array extraction. This rule focuses on nested object shapes under containers. Returning flattened keys that include array indices or leaf fields is valid.

3) Mixed outputs (nested + flattened)
- Only nested shapes under configured containers are flagged. Other top-level flattened keys in the same return are allowed.

4) Dynamic keys
- Computed dot-keys like ``[`matchesAggregation.matchPreviews.${matchId}`]`` are encouraged and not flagged.

5) Non-aggregation targets
- If a transform writes to fields that aren’t shared containers, the rule is silent by default. Scope can be configured via options.

## Options

```json
{
  "@blumintinc/blumint/prefer-field-paths-in-transforms": [
    "warn",
    {
      "containers": ["*Aggregation", "groupAggregation", "previews", "*Previews"],
      "allowNestedIn": ["**/scripts/**", "**/migrations/**"]
    }
  ]
}
```

- containers: string[] of field name patterns to scope enforcement. Defaults to `["*Aggregation", "previews", "*Previews"]`.
- allowNestedIn: string[] of file globs where nested outputs are allowed (e.g., migration scripts).

## When Not To Use It

- In codepaths where deleting entire parent containers is intentional (use inline disable comment).
- In varipotent transforms (`transformEachVaripotent`) which can be exempt by design.

## Additional Notes

- This rule aligns with BluMint’s type-system support: generics allow transforms to return either nested `Partial<TTarget>` or flattened `Partial<Flatten<TTarget>>`. This rule nudges developers toward flattened outputs for aggregation/sparse maps.
- Severity defaults to `warn` in the recommended config.