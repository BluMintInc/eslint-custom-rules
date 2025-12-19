# Enforce that Firestore type definitions extend Identifiable and match their folder name (`@blumintinc/blumint/enforce-identifiable-firestore-type`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Firestore documents must always expose an `id` to avoid ad-hoc `string` plumbing. This rule enforces that each `functions/src/types/firestore/<Name>/index.ts` file exports a type whose name matches the folder (`<Name>`) and that the type either extends `Identifiable` or includes an `id: string` field (directly or through `Resolve<...>`).

## Rule Details

This rule runs only on `functions/src/types/firestore/**/index.ts` and reports when:

- No exported type alias matches the containing folder name.
- The matching type alias does not extend `Identifiable` and does not provide an `id: string` (including when wrapped in `Resolve<>` or through intersection types).

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
```

## Options

This rule does not have any options.

## When Not To Use It

- Projects that do not follow the `functions/src/types/firestore/<Name>/index.ts` convention.
- Codebases that provide `id` via runtime augmentation rather than static typing (not recommended).

## Further Reading

- Internal pattern: `Identifiable` helper type for Firestore docs
