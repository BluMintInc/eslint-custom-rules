# Enforce using ImageOptimized component instead of next/image or img tags (`@blumintinc/blumint/require-image-optimized`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of the `ImageOptimized` component instead of using `next/image` or `img` tags directly.

## Rule Details

Use the shared `ImageOptimized` wrapper so every image goes through the same optimization pipeline—responsive sizing, lazy loading, and blur placeholders. Direct `img` tags or `next/image` imports bypass these defaults, making it easy to ship unoptimized assets that inflate payloads and harm Core Web Vitals. The rule is auto-fixable to swap the element or import to `ImageOptimized`.

Examples of **incorrect** code for this rule:

```jsx
import Image from 'next/image';
<Image src="/path/to/image.jpg" alt="description" />

// or
<img src="/path/to/image.jpg" alt="description" />
```

Examples of **correct** code for this rule:

```jsx
import Image from 'src/components/image/ImageOptimized';
<Image src="/path/to/image.jpg" alt="description" />
```

## Options

This rule accepts an options object with the following properties:

* `componentPath` - The import path for the ImageOptimized component (default: 'src/components/image/ImageOptimized')

Example configuration:

```json
{
  "rules": {
    "@blumintinc/blumint/require-image-optimized": ["error", {
      "componentPath": "src/components/image/ImageOptimized"
    }]
  }
}
```

## When Not To Use It

If you don't want to enforce using a specific image component across your codebase, you can disable this rule.
