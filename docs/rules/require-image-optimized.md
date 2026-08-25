# Enforce using ImageOptimized component instead of next/image or img tags (`@blumintinc/blumint/require-image-optimized`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of the `ImageOptimized` component instead of using `next/image` or `img` tags directly.

## Rule Details

Use the shared `ImageOptimized` wrapper so every image goes through the same optimization pipeline—responsive sizing, lazy loading, and blur placeholders. Direct `img` tags or `next/image` imports bypass these defaults, making it easy to ship unoptimized assets that inflate payloads and harm Core Web Vitals. The rule is auto-fixable to swap the element or import to `ImageOptimized`.

On the import side the rule matches the *binding*, not the local name: `next/image`'s default export is the `Image` component whatever it is bound to, so `import Img from 'next/image'` and `import { default as Picture } from 'next/image'` are the same violation as `import Image from 'next/image'`. `next/image`'s other exports — `getImageProps`, the prop types — are not the optimization bypass and are left alone.

### Examples of **incorrect** code for this rule:

```jsx
import Image from 'next/image';
<Image src="/path/to/image.jpg" alt="description" />

// the same binding under another name
import Img from 'next/image';
import { default as Picture } from 'next/image';

// or
<img src="/path/to/image.jpg" alt="description" />
```

### Examples of **correct** code for this rule:

```jsx
import Image from 'src/components/image/ImageOptimized';
<Image src="/path/to/image.jpg" alt="description" />

// non-component exports of next/image
import { getImageProps } from 'next/image';

// a type-only binding renders nothing
import type NextImage from 'next/image';
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
* Anything lexically inside the declaration that *defines* the component —
  `const ImageOptimized = ...` (including a `memo(...)` / `forwardRef(...)`
  wrapper), `function ImageOptimized()`, `export default function
  ImageOptimized()` and `class ImageOptimized` — plus any helper nested inside
  it. The definition can live in a file named anything, so the filename check
  alone does not cover it, and rewriting its `img` would make the component
  render itself: unbounded recursion, and a type error too, since the wrapper
  forwards only the props it destructured. A declaration exported under the
  component's name (`export { Picture as ImageOptimized }`) is the same
  definition written differently and is exempt as well.

  The declaration name is matched exactly, so a distinct component that merely
  shares the prefix (`ImageOptimizedGallery`) — or any other component that
  happens to render an `img` — is still reported.

A type-only import of `next/image`'s component is exempt for a different reason:
it binds no value, so it renders nothing and routes no asset around the
pipeline. That covers both the declaration-level modifier and the
specifier-level one:

```ts
import type Image from 'next/image';
import type { default as Picture } from 'next/image';
import { type Image as NextImage } from 'next/image';
```

A namespace import (`import * as NextImage from 'next/image'`) is out of scope:
it binds the module rather than the component, and is consumed through a member
expression (`<NextImage.default />`) the fix has no shape for.

## Autofix

The `img` fix rewrites the element to `ImageOptimized`, and applies only when
that name already resolves to a value binding in the file — either imported
directly or under an alias, in which case the alias is reused:

```jsx
import { ImageOptimized as CustomImage } from '../image/ImageOptimized';
// <img src="/a.jpg" alt="A" />  ->  <CustomImage src="/a.jpg" alt="A" />
```

Only the tag name is rewritten. Every attribute — and every line break, comment
and space between attributes — is carried over byte for byte, so an element
prettier expanded over several lines keeps that shape and a one-line element
stays on one line:

```jsx
// <img                         ->  <ImageOptimized
//   src="/example.jpg"         //    src="/example.jpg"
//   alt="Example gallery item" //    alt="Example gallery item"
//   width={480}                //    width={480}
// />                           //  />
```

Preserving the input's layout is what keeps the output print-width clean in both
directions. Joining the attributes onto one line overflows by an amount that
grows with the attribute count, while expanding a short list unconditionally is
equally wrong, since prettier folds a needlessly expanded attribute list back
onto one line.

An explicit closing tag has no counterpart on the component, so `<img ...></img>`
becomes self-closing: ` />` takes the place the `>` occupied, which leaves it on
its own line when the attribute list is expanded and beside the last attribute
when it is not.

The one thing the rename does change is the line's width: `ImageOptimized` is
twelve columns wider than `img`, so a one-line element near the print width no
longer fits once it is swapped. Where prettier's answer to that is to
parenthesize the element on a line of its own, the fix writes that layout
instead of leaving a line prettier rewrites on sight. Measured at prettier's
default 80 columns, that is the element standing as the whole value of a
`return`, an initializer, an assignment or an `export default`, or as the
concise body of an arrow in one of those places — including an arrow that is
the sole argument of a call, which prettier hugs (`memo(() => (`), and the
value of a property in an object already broken across lines:

```jsx
// export const Gallery = () => <img src="/example.jpg" alt="Example" />;
export const Gallery = () => (
  <ImageOptimized src="/example.jpg" alt="Example" />
);
```

The measurement follows prettier's: an element that still fits stays flat, a
trailing `//` comment is a suffix that never counts, and a trailing block
comment occupies columns and can tip the line over by itself. Everywhere else
the tag is renamed in place — a child of another element, a conditional
branch, an attribute value, a call argument prettier does not hug, and an
element that would overflow even on a line of its own, where prettier breaks
the attribute list next. That last shape is only writable by rebuilding the
list, and a rebuild owns every byte between the attributes, comments included,
so the input's layout is preserved there and the re-layout left to prettier.

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

The `next/image` fix repoints only the specifier that binds the component,
keeping its local name so every usage site stays valid. Sibling specifiers stay
on `next/image`, because `next/image` is where their bindings come from — the
wrapper does not re-export them — so the import splits in two rather than being
rewritten wholesale:

```ts
import Image, { ImageProps } from 'next/image';
// becomes
import { ImageProps } from 'next/image';
import Image from 'src/components/image/ImageOptimized';
```

Each surviving specifier is carried over verbatim, alias and `type` modifier
included. Dropping them would strand references that are still live and break
the build.

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
