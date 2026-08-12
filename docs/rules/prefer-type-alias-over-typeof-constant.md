# Prefer named type aliases over `typeof` on same-file global constants; ensure types are declared before constants (`@blumintinc/blumint/prefer-type-alias-over-typeof-constant`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Use named type aliases instead of `typeof` on same-file top-level constants, and declare the alias before any constant that relies on it.

- Why: `typeof CONST` couples types to runtime values and spreads literal unions around. Define a named alias (e.g., `type StatusExceeding = 'exceeding'`) and reuse it to keep types stable and readable.
- Why ordering: Declare the alias first so readers see the type before the value that uses it.
- Scope: Applies only to same-file top-level `const` values with constant-like initializers. Imported values are ignored. `keyof typeof` patterns are allowed.
- Exemption boundary: the alias that names the constant's type is the remedy, so `type T = typeof CONST` and the wrappers that still derive the alias from the constant — `keyof`, element extraction, arrays, unions, intersections and utility application such as `Readonly<typeof CONST>` — are allowed. A `typeof` sitting in a member, index signature, function-type parameter, conditional branch, mapped-type constraint or type-parameter default inside an alias body is a use site and reports exactly like the same shape written on an interface or a function parameter.

## Rule Details

The rule reports in two situations:

1. You use `typeof CONST_NAME` on a same-file top-level `const` initialized with a constant-like value (literal, object literal, array literal, possibly with `as const`). Create a named alias (for example, `type StatusExceeding = 'exceeding'`) and reuse it instead of deriving the type from the value.
1. A constant’s explicit type annotation points to an alias declared later in the file. Declare the alias first so the type is visible before the value that depends on it.

### Incorrect

```ts
const STATUS_EXCEEDING = 'exceeding' as const;
const STATUS_SUCCEEDING = 'succeeding' as const;

function checkStatus(status: typeof STATUS_EXCEEDING | typeof STATUS_SUCCEEDING) {}

interface StatusProps {
  status: typeof STATUS_EXCEEDING;
}

type StatusPropsAlias = { status: typeof STATUS_EXCEEDING };

type StatusHandler = (status: typeof STATUS_EXCEEDING) => void;

// A utility wrapper does not shelter the member inside it
type FrozenStatusProps = Readonly<{ status: typeof STATUS_EXCEEDING }>;
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
const STATUS_EXCEEDING: StatusExceeding = 'exceeding';
const STATUS_SUCCEEDING: StatusSucceeding = 'succeeding';

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
- The alias that names the constant's type is allowed: `type T = typeof CONST`, plus the wrappers that still derive the alias straight from the constant — `keyof typeof CONST`, `(typeof CONST)[number]`, `(typeof CONST)[]`, utility application such as `Readonly<typeof CONST>` or `ValueOf<typeof CONST>`, and unions or intersections of those.

Utility application stays allowed so the rule converges: the remedy for a
reported `function f(x: Readonly<typeof CONST>)` is to name that type once as
`type T = Readonly<typeof CONST>`, and reporting the extracted alias would make
the remedy its own violation.

The exemption covers the alias's declared type and those wrappers only, and it
does not reach through a type literal: once the `typeof` moves into a slot inside
the alias body — an object member (including one inside a utility argument, as in
`Readonly<{ s: typeof CONST }>`), an index signature, a function-type parameter,
a conditional branch, a mapped-type constraint or a type-parameter default — it
reads as a use site and reports, the same way it does on an interface member or a
parameter annotation.

```ts
// Imported constants: allowed
import { API_BASE } from './config';
type TApi = typeof API_BASE;

// Imported types: allowed (and encouraged)
import type { SomeType } from './types';

// `keyof typeof`: allowed
const MAP = { a: 1, b: 2 } as const;
type Keys = keyof typeof MAP;

// The alias IS the constant's type: allowed
type MapShape = typeof MAP;
type FrozenMap = Readonly<typeof MAP>;

// Element extraction from a constant tuple: allowed
const MESSAGES = ['a', 'b'] as const;
type Message = (typeof MESSAGES)[number];

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

## When Not To Use It

If your project intentionally encodes literal value types via `typeof` against same-file constants and you prefer that style, you can disable this rule.

## Related Rules

- `extract-global-constants`
- `enforce-global-constants`
- `enforce-object-literal-as-const`
