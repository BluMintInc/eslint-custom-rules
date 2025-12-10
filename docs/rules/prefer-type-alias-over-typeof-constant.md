# Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants (`@blumintinc/blumint/prefer-type-alias-over-typeof-constant`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Use named type aliases instead of `typeof` against same-file top-level constants and declare the alias before any constant that relies on it.

- Why: `typeof CONST` derives a type from a runtime value. When the value changes, the type changes too, and literal unions sprawl across the file. A named alias keeps the type stable, readable, and reusable.
- Why ordering: Declaring the alias before the constant makes the shape visible at the point of use and avoids referencing a not-yet-declared alias.
- Scope: Applies only to same-file top-level `const` values with constant-like initializers. Imported values are ignored. `keyof typeof` patterns are allowed.

## Rule Details

The rule reports in two situations:

1. A `typeof CONST_NAME` type reference targets a same-file top-level `const` initialized with a constant-like value (literal, object literal, array literal, possibly with `as const`). Create a named alias (e.g., `type StatusExceeding = 'exceeding'`) and reuse it instead of deriving the type from the value.
2. A constant uses an explicit type annotation whose alias is declared later in the file. Declare the alias before the constant so readers encounter the type first.

### Incorrect

```ts
const STATUS_EXCEEDING = 'exceeding' as const;
const STATUS_SUCCEEDING = 'succeeding' as const;

type StatusToCheck = typeof STATUS_EXCEEDING | typeof STATUS_SUCCEEDING;

function checkStatus(status: typeof STATUS_EXCEEDING | typeof STATUS_SUCCEEDING) {}
```

```ts
const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;

type StatusExceeding = 'exceeding'; // declared after the constant
```

### Correct

```ts
// Define types
type StatusExceeding = 'exceeding';
type StatusSucceeding = 'succeeding';

// Use types in constants
const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;
const STATUS_SUCCEEDING: StatusSucceeding = 'succeeding' as const;

// Reuse types
type StatusToCheck = StatusExceeding | StatusSucceeding;
function checkStatus(status: StatusToCheck) {}
```

### Allowed/Ignored Cases

- Imported constants: use of `typeof ImportedConst` is ignored in this rule’s scope.
- Imported types: using `import type { SomeType }` is encouraged and allowed.
- `keyof typeof CONST` patterns are allowed and not reported.
- `typeof` on functions/classes is allowed (this rule targets constant-like initializers).
- Inference using `as const` without explicit type is allowed.

## Options

This rule does not have options.

## When Not To Use It

If your project intentionally encodes literal value types via `typeof` against same-file constants and you prefer that style, you can disable this rule.

## Related Rules

- `extract-global-constants`
- `enforce-global-constants`
- `enforce-object-literal-as-const`
