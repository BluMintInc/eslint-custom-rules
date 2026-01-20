# Enforce JSDoc migration metadata in callable scripts (`@blumintinc/blumint/require-migration-script-metadata`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Every callable script under `functions/src/callable/scripts/**/*.f.ts` must include explicit migration metadata in a JSDoc block. This ensures that migration intent, timing, and dependencies are explicitly documented at authoring time.

## Rationale

Migration scripts are critical during production releases. Missing or ambiguous metadata makes releases brittle and error-prone. By enforcing a standardized JSDoc block, we:
- Prevent missed or misordered migration scripts during release deployments.
- Encode deployment phase decisions directly in the script (before vs. after deploy).
- Force explicit dependencies to avoid implicit ordering assumptions.
- Support automation that generates execution reports for release PRs.

## Rule Details

This rule enforces a single JSDoc block at the top of the file (before any imports or statements) that contains the following tags:

- `@migration`: `true` or `false` (Required)
- If `@migration true`, the following are also required:
  - `@migrationPhase`: `before` or `after`
  - `@migrationDependencies`: `NONE` or a comma-separated list of script names (without `.f.ts`)
  - `@migrationDescription`: A brief description of what the script does

### Examples of Incorrect Code

#### Missing metadata
```typescript
// functions/src/callable/scripts/backfillData.f.ts
import { onCallVaripotent } from '../../v2/https/onCall';
// ...
```

#### Metadata after imports
```typescript
import { onCallVaripotent } from '../../v2/https/onCall';

/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Backfill data
 */
```

#### Missing required tags
```typescript
/**
 * @migration true
 * @migrationPhase after
 * @migrationDescription Backfill data
 */
import { onCallVaripotent } from '../../v2/https/onCall';
```

#### Invalid values
```typescript
/**
 * @migration true
 * @migrationPhase during
 * @migrationDependencies otherScript.f.ts
 * @migrationDescription Backfill data
 */
import { onCallVaripotent } from '../../v2/https/onCall';
```

### Examples of Correct Code

#### Migration script
```typescript
/**
 * @migration true
 * @migrationPhase after
 * @migrationDependencies NONE
 * @migrationDescription Backfill team priority field on GuestlistTeam documents
 */
import { onCallVaripotent } from '../../v2/https/onCall';
```

#### Non-migration script
```typescript
/**
 * @migration false
 */
export default () => null;
```

#### Legacy header allowed
```typescript
/* eslint-disable */
/**
 * Legacy callable script - DO NOT MODIFY for code style.
 */
/**
 * @migration true
 * @migrationPhase before
 * @migrationDependencies NONE
 * @migrationDescription Legacy header plus metadata
 */
import { onCallVaripotent } from '../../v2/https/onCall';
```

## Options

### `targetGlobs`
An array of glob patterns to specify which files should be checked.
Default: `['functions/src/callable/scripts/**/*.f.ts']`

### `allowLegacyHeader`
Whether to allow legacy header comments before the metadata block.
Default: `true`

### `autoFix`
Whether to attempt auto-fixing.
Default: `false` (Explicit values are required from the author)
