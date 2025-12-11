# Enforce using src/components/Link instead of next/link (`@blumintinc/blumint/use-custom-link`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Use the shared `src/components/Link` wrapper instead of importing `next/link` directly. The wrapper centralizes design system defaults, analytics hooks, and navigation safeguards. Bypassing it with `next/link` leads to inconsistent styling, missing instrumentation, and navigation paths that skip our shared behavior.

### What the rule reports

- Any default import (including `default as`) sourced from `next/link`.
- The rule provides an autofix that rewrites the import to `src/components/Link` while preserving the local name.

## Examples

Examples of **incorrect** code for this rule:

```tsx
import Link from 'next/link';

import { default as NextLink } from 'next/link';
```

Examples of **correct** code for this rule:

```tsx
import Link from 'src/components/Link';

import { default as NextLink } from 'src/components/Link';
```

## Why this matters

- Design cohesion: The custom Link applies shared typography, colors, and spacing so navigation looks consistent across pages.
- Observability: Analytics and tracking hooks live in the wrapper; using `next/link` removes that instrumentation.
- Safer navigation: Shared behaviors like locale handling or prefetch defaults live in one place, reducing brittle per-page configuration.

## When not to use it

- If a page legitimately must bypass the shared wrapper (for example, an isolated experiment that cannot accept the wrapper’s side effects), disable the rule for that import with an inline comment and document the exception.
