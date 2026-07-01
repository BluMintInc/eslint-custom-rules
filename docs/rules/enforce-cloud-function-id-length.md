# Ensures .f.ts file paths generate Firebase Cloud Function IDs within the 62-character limit (`@blumintinc/blumint/enforce-cloud-function-id-length`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Firebase constructs a Cloud Function ID from every `.f.ts` file by:

1. Taking the path relative to `functions/src/`
2. Stripping the `.f.ts` extension
3. Replacing `/` with `-`
4. Lowercasing the result

If a single `.f.ts` file produces an ID longer than 62 characters, `firebase functions:shell` and `firebase deploy` refuse to load **any** function in the codebase — blocking every admin script and every deploy, not just the offending one.

This rule checks the derived ID for each `.f.ts` file under `functions/src/` and reports a violation when the derived ID exceeds the limit. The error message surfaces the exact derived ID, its actual length, and the 62-character cap.

## Examples of incorrect code

```ts
// functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts
// → derived: callable-scripts-migrateactualizedsolvencytopendingsolvencytransactions (71 chars)
// → BLOCKS firebase functions:shell AND firebase deploy
export default null;
```

```ts
// functions/src/callable/scripts/dummy-tournament/dummy-lobby/createDummyLobbyWithOverwolfPlacements.f.ts
// → derived: callable-scripts-dummy-tournament-dummy-lobby-createdummylobbywithoverwolfplacements (89 chars)
export default null;
```

## Examples of correct code

```ts
// functions/src/callable/scripts/migrateActualizedToPendingSolvency.f.ts
// → derived: callable-scripts-migrateactualizedtopendingsolvency (49 chars)
export default null;
```

```ts
// functions/src/callable/scripts/dummy-tournament/createDummyTournament.f.ts
// → derived: callable-scripts-dummy-tournament-createdummytournament (55 chars)
export default null;
```

```ts
// functions/src/callable/scripts/backfillEnableStreamOverlayForTournamentKinds.f.ts
// → derived: callable-scripts-backfillenablestreamoverlayfortournamentkinds (62 chars — exactly at the boundary)
export default null;
```

## Options

```ts
// .eslintrc.js
{
  '@blumintinc/blumint/enforce-cloud-function-id-length': ['error', { maxLength: 62 }]
}
```

### `maxLength` (default: `62`)

The maximum number of characters allowed for a derived Firebase Cloud Function ID. The default (`62`) is Firebase's own hard limit. Change this only if Firebase changes their constraint.

## When to disable

This rule should almost never be disabled. The 62-character limit is imposed by Firebase itself — it is not a BluMint preference. Disabling the rule allows a file to be committed that will break `firebase functions:shell` and `firebase deploy` for **every developer** in the repository until the file is renamed.

If you are working in a directory that happens to contain `functions/src/` in its path but is **not** a Firebase project, use ESLint's `overrides` to scope the rule to the actual Firebase source directory.
