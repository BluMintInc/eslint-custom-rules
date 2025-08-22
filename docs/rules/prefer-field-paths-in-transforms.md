# Prefer dot-path field updates in transforms to prevent parent-field deletes (`@blumintinc/blumint/prefer-field-paths-in-transforms`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces the use of dot-path field updates in propagation transforms to prevent destructive parent-field deletes. In propagation transforms (e.g., `transformEach` of a `PropagationStrategy`), returning nested objects like `{ a: { b: value } }` can cause destructive deletes when the source document is deleted.

The pipeline intentionally skips the "after" transform on deletions, so diffing "nested before" vs `{}` often yields a parent-level REMOVE (e.g., `a`). Firestore interprets that as `FieldValue.delete('a')`, which wipes the entire container.

This is particularly important for BluMint's aggregation patterns where we commonly aggregate child documents into shared parent containers (e.g., `matchesAggregation.matchPreviews`). Deleting one child must only remove its leaf entry; removing the whole container breaks other children.

## Examples

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

```ts
// Multiple nested levels
return {
  matchesAggregation: {
    matchPreviews: {
      [matchId]: {
        name: 'test',
        stage: 'active',
      },
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
// Multiple fields using dot-paths
return {
  [`matchesAggregation.matchPreviews.${matchId}.name`]: preview.name,
  [`matchesAggregation.matchPreviews.${matchId}.stage`]: preview.stage,
};
```

```ts
// Non-container fields can still be nested
return {
  userData: {
    profile: {
      name: 'test',
    },
  },
};
```

## Options

This rule accepts an options object with the following properties:

### `containers`

Type: `string[]`
Default: `["matchesAggregation", "groupAggregation", "previews", "Aggregation", "Previews"]`

An array of field name patterns to scope enforcement. The rule only flags nested objects under fields that match these patterns.

### `allowNestedIn`

Type: `string[]`
Default: `[]`

An array of file glob patterns where nested outputs are allowed (e.g., migration scripts).

### `severity`

Type: `"error" | "warn"`
Default: `"warn"`

The severity level for violations.

## Config

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-field-paths-in-transforms": [
      "warn",
      {
        "containers": ["matchesAggregation", "groupAggregation", "customContainer"],
        "allowNestedIn": ["**/migrations/**"],
        "severity": "warn"
      }
    ]
  }
}
```

## When Not To Use It

- If you're not using BluMint's propagation system
- In migration scripts or other contexts where parent deletion is intentional
- For `transformEachVaripotent` functions (which are excluded by design)

## Further Reading

- [BluMint Propagation Documentation](https://docs.blumint.io/propagation)
- [Firestore Field Path Documentation](https://firebase.google.com/docs/firestore/manage-data/add-data#update_fields_in_nested_objects)
