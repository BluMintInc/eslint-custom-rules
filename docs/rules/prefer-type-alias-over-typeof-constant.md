# Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants (`@blumintinc/blumint/prefer-type-alias-over-typeof-constant`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Use named type aliases instead of `typeof` on same-file top-level constants, and declare the alias before any constant that relies on it.

- Why: `typeof CONST` couples types to runtime values and spreads literal unions around. Define a named alias (e.g., `type StatusExceeding = 'exceeding'`) and reuse it to keep types stable and readable.
- Why ordering: Declare the alias first so readers see the type before the value that uses it.
- Scope: Applies only to same-file top-level `const` values with constant-like initializers. Imported values are ignored. `keyof typeof` patterns are allowed.

## Rule Details

The rule reports in two situations:

1. You use `typeof CONST_NAME` on a same-file top-level `const` initialized with a constant-like value (literal, object literal, array literal, possibly with `as const`). Create a named alias (for example, `type StatusExceeding = 'exceeding'`) and reuse it instead of deriving the type from the value.
2. A constant’s explicit type annotation points to an alias declared later in the file. Declare the alias first so the type is visible before the value that depends on it.

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

```ts
// Imported constants: allowed
import { API_BASE } from './config';
type TApi = typeof API_BASE;

// Imported types: allowed (and encouraged)
import type { SomeType } from './types';

// `keyof typeof`: allowed
const MAP = { a: 1, b: 2 } as const;
type Keys = keyof typeof MAP;

// `typeof` on functions/classes: allowed
function make() {
  return { x: 1 };
}
type Maker = typeof make;
class Foo {}
type FooCtor = typeof Foo;

// Inference via `as const`: allowed
const STATUS = 'ok' as const; // no explicit type annotation needed
```

## Options

This rule has no options and is not auto-fixable.

## When Not To Use It

If your project intentionally encodes literal value types via `typeof` against same-file constants and you prefer that style, you can disable this rule.

## Related Rules

- `extract-global-constants`
- `enforce-global-constants`
- `enforce-object-literal-as-const`
