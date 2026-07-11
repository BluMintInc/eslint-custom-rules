# Warn when transformEach in a propagation strategy returns nested object values instead of flat dot-notation keys (`@blumintinc/blumint/prefer-flat-transform-each-keys`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Warn when `transformEach` in a propagation strategy returns nested object values instead of flat dot-notation keys.

## Rule Details

In BluMint's Propagation System, `transformEach` maps a source document to a partial target document. The system diffs the "before" and "after" outputs via microdiff to produce Firestore `UpdateData`. When the source is deleted, microdiff diffs the transform result against `{}` and produces a single diff entry at the top-level key of any nested object. This means Firestore receives `FieldValue.delete()` at the parent key, wiping the entire sub-tree — including data contributed by other source documents.

Flat dot-notation keys (e.g., `'worthSummary.countUnpriceable': n`) produce leaf-level diffs so deletion removes only the specific entry this source document contributed. They also ensure `numericFieldPathConfig` path matching works correctly: `DifferenceBucket` compares diff paths by exact string equality, so a nested object that produces a path like `['worthSummary']` never matches a config key like `'worthSummary.countUnpriceable'`, silently converting increments to literal overwrites.

This rule is a **warning** rather than an error because ~10% of strategies legitimately own entire target documents (e.g., via `upsert` + `DELETE_TARGET`) and can safely use nested objects. Use `eslint-disable` with a comment explaining the intent for those cases.

### Exemptions

- **`resolveSelf` strategies** — self-propagation short-circuits on source deletion (the target IS the source, which no longer exists), so the parent-level `FieldValue.delete()` risk does not apply.
- **Computed or template-literal keys** — bracket-notation and template-literal keys represent dynamic leaf paths; their values may be any shape.
- **Dot-notation string keys** — if the key itself contains a dot (e.g., `'parent.child'`), the value is the leaf data at that path and may be any shape.
- **Non-strategy objects** — the rule only fires on objects that look like propagation strategies (those having `transformEach` alongside `resolveAll`, `queryResolveAll`, `numericFieldPathConfig`, `upsert`, or `sourceDeletionOverride`).
- **Factory-function references** — when `transformEach` is set to a call expression or variable reference rather than an inline function literal, the function body is not statically analyzable and the rule skips it.

### Examples

#### Incorrect

```typescript
// BAD: nested object under a simple key. On source deletion, microdiff
// produces FieldValue.delete() at 'worthSummary', wiping the whole sub-tree.
const strategy = {
  transformEach: ({ source }) => {
    const { priceable, countUnpriceable } = source.worthSummary;
    return {
      worthSummary: {
        priceable,
        countUnpriceable,
      },
    };
  },
  numericFieldPathConfig: {
    'worthSummary.countUnpriceable': 'FieldValue.increment',
  },
  resolveAll: resolveParentSkipRegistry,
};
```

```typescript
// BAD: nested object inside afterData wrapper.
const strategy = {
  transformEach: ({ source }) => ({
    afterData: {
      matchesAggregation: {
        matchPreviews: { [source.id]: source.preview },
      },
    },
    method: 'update',
  }),
  resolveAll: resolveParent,
};
```

#### Correct

```typescript
// GOOD: flat dot-notation keys. Deletion removes only this source's entries.
const strategy = {
  transformEach: ({ source }) => {
    const { priceable, countUnpriceable, countUnassured } = source.worthSummary;
    const result: Record<string, unknown> = {
      'worthSummary.countUnpriceable': countUnpriceable,
      'worthSummary.countUnassured': countUnassured,
    };
    for (const [id, estimate] of Object.entries(priceable)) {
      result[`worthSummary.priceable.${id}`] = estimate;
    }
    return result;
  },
  numericFieldPathConfig: {
    'worthSummary.countUnpriceable': 'FieldValue.increment',
    'worthSummary.countUnassured': 'FieldValue.increment',
  },
  resolveAll: resolveParentSkipRegistry,
};
```

```typescript
// GOOD: computed template-literal key — the value IS the leaf data.
const strategy = {
  transformEach: ({ sourceRef: { id } }) => ({
    [`cohortPreviews.${id}`]: { name: toCohortName(id) },
  }),
  resolveAll: resolveParent,
};
```

```typescript
// GOOD: resolveSelf strategy — exempt because self-propagation short-circuits on deletion.
const STATUS_STRATEGY = {
  transformEach: ({ source }) => ({
    roundsStatus: deriveTournamentStatus(source),
  }),
  resolveAll: resolveSelf,
};
```

## When to Disable

Disable with a comment when a strategy intentionally owns the entire target document and uses nested objects for structural completeness:

```typescript
// eslint-disable-next-line @blumintinc/blumint/prefer-flat-transform-each-keys -- This strategy owns the entire GuestlistMetadata document via upsert + DELETE_TARGET, so parent-level deletion is intentional.
transformEach: ({ source }) => ({
  afterData: {
    settings: source.settings,
    roundsAggregation: source.roundsAggregation,
  },
  method: 'upsert',
  sourceDeletionOverride: DELETE_TARGET,
}),
```
