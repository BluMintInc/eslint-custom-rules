# Enforce using src/hooks/routing/useRouter instead of next/router (`@blumintinc/blumint/use-custom-router`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

The custom `useRouter` hook in `src/hooks/routing/useRouter` wraps Next.js routing with application-level behavior such as authentication guards, analytics instrumentation, and redirect helpers. Importing `useRouter` directly from `next/router` bypasses those shared safeguards and leads to inconsistent navigation semantics across the app.

## Rule Details

- `useRouter` must be imported from `src/hooks/routing/useRouter`, not `next/router`.
- Other exports from `next/router` are allowed; only `useRouter` is redirected.
- The fixer rewrites offending imports to point at the custom hook while preserving any other `next/router` imports.

### Examples of incorrect code for this rule

```typescript
import { useRouter } from 'next/router';
```

```typescript
import { useRouter as NextRouter } from 'next/router';
```

### Examples of correct code for this rule

```typescript
import { useRouter } from 'src/hooks/routing/useRouter';
```

```typescript
import { useRouter } from 'src/hooks/routing/useRouter';
import { something } from 'next/router';
```

## The wrapper module is exempt

`src/hooks/routing/useRouter` is the one module that has to import `useRouter`
from `next/router` — it is the wrapper the rule points everything else at. The
rule therefore never reports inside it, since the fix there would make the module
import itself, and a self-import evaluates circularly: the wrapper exports
`undefined` and every consumer of it breaks.

```typescript
// src/hooks/routing/useRouter.tsx — not reported
import { useRouter as originalUseRouter } from 'next/router';
export const useRouter = () => originalUseRouter();
```

The exemption keys on the linted file's path with its extension (`.ts`, `.tsx`,
`.js`, `.jsx`) stripped and its separators normalized, so an absolute path
(`/repo/src/hooks/routing/useRouter.ts`) identifies the wrapper as readily as a
project-relative one. The match has to land on a path-segment boundary, so
neighbours that merely share the prefix — `src/hooks/routing/useRouterState.ts`,
`src/hooks/routing/useRouter.helpers.ts`, `foo/notsrc/hooks/routing/useRouter.ts`
— are still reported.
