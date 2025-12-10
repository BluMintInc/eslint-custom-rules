# Enforce .dynamic.ts(x) file naming when @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports rule is disabled (`@blumintinc/blumint/enforce-dynamic-file-naming`)

<!-- end auto-generated rule header -->

This rule keeps exceptions to our dynamic import rules explicit. When you disable `@blumintinc/blumint/enforce-dynamic-imports` or `@blumintinc/blumint/require-dynamic-firebase-imports`, name the file with the `.dynamic.ts` or `.dynamic.tsx` suffix. The suffix tells reviewers that your static imports are intentional. The reverse also holds: if you choose a `.dynamic.ts(x)` filename, include a disable directive for one of those rules so the suffix is truthful signal rather than noise.

Why it matters:
- Static imports are a conscious escape hatch from dynamic-loading safeguards; the `.dynamic` suffix surfaces that choice for code reviewers and audit tools.
- A `.dynamic` filename without a matching disable directive suggests the file is exempt when it is not, causing confusion and masking places where dynamic-import protections should still run.
- Enforcing both directions prevents silent erosion of the dynamic-import convention and keeps static-import hotspots easy to find.

## Rule Details

The rule applies to `.ts` and `.tsx` files. It ignores other filename patterns (for example `*.test.ts`, `*.deprecated.ts`).

- If you disable `@blumintinc/blumint/enforce-dynamic-imports` or `@blumintinc/blumint/require-dynamic-firebase-imports`, name the file `*.dynamic.ts` or `*.dynamic.tsx`.
- If you name a file `*.dynamic.ts` or `*.dynamic.tsx`, include a disable directive for one of the two rules above.

Examples of **incorrect** code for this rule:

```tsx
// File: example.tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';
```

```ts
// File: example.ts
// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import { getAuth } from 'firebase/auth';
```

```ts
// File: example.ts
/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports */
import SomeFunction from './SomeFunction';
```

```tsx
// File: example.dynamic.tsx
import SomeModule from './SomeModule';
```

Examples of **correct** code for this rule:

```tsx
// File: example.dynamic.tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';
```

```ts
// File: example.dynamic.ts
// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import { getAuth } from 'firebase/auth';
```

```ts
// File: example.dynamic.ts
/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports */
import SomeFunction from './SomeFunction';
```

```ts
// File: example.ts
import SomeModule from './SomeModule';
```

This rule only enforces the `.dynamic` suffix contract. Whether a static import is allowed in the first place is governed by `@blumintinc/blumint/enforce-dynamic-imports`.

## When Not To Use It

You might consider turning this rule off if you do not use the `.dynamic.ts(x)` suffix to surface exceptions to dynamic-import enforcement, or if your project does not rely on the paired rules:

- `@blumintinc/blumint/enforce-dynamic-imports`
- `@blumintinc/blumint/require-dynamic-firebase-imports`

## Further Reading

- [enforce-dynamic-imports](./enforce-dynamic-imports.md)
- [require-dynamic-firebase-imports](./require-dynamic-firebase-imports.md)
