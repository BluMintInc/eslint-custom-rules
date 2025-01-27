# Enforce using ImageOverlayed component instead of next/image or img tags (`@blumintinc/blumint/require-image-overlayed`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of the `ImageOverlayed` component from `src/components/ImageOverlayed` instead of using `next/image` or `img` tags directly.

## Rule Details

The `ImageOverlayed` component provides consistent image handling with overlay capabilities across the application.

Examples of **incorrect** code for this rule:

```jsx
import Image from 'next/image';

function Component() {
  return <Image src="/example.jpg" alt="Example" />;
}

function AnotherComponent() {
  return <img src="/example.jpg" alt="Example" />;
}
```

Examples of **correct** code for this rule:

```jsx
import ImageOverlayed from 'src/components/ImageOverlayed';

function Component() {
  return <ImageOverlayed src="/example.jpg" alt="Example" overlayText="Overlay Text" />;
}

import { ImageOverlayed as CustomImage } from 'src/components/ImageOverlayed';

function AnotherComponent() {
  return <CustomImage src="/example.jpg" alt="Example" overlayText="Overlay Text" />;
}
```

## Options

This rule has no configurable options.

## Config

This rule is enabled by default in the recommended configuration with the following settings:

```json
{
  "rules": {
    "@blumintinc/blumint/require-image-overlayed": "error"
  }
}
```

## componentPath

The rule enforces importing the `ImageOverlayed` component from `src/components/ImageOverlayed`. This path is hardcoded in the rule implementation and cannot be configured.
