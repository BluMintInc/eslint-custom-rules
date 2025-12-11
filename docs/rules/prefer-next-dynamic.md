# Prefer Next.js dynamic() over custom useDynamic() for component imports (`@blumintinc/blumint/prefer-next-dynamic`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Description

Enforce using Next.js `dynamic` for dynamically importing React components instead of custom `useDynamic` hooks. This promotes best practices, performance, and consistency in Next.js apps.

- **Why**: Next.js `dynamic` handles code-splitting, SSR control, and optimizations. Custom wrappers like `useDynamic` are discouraged.
- **Scope**: Flags only cases where `useDynamic(import(...))` results are used as React components (appear in JSX). Non-component dynamic imports are ignored.

## Rule Details

### Examples

Bad:

```ts
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;
// Note: If this value were never rendered as <EmojiPicker />, the rule would not flag it.
```

Good:

```ts
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);

const App = () => <EmojiPicker/>;
```

Named export:

```ts
import dynamic from 'next/dynamic';

const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);
```

### What this rule checks

- Any variable declaration of the form `const X = useDynamic(import('...'))` where `X` is later used as a JSX component is flagged.
- Destructuring (including aliases), e.g. `const { Picker: Emoji } = useDynamic(import('...'))`, is treated as importing a named export and fixed accordingly (binds the local `Emoji` to `mod.Picker`).
- If `dynamic` is not imported, an import is added: `import dynamic from 'next/dynamic';`.
- If `useDynamic` import becomes unused, it is removed (or the specifier is removed if there are other specifiers).

### Autofix behavior

- Replaces `useDynamic(import('lib'))` with:

```ts
const Component = dynamic(
  async () => {
    const mod = await import('lib');
    return mod.default; // or mod.NamedExport for destructured cases
  },
  { ssr: false }
);
```

- Adds `import dynamic from 'next/dynamic';` when not present.
- Removes `useDynamic` import when no longer used.

### Edge Cases / Notes

- **Non-Component Imports**: Skips when the variable is never used in JSX, avoiding false positives for utilities.
- **Named Exports**: When destructuring (e.g., `{ Picker }`), the fixer returns `mod.Picker`.
- **Incorrect dynamic usage**: The fixer ensures an async loader and applies `{ ssr: false }`.
- **Multiple declarators**: Safely replaces only the matching declarator in comma-separated declarations.

  Before:

  ```ts
  const { Picker }, other = useDynamic(import('@emoji-mart/react')), something = 1;
  ```

  After:

  ```ts
  const Picker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.Picker;
    },
    { ssr: false },
  );
  const something = 1;
  ```

### Options

- `useDynamicSources` (string[], optional): additional module specifiers to treat as `useDynamic` sources. Defaults to `["useDynamic","./useDynamic","../hooks/useDynamic","../../hooks/useDynamic"]`.

The fixer always passes `{ ssr: false }` to `dynamic()`; configuring other options (loading components, suspense, etc.) is not supported by this rule.

### Configuration

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-next-dynamic": "error"
  }
}
```

### When not to use

- Projects not using Next.js or intentionally using a custom dynamic wrapper should disable this rule.
