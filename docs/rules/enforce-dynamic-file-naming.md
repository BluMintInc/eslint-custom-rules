# Enforce .dynamic.ts(x) file naming when @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports rule is disabled (`@blumintinc/blumint/enforce-dynamic-file-naming`)

<!-- end auto-generated rule header -->

This rule keeps exceptions to our dynamic import rules explicit. When a file disables `@blumintinc/blumint/enforce-dynamic-imports` or `@blumintinc/blumint/require-dynamic-firebase-imports`, the filename must carry the `.dynamic.ts` or `.dynamic.tsx` suffix. The suffix signals to reviewers that static imports are intentional. The reverse also holds: any `.dynamic.ts(x)` file must include a disable directive for one of those rules, otherwise the suffix is misleading noise.

Why it matters:
- Static imports are a conscious escape hatch from dynamic-loading safeguards; the `.dynamic` suffix surfaces that choice for code reviewers and audit tools.
- A `.dynamic` filename without a matching disable directive suggests the file is exempt when it is not, causing confusion and masking places where dynamic-import protections should still run.
- Enforcing both directions prevents silent erosion of the dynamic-import convention and keeps static-import hotspots easy to find.

## Rule Details

The rule applies to `.ts` and `.tsx` files. It ignores other extensions (for example `.test.ts`, `.deprecated.ts`).

- If a file disables `@blumintinc/blumint/enforce-dynamic-imports` or `@blumintinc/blumint/require-dynamic-firebase-imports`, it must be named `*.dynamic.ts` or `*.dynamic.tsx`.
- If a file is named `*.dynamic.ts` or `*.dynamic.tsx`, it must contain a disable directive for one of the two rules above.

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

## When Not To Use It

You might consider turning this rule off if you do not use the `.dynamic.ts(x)` suffix to surface exceptions to dynamic-import enforcement, or if your project does not rely on the paired rules:

- `@blumintinc/blumint/enforce-dynamic-imports`
- `@blumintinc/blumint/require-dynamic-firebase-imports`

## Further Reading

- [enforce-dynamic-imports](./enforce-dynamic-imports.md)
- [require-dynamic-firebase-imports](./require-dynamic-firebase-imports.md)
