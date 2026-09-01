# Enforce using src/components/Link instead of next/link (`@blumintinc/blumint/use-custom-link`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Use the shared `src/components/Link` wrapper instead of importing `next/link` directly. The wrapper centralizes design system defaults, analytics hooks, and navigation safeguards. Bypassing it with `next/link` leads to inconsistent styling, missing instrumentation, and navigation paths that skip our shared behavior.

### What the rule reports

- Any default import (including `default as`) sourced from `next/link`.
- The rule provides an autofix that rewrites the import to `src/components/Link` while preserving the local name.

### The autofix is declined when it would drop a binding

The fix rebuilds the declaration from the default binding alone, so an import
that also carries named or namespace specifiers has no fix offered — rewriting
it would delete those specifiers and leave every reference to them dangling:

```tsx
// Reported, but NOT auto-fixed: rewriting would delete `LinkProps`, while
// `export type { LinkProps }` keeps the exported name that no longer resolves.
import Link, { LinkProps } from 'next/link';

export type { LinkProps };
```

Relocating the extra specifiers to the wrapper is not a safe substitute, because
whether the wrapper re-exports any given one is not knowable from the import
site — carrying them over would trade a silent dangling binding for a
possibly-unresolvable import. Migrate these by hand: move the specifiers you
still need to whichever module actually exports them, then update the default
import.

## Examples

### Examples of **incorrect** code for this rule:

```tsx
import Link from 'next/link';

import { default as NextLink } from 'next/link';
```

### Examples of **correct** code for this rule:

```tsx
import Link from 'src/components/Link';

import { default as NextLink } from 'src/components/Link';
```

## The wrapper's implementation files are exempt

Two modules have to keep importing `next/link`, so the rule never reports inside
them:

- `src/components/Link` — the module the fixer points every other import at.
  Rewriting it makes it import itself, and a self-import evaluates circularly, so
  the wrapper exports `undefined` and every consumer of it breaks.
- Any `NextLinkComposed.{ts,tsx,js,jsx}` — the component from MUI's documented
  Next.js integration that `src/components/Link` renders. Rewriting it
  manufactures the module cycle `Link → NextLinkComposed → Link`, and with it
  infinite render recursion.

```tsx
// src/components/NextLinkComposed.tsx — not reported
import Link from 'next/link';
export const NextLinkComposed = Link;
```

```tsx
// src/components/Link.tsx — not reported
import Link from 'next/link';
export default Link;
```

The exemption keys on the linted file's path with its extension (`.ts`, `.tsx`,
`.js`, `.jsx`) stripped and its separators normalized, so an absolute path
(`/repo/src/components/Link.tsx`) identifies the wrapper as readily as a
project-relative one. The `src/components/Link` match has to land on a
path-segment boundary and the integration component is matched by basename
equality, so neighbours that merely share a prefix or suffix —
`foo/notsrc/components/Link.tsx`, `src/components/LinkButton.tsx`,
`src/components/MyNextLinkComposed.tsx`,
`src/components/NextLinkComposed.stories.tsx` — are still reported.

## Why this matters

- Design cohesion: The custom Link applies shared typography, colors, and spacing so navigation looks consistent across pages.
- Observability: Analytics and tracking hooks live in the wrapper; using `next/link` removes that instrumentation.
- Safer navigation: Shared behaviors like locale handling or prefetch defaults live in one place, reducing brittle per-page configuration.

## When not to use it

- If a page legitimately must bypass the shared wrapper (for example, an isolated experiment that cannot accept the wrapper’s side effects), disable the rule for that import with an inline comment and document the exception.
