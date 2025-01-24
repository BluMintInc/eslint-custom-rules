# Enforce using ImageOverlayed component instead of next/image or img tags (`@blumintinc/blumint/require-image-overlayed`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of the `ImageOverlayed` component instead of using `next/image` or HTML `img` tags directly.

## Rule Details

This rule aims to ensure consistent image handling across the application by requiring the use of a custom `ImageOverlayed` component.

Examples of **incorrect** code for this rule:

```jsx
import Image from 'next/image';

// Using next/image
<Image src="/path/to/image.jpg" alt="description" />

// Using HTML img tag
<img src="/path/to/image.jpg" alt="description" />
```

Examples of **correct** code for this rule:

```jsx
import ImageOverlayed from 'src/components/ImageOverlayed';

<ImageOverlayed src="/path/to/image.jpg" alt="description" />
```

## Options

This rule accepts an options object with the following properties:

```ts
interface Options {
  componentPath?: string;
}
```

### `componentPath`

The import path for the ImageOverlayed component.

- Type: `string`
- Default: `'src/components/ImageOverlayed'`

Example configuration:

```json
{
  "rules": {
    "@blumintinc/blumint/require-image-overlayed": ["error", {
      "componentPath": "@components/ImageOverlayed"
    }]
  }
}
```

## When Not To Use It

If you don't have a standardized image component or need to use native image elements for specific cases, you can disable this rule.

💼 This rule is enabled in the ✅ `