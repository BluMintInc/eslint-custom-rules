# Disallow the `satisfies` operator in files that reach the frontend webpack bundle (Next.js 12 SWC cannot parse it) (`@blumintinc/blumint/no-satisfies-in-frontend-bundle`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Overview

Next.js 12's SWC compiler does not support the TypeScript `satisfies` operator (introduced in TS 4.9). Any file that is bundled by webpack — everything under `src/`, plus any `functions/src/**` file that is not backend-only — causes the production build to fail with a parse error like:

```
Error:
  x Expected a semicolon
   | } as const satisfies Record<ReportTargetType, string>;
```

Neither `tsc`, Jest, nor ESLint catch this without a dedicated rule. It only surfaces at `next build` time — i.e., as a failed Vercel deployment.

This rule reports every `TSSatisfiesExpression` node in files that can reach the frontend bundle. It is a **stopgap** tied to the Next.js 12 toolchain; when the project upgrades to a Next.js version whose SWC supports `satisfies`, this rule (and any workaround comments in the codebase) should be removed.

## Approved substitutes

Two patterns replace `satisfies` without losing type safety:

### 1. Explicit type annotation

Use when literal key names are not needed downstream:

```typescript
// Before (invalid)
const GUARD_FLOW_MAP = {
  login: { label: 'Login' },
} as const satisfies Record<string, { label: string }>;

// After (valid)
type GuardFlowEntry = { label: string };
const GUARD_FLOW_MAP: Record<string, GuardFlowEntry> = {
  login: { label: 'Login' },
} as const;
```

### 2. Constrained identity helper

Use when `keyof typeof X` literal keys must be preserved (e.g., the consuming code destructures or indexes by those keys):

```typescript
function build<T extends Record<string, { label: string }>>(x: T) {
  return x;
}

export const REASONS = build({
  spam: { label: 'Spam' },
  harassment: { label: 'Harassment' },
} as const);
// typeof REASONS is { readonly spam: { readonly label: 'Spam' }; ... }
// keyof typeof REASONS is 'spam' | 'harassment'
```

## Rule Details

### What is reported

Every `TSSatisfiesExpression` in a file within the configured `includePaths` that does not match any `excludePaths` glob.

- `{ ... } satisfies T` — reported
- `{ ... } as const satisfies T` — reported (the outer node is `TSSatisfiesExpression`)
- Nested `satisfies` expressions — each occurrence reported independently

### What is NOT reported

- Bare `as const` (a `TSAsExpression`, not a `TSSatisfiesExpression`) — never reported
- `.d.ts` declaration files — always exempt (never bundled)
- `*.test.ts(x)` and `*.spec.ts(x)` files — always exempt (never bundled)
- Files outside `includePaths` — not checked
- Files matching any `excludePaths` glob — not checked

### Examples of incorrect code

```typescript
// File: src/components/report/ReportDialogTitle.tsx
type ReportTargetType = 'user' | 'post';
const REPORT_TARGET_LABELS = {
  user: 'User',
  post: 'Post',
} as const satisfies Record<ReportTargetType, string>; // ← error
```

```typescript
// File: functions/src/types/firestore/Report/reasons.ts
// (NOT in an excluded backend-only directory)
type ReportReason = { label: string };
export const REASONS = {
  spam: { label: 'Spam' },
} as const satisfies Record<string, ReportReason>; // ← error
```

### Examples of correct code

```typescript
// File: src/components/report/ReportDialogTitle.tsx
type ReportTargetType = 'user' | 'post';
const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  user: 'User',
  post: 'Post',
} as const;
```

```typescript
// File: functions/src/firestore/report/reasons.ts
// (excluded backend-only directory — satisfies is fine here)
type ReportReason = { label: string };
const REASONS = { spam: { label: 'Spam' } } satisfies Record<string, ReportReason>;
```

## Options

This rule accepts a single options object:

```ts
'@blumintinc/blumint/no-satisfies-in-frontend-bundle': ['error', {
  includePaths: ['src/**', 'functions/src/**'],
  excludePaths: [
    'functions/src/firestore/**',
    'functions/src/callable/**',
    'functions/src/pubsub/**',
    'functions/src/webhooks/**',
    'functions/src/queues/**',
    'functions/src/realtime/**',
  ],
}]
```

### `includePaths`

- **Type:** `string[]`
- **Default:** `['src/**', 'functions/src/**']`

Glob patterns (matched via [minimatch](https://github.com/isaacs/minimatch)) for directories that are eligible for webpack bundling. Files outside these paths are not checked.

### `excludePaths`

- **Type:** `string[]`
- **Default:** `['functions/src/firestore/**', 'functions/src/callable/**', 'functions/src/pubsub/**', 'functions/src/webhooks/**', 'functions/src/queues/**', 'functions/src/realtime/**']`

Glob patterns for backend-only directories whose code is compiled by `tsc` (not SWC) and may use `satisfies` freely. Files matching any exclude pattern are skipped.

## When to disable

Disable this rule when the project has been upgraded to a Next.js version (or SWC version) that parses the `satisfies` operator. When doing so, also remove the workaround patterns introduced to comply with this rule.

```typescript
// eslint-disable-next-line @blumintinc/blumint/no-satisfies-in-frontend-bundle
const X = { ... } satisfies T;
```
