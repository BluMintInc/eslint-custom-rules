# Enforce that type-only files (containing only type/interface/enum declarations) live under the canonical types directory (`@blumintinc/blumint/enforce-types-directory-placement`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Overview

In the BluMint monorepo, all shared TypeScript type definitions must live under `functions/src/types/**`. This convention centralizes the data model, prevents circular dependencies, and ensures both frontend (`src/`) and backend (`functions/src/`) code import types from a single canonical location.

This rule detects files whose **entire content** consists of type definitions (no functions, classes, `const`/`let`/`var` assignments, or other runtime code) and flags them when they are located outside `functions/src/types/`.

## Rule Details

A file is considered "type-only" when every top-level statement is one of:

- `type` alias declarations
- `interface` declarations
- `enum` declarations (treated as type-level per project convention)
- `ImportDeclaration` (imports alone are not runtime code)
- `export type { ... } from '...'` (type re-exports)
- `export { ... } from '...'` (value re-exports from external modules)
- `export * from '...'` or `export type * from '...'`
- `declare` / `TSModuleDeclaration` blocks

The rule reports once on the **first statement** of the program when the file is type-only and outside the canonical directory.

### Examples of incorrect code

```typescript
// File: functions/src/v2/compositor/types.ts
import { Transaction } from 'firebase-admin/firestore';

export type SequentialReturn = Promise<true | void>;

export type HandlerSequential<TPayload extends Array<unknown>> = (
  ...payload: TPayload
) => SequentialReturn;
```

```typescript
// File: functions/src/util/notifications/NotificationFilerProps.ts
import { NotificationContent } from '../../types/firestore/User/Notification';

export type NotificationFilerProps = NotificationContent & {
  toId: string;
};
```

```typescript
// File: src/components/edit/wrapper/EditableWrapperProps.ts
export interface ViewComponentPropsBase<TValue> {
  value?: TValue;
  placeholder?: string;
}
```

### Examples of correct code

```typescript
// File: functions/src/types/compositor/sequential.ts
import { Transaction } from 'firebase-admin/firestore';

export type SequentialReturn = Promise<true | void>;

export type HandlerSequential<TPayload extends Array<unknown>> = (
  ...payload: TPayload
) => SequentialReturn;
```

```typescript
// File: functions/src/util/notifications/NotificationFiler.ts
// Types inlined into the consumer (preferred for single-consumer types)
type NotificationFilerProps = { toId: string };

export class NotificationFiler {
  constructor(private readonly props: NotificationFilerProps) {}
}
```

```typescript
// File: functions/src/util/errors/errorCodes.ts
// NOT type-only because it contains a runtime const declaration
export type gRPCErrorCode = 'ok' | 'cancelled';
export const GRPC_CODE_MAP = { ok: 200, cancelled: 499 } as const;
```

## Options

```typescript
{
  // The canonical directory where type-only files must reside.
  typesDirectory?: string;  // default: "functions/src/types"

  // Glob patterns for files to exclude entirely.
  excludePatterns?: string[];  // default: ["**/*.d.ts", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/__mocks__/**"]

  // Only enforce within these path globs. Files outside these paths are not checked.
  includePaths?: string[];  // default: ["src/**", "functions/src/**"]

  // Module specifiers that mark a type file as frontend-coupled. A type-only
  // file importing one of these cannot be relocated under the backend types
  // directory (the backend must not import from `src/`), so it is exempt.
  // Relative specifiers are resolved against the importing file before matching,
  // so backend files importing relatively stay flagged.
  frontendCoupledImportPatterns?: string[];  // default: ["src/components/**", "src/hooks/**"]
}
```

### Configuration example

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/enforce-types-directory-placement': [
    'error',
    {
      typesDirectory: 'functions/src/types',
      excludePatterns: ['**/*.d.ts', '**/*.test.ts', '**/__mocks__/**'],
    }
  ]
}
```

## Suggested Path Logic

The rule calculates a suggested target path in the error message:

- **Backend files** (`functions/src/<segment>/...`): strip `functions/src/<segment>/` and prepend `functions/src/types/`
  - `functions/src/v2/compositor/types.ts` → `functions/src/types/compositor/types.ts`
  - `functions/src/util/notifications/NotificationFilerProps.ts` → `functions/src/types/notifications/NotificationFilerProps.ts`
- **Frontend files** (`src/<segment>/...`): strip `src/<segment>/` and prepend `functions/src/types/`
  - `src/components/edit/wrapper/EditableWrapperProps.ts` → `functions/src/types/edit/wrapper/EditableWrapperProps.ts`

## When to Disable

This rule can be disabled for specific files using `// eslint-disable-next-line` when:

- The file intentionally lives outside `functions/src/types/` and is not a shared type definition
- The project does not follow the BluMint monorepo types-placement convention

## Related

- `.claude/skills/types-placement/SKILL.md` — The primary standard this rule enforces
- `@blumintinc/blumint/prefer-type-over-interface` — Enforces using `type` over `interface`
