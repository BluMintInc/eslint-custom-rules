# Enforce Next.js dynamic over useDynamic (`@blumintinc/blumint/enforce-nextjs-dynamic`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce the use of Next.js built-in `dynamic` function instead of custom `useDynamic` hooks for dynamically importing components.

## Rule Details

Next.js provides a built-in `dynamic` function for dynamically importing components in an optimized manner. However, some codebases, including BluMint, may still use custom hooks like `useDynamic` for this purpose. This rule enforces the use of `dynamic` instead of `useDynamic` to ensure best practices, improved performance, and consistency within the codebase.

The rule automatically:
- Replaces `useDynamic` calls with `dynamic` calls
- Adds the necessary `import dynamic from 'next/dynamic'` if not already present
- Removes unused `useDynamic` imports
- Handles both default and named exports
- Adds appropriate configuration like `{ ssr: false }` for client-side components

### Examples

#### ❌ Incorrect

```js
import { useDynamic } from '../../hooks/useDynamic';

// Basic usage with default export
const EmojiPicker = useDynamic(import('@emoji-mart/react'));

// Named export destructuring
const { Picker } = useDynamic(import('@emoji-mart/react'));

// Multiple named exports
const { Picker, EmojiMart } = useDynamic(import('@emoji-mart/react'));
```

#### ✅ Correct

```js
import dynamic from 'next/dynamic';

// Basic usage with default export
const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);

// Named export
const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);

// Multiple named exports (creates separate dynamic imports)
const EmojiMart = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.EmojiMart;
  },
  { ssr: false }
);

const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);
```

## Why This Rule Exists

1. **Performance**: Next.js `dynamic` is optimized for the Next.js build system and provides better performance characteristics
2. **Consistency**: Using the standard Next.js approach ensures consistency across the codebase
3. **Maintenance**: Reduces dependency on custom hooks and leverages framework-provided functionality
4. **SSR Handling**: Next.js `dynamic` provides better server-side rendering control with options like `{ ssr: false }`

## Edge Cases Handled

### Non-Component Imports
The rule focuses on component imports and handles cases where `useDynamic` might be used for non-component imports.

### Incorrect Dynamic Usage
The rule ensures proper `dynamic` configuration by:
- Using async functions inside `dynamic`
- Explicitly setting `ssr: false` where appropriate
- Properly handling module resolution

### Import Cleanup
The rule automatically removes unused `useDynamic` imports from hooks directories once all occurrences have been replaced.

### Named Exports
The rule properly handles destructuring patterns and creates separate `dynamic` imports for each named export.

## When Not To Use It

This rule should generally always be enabled in Next.js projects. However, you might disable it if:
- You're not using Next.js
- You have a specific custom dynamic import system that provides benefits over Next.js `dynamic`
- You're in the process of migrating and need to temporarily allow both patterns

## Further Reading

- [Next.js Dynamic Imports](https://nextjs.org/docs/advanced-features/dynamic-import)
- [Code Splitting in Next.js](https://nextjs.org/docs/advanced-features/dynamic-import#with-named-exports)
- [React Code Splitting](https://reactjs.org/docs/code-splitting.html)
