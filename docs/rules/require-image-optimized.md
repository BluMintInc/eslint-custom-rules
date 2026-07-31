# Enforce using ImageOptimized component instead of next/image or img tags (`@blumintinc/blumint/require-image-optimized`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of the `ImageOptimized` component instead of using `next/image` or `img` tags directly.

## Rule Details

Use the shared `ImageOptimized` wrapper so every image goes through the same optimization pipeline—responsive sizing, lazy loading, and blur placeholders. Direct `img` tags or `next/image` imports bypass these defaults, making it easy to ship unoptimized assets that inflate payloads and harm Core Web Vitals. The rule is auto-fixable to swap the element or import to `ImageOptimized`.

### Examples of **incorrect** code for this rule:

```jsx
import Image from 'next/image';
<Image src="/path/to/image.jpg" alt="description" />

// or
<img src="/path/to/image.jpg" alt="description" />
```

### Examples of **correct** code for this rule:

```jsx
import Image from 'src/components/image/ImageOptimized';
<Image src="/path/to/image.jpg" alt="description" />
```

## Exemptions

Code that *implements* the wrapper has to reach for an image primitive, so it is
not a violation:

* The component's own module and its manual mock, matched by filename: any file
  whose name (extension stripped) equals the last segment of `componentPath`,
  which covers both `src/components/image/ImageOptimized.tsx` and
  `src/components/image/__mocks__/ImageOptimized.tsx`.
* Anything inside a `jest.mock` / `jest.doMock` / `jest.setMock` factory for that
  module, matched on the specifier's last segment so relative paths
  (`../image/ImageOptimized`) and `__mocks__` paths both qualify. A factory for
  any other module is still checked.

## Autofix

The `img` fix rewrites the element to `ImageOptimized`, and applies only when
that name already resolves to a value binding in the file — either imported
directly or under an alias, in which case the alias is reused:

```jsx
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
// <img src="/a.jpg" alt="A" />  ->  <CustomImage src="/a.jpg" alt="A" />
```

When nothing binds the component, the violation is reported without a fix.
Inserting an import would have to guess the module's canonical path, and a
rewrite to an unimported name leaves the file referencing an undefined
identifier.

The fix is likewise withheld when the name it would emit is shadowed at the
violation — by a local, a parameter, or a block-scoped binding enclosing the
`img`. The emitted element would resolve to that binding instead of the
component, which type-checks and strands no reference while silently rendering
the wrong thing:

```jsx
import ImageOptimized from 'src/components/image/ImageOptimized';
function Component() {
  const ImageOptimized = useFallbackImage();
  // reported, not fixed: <ImageOptimized /> here would be the local
  return <img src="/a.jpg" alt="A" />;
}
```

A binding of the same name in a sibling scope does not reach the violation, so
those fixes still apply, as does reuse of a module-scope binding such as
`const ImageOptimized = dynamic(() => import('...'))`.

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
