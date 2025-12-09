# Prefer Next.js dynamic() over custom useDynamic() for component imports (`@blumintinc/blumint/prefer-next-dynamic`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Description

Enforce Next.js `dynamic()` for dynamically importing React components instead of a custom `useDynamic` hook.

- **Why**: `dynamic()` is the supported way to ship client-only components without server rendering and to let Next.js manage code-splitting. Custom wrappers bypass these guarantees and risk shipping server-only code to the client or vice versa.
- **Scope**: Only flags `useDynamic(import(...))` results that are used as JSX components. Non-component dynamic imports are intentionally ignored to avoid false positives.
- **Fix**: Converts the hook call to `dynamic(() => import(...), { ssr: false })`, ensures `dynamic` is imported, and drops the unused `useDynamic` import.

## Rule Details

### Examples
Bad:

```ts
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;
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
- Destructuring `const { Picker } = useDynamic(import('...'))` is treated as importing a named export and fixed accordingly.
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
- **Incorrect dynamic usage**: The fixer ensures an async loader and `{ ssr: false }` option are applied.
- **Multiple declarators**: Safely replaces only the matching declarator in comma-separated declarations.

### When not to use

- Projects not using Next.js or intentionally using a custom dynamic wrapper should disable this rule.

### Configuration

No options.

```json
{
  "rules": {
    "@blumintinc/blumint/prefer-next-dynamic": "error"
  }
}
```
