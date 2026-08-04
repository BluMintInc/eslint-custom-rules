# Enforce that Firestore type definitions extend Identifiable and match their folder name (`@blumintinc/blumint/enforce-identifiable-firestore-type`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Firestore documents must always expose an `id` to avoid ad-hoc `string` plumbing. This rule enforces that each `functions/src/types/firestore/<Name>/index.ts` file exports a type whose name matches the folder (`<Name>`) and that the type either extends `Identifiable` or includes an `id: string` field (directly or through `Resolve<...>`).

## Rule Details

This rule runs only on `functions/src/types/firestore/**/index.ts` and reports when:

- No exported type alias matches the containing folder name. Any local export form counts — `export type Connection = ...`, or a bare `type Connection = ...` paired with `export { Connection }` or `export type { Connection }`, in either order. A re-export that names another module (`export { Connection } from './other'`) does not, since it publishes that module's type rather than this file's.
- The matching type alias does not extend `Identifiable` and does not provide an `id: string` (including when wrapped in `Resolve<>` or through intersection types).

### Limitation: types reached through an import are not checked

The `Identifiable` check is syntactic and reads a single file. It follows the alias chain through local declarations, `Readonly<>`/`Resolve<>` wrappers and intersections, but it cannot see the shape of a type declared in another module.

When the chain ends at an imported type, the rule has no way to know whether that type intersects `Identifiable`, so it stays silent rather than asserting an absence it cannot prove:

```ts
// functions/src/types/firestore/Tournament/Participant/index.ts
import { Team } from '../Team'; // Team = Readonly<Resolve<Named & Identifiable & {...}>>

export type Participant<TTime = Timestamp> = Team<TTime>; // not reported
```

This applies to named, default, type-only and namespace-qualified (`Types.Team`) imports alike. The trade-off is deliberate: reporting here would force a type-theoretically redundant `Identifiable & Team<TTime>` on document types that already carry an `id`, and this plugin prefers a false negative to a false positive. A document type whose `id` arrives only through an import is therefore not enforced — verify it at the imported type's own definition, which the rule does check when that definition lives under `functions/src/types/firestore/**`.

The folder-name/export gate is unaffected: an alias reaching an imported type must still be named after its folder and be exported.

### Examples of **incorrect** code for this rule:

```ts
// functions/src/types/firestore/User/index.ts
export type Account = { email: string }; // ❌ name does not match folder and no id

export type User = {
  email: string;
  displayName: string;
}; // ❌ missing Identifiable or id field
```

### Examples of **correct** code for this rule:

```ts
// Name matches folder and extends Identifiable
export type User = Identifiable & {
  email: string;
  displayName: string;
};

// Wrapped in a utility but still includes id
export type User = Resolve<{
  id: string;
  email: string;
}>;

// Intersection that brings in Identifiable
type WithAudit = { createdAt: Timestamp; updatedAt: Timestamp };
export type User = WithAudit & Identifiable & { email: string };

// Identifiable arrives through an imported type: unknowable here, so accepted
import { Account } from '../Account';
export type User = Account;
```

## When Not To Use It

- Projects that do not follow the `functions/src/types/firestore/<Name>/index.ts` convention.
- Codebases that provide `id` via runtime augmentation rather than static typing (not recommended).

## Further Reading

- Internal pattern: `Identifiable` helper type for Firestore docs
