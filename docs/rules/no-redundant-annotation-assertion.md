# Disallow combining a type annotation with an identical type assertion on the same value. Keep a single source of truth to avoid redundant type declarations that can drift apart (`@blumintinc/blumint/no-redundant-annotation-assertion`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

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

An annotation is often the only reference to the type it names. Deleting it alone would leave that type bound to nothing, so a file that lints clean would fail `@typescript-eslint/no-unused-vars` afterwards — with a violation this rule cannot report, because its own finding is resolved by the fix. The annotation and anything it orphans therefore go as a single fix:

```ts
// Before: the annotation is the only consumer of the User import
import { User } from './types';
import { Person } from './person';

const user: User = raw as Person;

// After: the import goes with the annotation
import { Person } from './person';

const user = raw as Person;
```

Two limits keep the fix safe rather than clever:

- **Every annotation removed in the same pass is weighed together.** A type that two strippable annotations share is unbound once both of them go, even though neither is its last consumer on its own, so the removals ship as one fix rather than a removal at a time. An annotation whose report is suppressed stays out of that reckoning: it keeps its annotation, so it keeps the binding alive. Suppression is resolved before the batch is formed, because a rule cannot otherwise see `eslint-disable` — directives are applied to reports after they are emitted, and assuming a suppressed sibling will also go would delete an import the surviving annotation still references, trading an unused import for a type bound to nothing.
- **A binding that cannot be unbound cleanly cancels that annotation's fix.** The report then carries no fixer, and you resolve it by hand — by dropping the declaration or by using it. This covers a locally declared `type` alias or `interface`, a type parameter, a value declaration the annotation reads through `typeof` (a `const` or a `function` alike, since a declaration's own initializer does not count as a use of it), an import behind a `// eslint-disable-next-line` or `@ts-expect-error` directive, a comment sitting among the specifiers, and a name that another binding shadows. Such an annotation drops out of the batch without taking its siblings' fixes with it; only when the batch as a whole would orphan something unrewritable — two annotations sharing a local declaration, say — is the fix declined for all of them.

```ts
// The alias is declared here and named nowhere else, so the annotation stays
// and the report is left for you: deleting a declaration is your call.
type FormattedPart = { readonly year: number };

const result: FormattedPart = { year: parseYear() } as const;
```

A type that is exported, or still named elsewhere in the file, keeps its declaration and its autofix — nothing is orphaned by the removal.

### Not covered

- Destructuring patterns are intentionally ignored to avoid surprising edits.
- Optional properties (`?`) and definite assignment assertions (`!`) on class properties or variables are skipped to prevent syntax errors or unintended behavior changes.
- The rule only triggers when the annotation and assertion resolve to the **same** type; widening/narrowing pairs (e.g., `any` to `string`) are left untouched.
- Functions with multiple `return` statements are skipped because different branches can assert different types.
