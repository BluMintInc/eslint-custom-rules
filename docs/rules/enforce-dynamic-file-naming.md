# Enforce .dynamic.ts(x) file naming when @blumintinc/blumint/enforce-dynamic-imports or @blumintinc/blumint/require-dynamic-firebase-imports rule is disabled (`@blumintinc/blumint/enforce-dynamic-file-naming`)

<!-- end auto-generated rule header -->

This rule ensures that when the `@blumintinc/blumint/enforce-dynamic-imports` rule is disabled, the file's name reflects that it contains static imports instead of dynamic ones. Specifically, if the rule is disabled for a particular line, the file must end in `.dynamic.tsx` or `.dynamic.ts` instead of just `.tsx` or `.ts`. Conversely, if a file ends in `.dynamic.tsx` or `.dynamic.ts`, it must contain at least one instance of `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports` or `/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports */`.

## Rule Details

This rule improves code clarity and helps enforce consistent naming conventions across the codebase. It applies only to `.ts` and `.tsx` files. Any file with other extensions (e.g., `.test.ts`, `.deprecated.ts`) is ignored.

Examples of **incorrect** code for this rule:

```tsx
// File: example.tsx
// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';
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
/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports */
import SomeFunction from './SomeFunction';
```

## When Not To Use It

You might consider turning this rule off if you don't care about the naming convention for files that disable the `@blumintinc/blumint/enforce-dynamic-imports` rule.

## Further Reading

- [enforce-dynamic-imports](./enforce-dynamic-imports.md)
