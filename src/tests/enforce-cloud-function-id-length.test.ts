import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCloudFunctionIdLength } from '../rules/enforce-cloud-function-id-length';

// All lengths verified:
//   callable-scripts-foo                                              = 20 chars
//   callable-scripts-dummy-tournament-createdummytournament           = 55 chars
//   callable-scripts-backfillenablestreamoverlayfortournamentkinds    = 62 chars (boundary)
//   callable-scripts-backfillenablestreamoverlayfortournamentkindsx   = 63 chars (first over)
//   callable-scripts-migrateactualizedsolvencytopendingsolvencytransactions = 71 chars
//   callable-scripts-dummy-tournament-dummy-lobby-createdummylobbywithoverwolfplacementsextra = 89 chars

ruleTesterTs.run(
  'enforce-cloud-function-id-length',
  enforceCloudFunctionIdLength,
  {
    valid: [
      // 1. Short path under functions/src/ — well within limit
      {
        code: `export const foo = 1;`,
        filename: '/repo/functions/src/callable/scripts/foo.f.ts',
        // derived: 'callable-scripts-foo' (20 chars)
      },

      // 2. Nested subdirectory, within limit
      {
        code: `export const createDummyTournament = () => {};`,
        filename:
          '/repo/functions/src/callable/scripts/dummy-tournament/createDummyTournament.f.ts',
        // derived: 'callable-scripts-dummy-tournament-createdummytournament' (55 chars)
      },

      // 3. File outside functions/src/ — no ID derived, no report
      {
        code: `export const x = 1;`,
        filename: '/repo/src/util/notBackend.ts',
      },

      // 4. Non-.f.ts file inside functions/src/ — no ID derived, no report
      {
        code: `export const helper = () => {};`,
        filename: '/repo/functions/src/util/helpers.ts',
      },

      // 5. Boundary: exactly 62 chars — passes (Firebase accepts ≤62)
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/backfillEnableStreamOverlayForTournamentKinds.f.ts',
        // derived: 'callable-scripts-backfillenablestreamoverlayfortournamentkinds' (62 chars)
      },

      // 6. Top-level file at functions/src/ root (no subdirectory)
      {
        code: `export default null;`,
        filename: '/repo/functions/src/myTopLevel.f.ts',
        // derived: 'mytoplevel' (10 chars)
      },

      // 7. Test file (.f.test.ts) — excluded by suffix check; ends with .f.test.ts not .f.ts
      {
        code: `describe('foo', () => {});`,
        filename:
          '/repo/functions/src/callable/scripts/someExtremelyLongMigrationScriptName.f.test.ts',
      },

      // 8. Windows-style path (backslashes) — normalizes correctly, within limit
      {
        code: `export default null;`,
        filename: 'C:\\repo\\functions\\src\\callable\\scripts\\foo.f.ts',
        // derived: 'callable-scripts-foo' (20 chars)
      },

      // 9. Nested monorepo layout — lastIndexOf finds innermost functions/src/
      {
        code: `export const x = 1;`,
        filename:
          '/Users/dev/repo/packages/backend/functions/src/callable/foo.f.ts',
        // derived: 'callable-foo' (12 chars)
      },

      // 10. A regular TypeScript file with a very long path (not .f.ts) — no report
      {
        code: `export const value = 'something';`,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.ts',
      },

      // 11. File not under functions/src/ even with .f.ts extension — no report
      {
        code: `export const x = 1;`,
        filename: '/repo/src/util/someHelper.f.ts',
      },

      // 12. Minimal/empty-body file at a short path — Program still fires, but passes
      {
        code: ``,
        filename: '/repo/functions/src/short.f.ts',
        // derived: 'short' (5 chars)
      },

      // 13. Exactly 61 chars — safely within limit
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/backfillEnableStreamOverlayForTournamentKind.f.ts',
        // derived: 'callable-scripts-backfillenablestreamoverlayfortournamentkind' (61 chars)
      },

      // 14. maxLength option: explicitly set to 100 — long ID now passes
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        options: [{ maxLength: 100 }],
        // derived: 71 chars, maxLength=100, so passes
      },

      // 15. pathological: duplicated functions/src/ in path — lastIndexOf picks innermost
      {
        code: `export const x = 1;`,
        filename: '/repo/functions/src/nested/functions/src/callable/foo.f.ts',
        // lastIndexOf finds the inner functions/src/, relative='callable/foo.f.ts'
        // derived: 'callable-foo' (12 chars)
      },

      // 16. Single-segment path at functions/src/ root with a long name still fits
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/backfillEnableStreamOverlayForTournamentKindsTopLevel.f.ts',
        // derived: 'backfillenablestreamoverlayfortournamentkindstoplevel' (52 chars)
      },

      // 17. Kebab-case filename — hyphens preserved, within limit
      {
        code: `export const x = 1;`,
        filename: '/repo/functions/src/callable/migrate-users.f.ts',
        // derived: 'callable-migrate-users' (22 chars)
      },

      // 18. Uppercase filename — lowercased to check length (still short)
      {
        code: `export default null;`,
        filename: '/repo/functions/src/callable/MIGRATEUSERS.f.ts',
        // derived: 'callable-migrateusers' (21 chars)
      },

      // 19. Non-functions directory containing "src" in the path — no match
      {
        code: `export const x = 1;`,
        filename: '/repo/packages/other-pkg/src/file.f.ts',
      },

      // 20. Scripts-level file that derives good-length ID with camelCase
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedToPendingSolvency.f.ts',
        // derived: 'callable-scripts-migrateactualizedtopendingsolvency' (51 chars)
      },
    ],

    invalid: [
      // 1. The motivating incident: 71 chars
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        errors: [{ messageId: 'tooLong' }],
        // derived: 'callable-scripts-migrateactualizedsolvencytopendingsolvencytransactions' (71 chars)
      },

      // 2. Boundary: exactly 63 chars — first over-limit value
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/backfillEnableStreamOverlayForTournamentKindsX.f.ts',
        errors: [{ messageId: 'tooLong' }],
        // derived: 'callable-scripts-backfillenablestreamoverlayfortournamentkindsx' (63 chars)
      },

      // 3. Deeply nested path with long segment — 89 chars
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/dummy-tournament/dummy-lobby/createDummyLobbyWithOverwolfPlacementsExtra.f.ts',
        errors: [{ messageId: 'tooLong' }],
        // derived: 'callable-scripts-dummy-tournament-dummy-lobby-createdummylobbywithoverwolfplacementsextra' (89 chars)
      },

      // 4. Exactly one error per file — many AST nodes don't multiply the error
      {
        code: `
        export const a = 1;
        export const b = 2;
        export const c = 3;
        const fn1 = () => {};
        const fn2 = () => {};
        const fn3 = () => {};
      `,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        errors: [{ messageId: 'tooLong' }],
      },

      // 5. Minimal stub content — file contents irrelevant, name alone determines violation
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        errors: [{ messageId: 'tooLong' }],
      },

      // 6. Windows-style path exceeding limit
      {
        code: `export default null;`,
        filename:
          'C:\\repo\\functions\\src\\callable\\scripts\\migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        errors: [{ messageId: 'tooLong' }],
      },

      // 7. Uppercase name that lowercases to over-limit length
      {
        code: `export default null;`,
        filename:
          '/repo/functions/src/callable/scripts/MIGRATEACTUALIZEDSOLVENCYTOPENDINGSOLVENCYTRANSACTIONS.f.ts',
        errors: [{ messageId: 'tooLong' }],
        // same derived ID after toLowerCase: still 71 chars
      },

      // 8. Nested monorepo + over-limit innermost path
      {
        code: `export const x = 1;`,
        filename:
          '/repo/packages/backend/functions/src/callable/scripts/migrateActualizedSolvencyToPendingSolvencyTransactions.f.ts',
        errors: [{ messageId: 'tooLong' }],
      },

      // 9. maxLength: 19 — forces a violation on 'callable-scripts-foo' (20 chars)
      {
        code: `export default null;`,
        filename: '/repo/functions/src/callable/scripts/foo.f.ts',
        options: [{ maxLength: 19 }],
        // derived: 'callable-scripts-foo' (20 chars), maxLength=19, so 20 > 19 → error
        errors: [{ messageId: 'tooLong' }],
      },

      // 10. maxLength: 10 — forces a violation on a different short name
      {
        code: `export const x = 1;`,
        filename: '/repo/functions/src/callable/scripts/foo.f.ts',
        options: [{ maxLength: 10 }],
        // derived: 'callable-scripts-foo' (20 chars), maxLength=10, so 20 > 10 → error
        errors: [{ messageId: 'tooLong' }],
      },

      // 11. path with extra-long directory segments (not just filename)
      {
        code: `export const x = 1;`,
        filename:
          '/repo/functions/src/veryLongDirectoryNameThatContributesToIdLength/anotherLongSegmentHere/functionName.f.ts',
        errors: [{ messageId: 'tooLong' }],
        // derived: 'verylongdirectorynamethatcontributestoidlength-anotherlongsegmenthere-functionname'
      },
    ],
  },
);
