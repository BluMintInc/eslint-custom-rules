# Disallow redundant type annotations alongside identical type assertions (`@blumintinc/blumint/no-redundant-annotation-assertion`)

💼 This rule is enabled in the ✅ `recommended` config.\
🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).\
💭 This rule requires type information to compare annotation and assertion types.

<!-- end auto-generated rule header -->

## Rule Details

Developers occasionally combine a type annotation with a matching `as`/angle-bracket assertion on the same value. Doubling the same type leaves two sources of truth that can drift apart and obscures why a cast was needed in the first place. This rule flags that redundancy and removes the annotation so the cast remains the single, deliberate type declaration.

### Incorrect

```typescript
type ResultSummary = { id: string };
type DocumentReference<T> = { id: string; payload?: T };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';

// ❌ Redundant: annotation and assertion are the same
const docRef: DocumentReference<ResultSummary> =
  resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;
```

### Correct

```typescript
// ✅ Keep only one type source
const docRef =
  resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;

// ✅ Or drop the assertion if annotation is sufficient
const docRef: DocumentReference<ResultSummary> =
  resultSummaryCollectionRef.doc(teamId);
```

### Fixer behavior

The fixer removes the explicit type annotation and leaves the assertion intact, since assertions are typically the intentional part of the declaration.

### Not covered

- Destructuring patterns are intentionally ignored to avoid surprising edits.
- The rule only triggers when the annotation and assertion resolve to the **same** type; widening/narrowing pairs (e.g., `any` to `string`) are left untouched.
- Functions with multiple `return` statements are skipped because different branches can assert different types.
