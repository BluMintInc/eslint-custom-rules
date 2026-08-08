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

### Annotations that carry type information

Redundancy is only redundancy if the annotation can be deleted without changing what the file means. Two shapes look identical to a type-equality test yet are load-bearing, and both are left alone.

**A return type its own return expression depends on.** The equality that proves the annotation redundant holds only *while* the annotation is there: remove it and TypeScript has to infer the return type from an expression whose type is that same return type.

```ts
interface FakeQuery {
  orderBy: () => FakeQuery;
}

// The annotation is the only thing typing this function. Stripping it yields
// TS7023 ("implicitly has return type 'any' because it ... is referenced
// directly or indirectly in one of its return expressions"), or — where the
// assertion pins enough of the shape to break the cycle — silently widens
// `orderBy` to `() => any`.
function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => buildQuery() };
}
```

The self-reference is resolved through the type checker, so a shadowing local of the same name does not count, and a reference reached through `this.method()`, `obj.method()`, `obj['method']()`, or a function expression's own name does. Only **value** reads count: the returned expression contains the assertion's own type node, so a binding and a type that share a name (`type Status = …; const Status = (): Status => <Status>{…}`) would otherwise look self-referential. `typeof f` is the exception — it is a type position that reads a value, and it does resolve through the return type. The name a declaration gives *itself* is not a read of it, so a member's own name inside the returned literal is not a reference to that member.

Two mutually recursive functions are covered as one case: each types fine while the other keeps its annotation, and they only go circular because every removal in a file ships as a single fix.

The reach is **transitive**, matching TypeScript's own "referenced directly **or indirectly**". A cycle closes through whatever happens to lie on it, and what lies on it is usually not something this rule reports at all — an unannotated helper has no annotation to remove, an object holding a callback and a plain alias have no return type. Every declaration in the file whose type has to be *inferred* is therefore a link the walk can follow, functions and value bindings alike, and a chain of any length that returns to its start declines the annotation.

The walk stops at the first type that is written down. An annotated helper, a contextually typed binding (`const helper: () => Query = () => build()`), an annotated member of an object the cycle passes through, an ambient declaration: each answers what it is asked without consulting anything further, which is exactly what breaks a cycle. So a loop running through one of those is not a loop TypeScript has to resolve, and the annotation is still reported and still removed.

A link is a link whatever its spelling. A binding introduced by a destructuring pattern (`const { run } = …`), a parameter default (`function helper(seed = build())`), and a member declared under a computed key (`{ ['build']() {} }`) all relay a dependency, and all are nodes. The stop condition has one exception of its own: an annotation that reads a value through `typeof` (`function helper(): RT<typeof build>`) consults the candidate rather than answering independently, so it does not break the cycle.

The walk is a deliberate **over-approximation**, so it can still decline where TypeScript would have coped. A value binding is one node carrying its whole initializer's dependencies, so reading one member of an object literal inherits its unannotated siblings' — TypeScript resolves those members independently. A read in statement position counts the same as one on the return path. Both cost a missed report rather than a broken fix, which is the direction to err in.

**An `as const` assertion against a mutable annotation.** `as const` makes every member `readonly`, so it does not restate a mutable annotation — it narrows it. Deleting the annotation changes the value's type rather than deduplicating it.

```ts
// `conf` is `{ run: () => void }` here and `{ readonly run: () => void }`
// without the annotation, which turns the assignment below into TS2540.
const conf: { run: () => void } = { run: () => {} } as const;
conf.run = () => {};
```

An annotation that spells `readonly` itself still matches an `as const` assertion and is still reported: readonly-ness discriminates the two shapes, it does not exempt `as const`.

Readonly-ness is read wherever it lives, because it reaches a member three different ways and each one alone would look like a mutable member: a written `readonly` modifier, a *synthesized* one (`as const`, `Readonly<T>`), and a **getter with no setter**, which carries neither. **Index signatures** are compared too — readonly-ness does not affect their assignability in either direction, so a readonly index signature would otherwise match a mutable annotation and removing it would ship `TS2542: Index signature … only permits reading`. Matching shapes on any of these still report; the discriminator only separates ones that genuinely differ.

### Not covered

- Destructuring patterns are intentionally ignored to avoid surprising edits.
- Optional properties (`?`) and definite assignment assertions (`!`) on class properties or variables are skipped to prevent syntax errors or unintended behavior changes.
- The rule only triggers when the annotation and assertion resolve to the **same** type; widening/narrowing pairs (e.g., `any` to `string`) are left untouched.
- Functions with multiple `return` statements are skipped because different branches can assert different types.
- A return type that reaches itself through what it is inferred from, and an `as const` assertion under a mutable annotation, are left alone — see above.
