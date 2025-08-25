# Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants (`@blumintinc/blumint/prefer-type-alias-over-typeof-constant`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce defining and using named type aliases instead of `typeof` on same-file global constants. Also ensures the type alias is declared before constants using it.

- Why: Using `typeof CONST` couples types to value declarations and spreads literal types around the codebase. Defining a named type (e.g., `type StatusExceeding = 'exceeding'`) and reusing it improves readability, reusability, and avoids accidental drift.
- Scope: Applies only to constants defined in the same file. Imported values are ignored. `keyof typeof` patterns are allowed.

## Rule Details

This rule reports when a `typeof CONST_NAME` type reference is used and `CONST_NAME` is a same-file top-level `const` initialized with a constant-like value (literal, object literal, array literal, possibly with `as const`). Use a named type alias instead, e.g., `StatusExceeding`.

The rule also reports when a constant’s explicit type annotation refers to a type alias that is declared later in the file. Declare the type alias first, then the constant.

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
