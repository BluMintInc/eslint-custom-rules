import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceSnapshotStateNarrowing } from '../rules/enforce-snapshot-state-narrowing';

/**
 * Suggestions bring the guard into scope, so every expected output for a file
 * that does not already import `isSnapshotReady` is prefixed with the canonical
 * import.
 */
const withGuardImport = (code: string) =>
  `import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';\n${code}`;

/**
 * Same prefix for a configured guard name and/or module, so a case can pin
 * exactly which identifier the suggestion imports.
 */
const withImport = (name: string, source: string, code: string) =>
  `import { ${name} } from '${source}';\n${code}`;

ruleTesterJsx.run(
  'enforce-snapshot-state-narrowing',
  enforceSnapshotStateNarrowing,
  {
    valid: [
      // ---- VALID: Correct guard usage ----

      // 1. isSnapshotReady as guard in if statement
      `
      const state = useDocSnapshot({ docPath });
      if (isSnapshotReady(state)) { return state.name; }
      `,

      // 2. !isSnapshotReady early return
      `
      const state = useDocSnapshot({ docPath });
      if (!isSnapshotReady(state)) return null;
      return state.name;
      `,

      // 3. Ternary with isSnapshotReady
      `
      const state = useDocSnapshot({ docPath });
      const result = isSnapshotReady(state) ? state.name : null;
      `,

      // 4. Explicit string comparison - 'loading'
      `
      const state = useDocSnapshot({ docPath });
      if (state === 'loading') return null;
      `,

      // 5. Explicit string comparison - 'not-found'
      `
      const state = useDocSnapshot({ docPath });
      if (state === 'not-found') return null;
      `,

      // 6. Explicit string comparison - 'idle'
      `
      const state = useDocSnapshot({ docPath });
      if (state === 'idle') return null;
      `,

      // 7. Explicit inequality comparison
      `
      const state = useDocSnapshot({ docPath });
      if (state !== 'loading') return state.name;
      `,

      // 8. typeof state === 'string' is ALLOWED (narrows to non-data states)
      `
      const state = useDocSnapshot({ docPath });
      if (typeof state === 'string') return null;
      `,

      // 9. typeof state === 'string' with useCollectionSnapshot
      `
      const state = useCollectionSnapshot({ collectionPath });
      if (typeof state === 'string') return <Spinner />;
      `,

      // 10. Falsy check on a variable NOT from a snapshot hook (should not flag)
      `
      const user = getUser();
      if (!user) return null;
      `,

      // 11. typeof check on a variable NOT from a snapshot hook (should not flag)
      `
      const size = getSize();
      if (typeof size === 'object') return null;
      `,

      // 12. Logical expression on a NON-snapshot variable
      `
      const data = fetchData();
      return data && data.name;
      `,

      // 13. Boolean() on a non-snapshot variable
      `
      const value = getValue();
      if (Boolean(value)) return null;
      `,

      // 14. Ternary on a non-snapshot variable
      `
      const loaded = checkLoaded();
      return loaded ? 'yes' : 'no';
      `,

      // 15. useCachedDocSnapshot with correct guard
      `
      const state = useCachedDocSnapshot({ docPath });
      if (!isSnapshotReady(state)) return null;
      return state.id;
      `,

      // 16. useFirestore with correct guard
      `
      const state = useFirestore({ path });
      if (isSnapshotReady(state)) { return state; }
      `,

      // 17. Stored isSnapshotReady result — the boolean variable usage is fine
      `
      const state = useDocSnapshot({ docPath });
      const isReady = isSnapshotReady(state);
      if (isReady) { return state; }
      `,

      // 18. typeof state !== 'object' is NOT flagged (not a to-data check direction)
      `
      const state = useDocSnapshot({ docPath });
      if (typeof state !== 'object') return null;
      `,

      // 19. Explicit null comparison on the state is allowed
      `
      const state = useDocSnapshot({ docPath });
      if (state === null) return null;
      `,

      // 20. Spreading or passing state to isSnapshotReady from useCollectionSnapshot
      `
      const state = useCollectionSnapshot({ collectionPath });
      const result = isSnapshotReady(state) ? state.map(x => x.id) : [];
      `,

      // 21. A non-snapshot const followed by a typeof check
      `
      const tab = getTabConfig();
      if (typeof tab === 'object') { return tab.label; }
      `,

      // 22. typeof === 'string' on useFirestore (allowed direction)
      `
      const state = useFirestore({ path });
      if (typeof state === 'string') return <Spinner />;
      `,

      // 23. excludeFiles widened to cover this file. `excludeFiles` is matched
      // against the filename, so the case has to name one; invalid case 47 is
      // the same code under the same filename with no options and it reports,
      // which leaves the option as the only difference.
      {
        filename: 'src/components/UserCard.tsx',
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        options: [{ excludeFiles: ['UserCard.tsx'] }],
      },

      // ---- VALID: `??` boundaries (issue #2315) ----

      // 24. `??` on a genuinely nullable value that is not a snapshot state.
      // This is the operator's correct use and must never be flagged.
      `
      const maybeUser = findUser(id);
      const data = maybeUser ?? defaultUser;
      `,

      // 25. A property of a narrowed state can be nullish, so `??` on it is the
      // right operator. Only a bare snapshot-state operand is a violation.
      `
      const state = useDocSnapshot({ docPath });
      const name = isSnapshotReady(state) ? state.name ?? 'anonymous' : '';
      `,

      // 26. The shape the `??` suggestion produces is itself silent, so
      // applying it converges instead of re-reporting.
      `
      const state = useDocSnapshot({ docPath });
      const data = (isSnapshotReady(state) ? state : null) ?? defaultUser;
      `,

      // 27. `??` on a non-snapshot binding that merely sits beside one
      `
      const state = useDocSnapshot({ docPath });
      const cached = readCache(docPath);
      const data = cached ?? defaultUser;
      `,

      // 28. A snapshot state on the RIGHT of `??` is not flagged, matching the
      // `||` arm: the rule only claims the operand whose value decides the
      // expression, so the conservative boundary is identical for both.
      `
      const state = useDocSnapshot({ docPath });
      const data = fallback ?? state;
      `,

      // 29. excludeFiles covers the `??` spelling too. Invalid case 62 is the
      // same code under the same filename with no options and it reports.
      {
        filename: 'src/components/UserCard.tsx',
        code: `
const state = useDocSnapshot({ docPath });
const data = state ?? defaultUser;
        `,
        options: [{ excludeFiles: ['UserCard.tsx'] }],
      },
    ],

    invalid: [
      // ---- INVALID: Falsy/truthy checks on snapshot-state variables ----

      // 1. !state from useDocSnapshot (early return pattern).
      // The guard must stay negated: the original returns when the snapshot is
      // NOT usable.
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `),
              },
            ],
          },
        ],
      },

      // 2. if (state) truthy check from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 3. Ternary treating state as boolean from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
return state ? <MatchView match={state} /> : null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
return isSnapshotReady(state) ? <MatchView match={state} /> : null;
        `),
              },
            ],
          },
        ],
      },

      // 4. Logical AND short-circuit from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
return state && state.name;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
return isSnapshotReady(state) && state.name;
        `),
              },
            ],
          },
        ],
      },

      // 5. Double negation !!state from useDocSnapshot (truthiness coercion —
      // the guard is positive here)
      {
        code: `
const state = useDocSnapshot({ docPath });
const ready = !!state;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const ready = isSnapshotReady(state);
        `),
              },
            ],
          },
        ],
      },

      // 6. Boolean() coercion from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
if (Boolean(state)) { return state.name; }
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 7. typeof state === 'object' from useDocSnapshot (bad typeof)
      {
        code: `
const state = useDocSnapshot({ docPath });
if (typeof state === 'object') { return state.name; }
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 8. typeof state !== 'string' from useDocSnapshot (equivalent to isSnapshotReady)
      {
        code: `
const state = useDocSnapshot({ docPath });
if (typeof state !== 'string') { return state.name; }
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 9. typeof state === 'object' from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (typeof state === 'object' && state !== null) { return state; }
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
if (isSnapshotReady(state) && state !== null) { return state; }
        `),
              },
            ],
          },
        ],
      },

      // 10. typeof state !== 'string' from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (typeof state !== 'string') { return state; }
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
if (isSnapshotReady(state)) { return state; }
        `),
              },
            ],
          },
        ],
      },

      // 11. Logical OR short-circuit from useCachedDocSnapshot. The operand
      // carries the value, so only the conditional form preserves it.
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const data = state || defaultUser;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCachedDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : defaultUser;
        `),
              },
            ],
          },
        ],
      },

      // 12. !state from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
if (!isSnapshotReady(state)) return null;
        `),
              },
            ],
          },
        ],
      },

      // 13. typeof state === 'object' from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (typeof state === 'object') { return state; }
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useFirestore({ path });
if (isSnapshotReady(state)) { return state; }
        `),
              },
            ],
          },
        ],
      },

      // 14. if (state) from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (state) { return state; }
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useFirestore({ path });
if (isSnapshotReady(state)) { return state; }
        `),
              },
            ],
          },
        ],
      },

      // 15. if (state) from useCachedDocSnapshot
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
if (state) return state.name;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCachedDocSnapshot({ docPath });
if (isSnapshotReady(state)) return state.name;
        `),
              },
            ],
          },
        ],
      },

      // 16. state && state.name from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
return state && state.length > 0;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
return isSnapshotReady(state) && state.length > 0;
        `),
              },
            ],
          },
        ],
      },

      // 17. ternary from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
return state ? state.map(x => x.id) : [];
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
return isSnapshotReady(state) ? state.map(x => x.id) : [];
        `),
              },
            ],
          },
        ],
      },

      // 18. !!state from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
const isReady = !!state;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCollectionSnapshot({ collectionPath });
const isReady = isSnapshotReady(state);
        `),
              },
            ],
          },
        ],
      },

      // 19. Boolean(state) from useCachedDocSnapshot
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const flag = Boolean(state);
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useCachedDocSnapshot({ docPath });
const flag = isSnapshotReady(state);
        `),
              },
            ],
          },
        ],
      },

      // 20. typeof state !== 'string' from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (typeof state !== 'string') return state;
        `,
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useFirestore({ path });
if (isSnapshotReady(state)) return state;
        `),
              },
            ],
          },
        ],
      },

      // 21. state || fallback from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
const data = state || null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : null;
        `),
              },
            ],
          },
        ],
      },

      // 22. typeof state === 'object' with custom snapshotHooks option
      {
        code: `
const state = useMyCustomSnapshot({ path });
if (typeof state === 'object') { return state; }
        `,
        options: [{ snapshotHooks: ['useMyCustomSnapshot'] }],
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withGuardImport(`
const state = useMyCustomSnapshot({ path });
if (isSnapshotReady(state)) { return state; }
        `),
              },
            ],
          },
        ],
      },

      // ---- REGRESSIONS: suggestion polarity (issue #1369) ----

      // 23. Negated ternary test keeps its negation
      {
        code: `
const state = useDocSnapshot({ docPath });
const view = !state ? <Spinner /> : <MatchView match={state} />;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const view = !isSnapshotReady(state) ? <Spinner /> : <MatchView match={state} />;
        `),
              },
            ],
          },
        ],
      },

      // 24. Negated loop condition keeps its negation
      {
        code: `
const state = useDocSnapshot({ docPath });
while (!state) { await wait(); }
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
while (!isSnapshotReady(state)) { await wait(); }
        `),
              },
            ],
          },
        ],
      },

      // 25. Chained || is parenthesized so the conditional does not swallow the
      // remaining operands
      {
        code: `
const state = useDocSnapshot({ docPath });
const data = state || cached || fallback;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const data = (isSnapshotReady(state) ? state : cached) || fallback;
        `),
              },
            ],
          },
        ],
      },

      // 26. || inside JSX needs no extra parentheses
      {
        code: `
const state = useDocSnapshot({ docPath });
return <div>{state || <Spinner />}</div>;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
return <div>{isSnapshotReady(state) ? state : <Spinner />}</div>;
        `),
              },
            ],
          },
        ],
      },

      // 27. Source parentheses already group the expression
      {
        code: `
const state = useDocSnapshot({ docPath });
const id = (state || fallback).id;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const id = (isSnapshotReady(state) ? state : fallback).id;
        `),
              },
            ],
          },
        ],
      },

      // ---- REGRESSIONS: guard import (issue #1369) ----

      // 28. A file that already imports the guard gets no duplicate import
      {
        code: `
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 29. An existing value import of the guard's module is extended, reusing
      // that file's own path
      {
        code: `
import { FirestoreSnapshotState } from '../../types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (state) return state.name;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
import { FirestoreSnapshotState, isSnapshotReady } from '../../types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) return state.name;
        `,
              },
            ],
          },
        ],
      },

      // 30. A type-only import cannot carry a value specifier, but its path
      // shows how the file reaches the module
      {
        code: `
import type { FirestoreSnapshotState } from '@/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
import { isSnapshotReady } from '@/types/FirestoreSnapshotState';
import type { FirestoreSnapshotState } from '@/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 31. Unrelated imports keep their place; the guard import goes first
      {
        code: `
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 32. A file that declares the guard itself needs no import
      {
        code: `
function isSnapshotReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
function isSnapshotReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 33. A conflicting binding of the name declines the suggestion rather
      // than emitting a call to something that is not the guard
      {
        code: `
const isSnapshotReady = 'not-a-guard';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [{ messageId: 'noFalsyCheck', suggestions: [] }],
      },

      // 34. A type-only import of the name is erased at runtime, so the
      // suggestion is declined
      {
        code: `
import type { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (state) return state.name;
        `,
        errors: [{ messageId: 'noFalsyCheck', suggestions: [] }],
      },

      // 35. The import source is configurable
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        options: [{ guardImportSource: '@/types/FirestoreSnapshotState' }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `import { isSnapshotReady } from '@/types/FirestoreSnapshotState';

const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 36. Each violation carries its own import, so applying either
      // suggestion alone leaves the file resolvable
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
return state ? state.name : null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
return state ? state.name : null;
        `),
              },
            ],
          },
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (!state) return null;
return isSnapshotReady(state) ? state.name : null;
        `),
              },
            ],
          },
        ],
      },

      // ---- REGRESSIONS: configurable guard name (issue #1505) ----

      // 37. Default options emit the canonical guard, pinning the behaviour
      // every consumer who sets no options gets
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withImport(
                  'isSnapshotReady',
                  'src/types/FirestoreSnapshotState',
                  `
const state = useDocSnapshot({ docPath });
if (!isSnapshotReady(state)) return null;
        `,
                ),
              },
            ],
          },
        ],
      },

      // 38. A configured guard name reaches both the suggestion text and the
      // inserted import
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        options: [{ guardFunctions: ['isReady'] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withImport(
                  'isReady',
                  'src/types/FirestoreSnapshotState',
                  `
const state = useDocSnapshot({ docPath });
if (!isReady(state)) return null;
        `,
                ),
              },
            ],
          },
        ],
      },

      // 39. A renamed guard in a relocated module: both options apply to the
      // same import, so the suggestion names an export that exists
      {
        code: `
const state = useDocSnapshot({ docPath });
if (typeof state === 'object') { return state; }
        `,
        options: [
          {
            guardFunctions: ['isReady'],
            guardImportSource: 'src/utils/guards',
          },
        ],
        errors: [
          {
            messageId: 'noRawTypeof',
            suggestions: [
              {
                messageId: 'noRawTypeof',
                output: withImport(
                  'isReady',
                  'src/utils/guards',
                  `
const state = useDocSnapshot({ docPath });
if (isReady(state)) { return state; }
        `,
                ),
              },
            ],
          },
        ],
      },

      // 40. The configured guard also drives the `||` rewrite, which builds its
      // replacement text separately
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const data = state || defaultUser;
        `,
        options: [{ guardFunctions: ['isSnapshotDataReady'] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withImport(
                  'isSnapshotDataReady',
                  'src/types/FirestoreSnapshotState',
                  `
const state = useCachedDocSnapshot({ docPath });
const data = isSnapshotDataReady(state) ? state : defaultUser;
        `,
                ),
              },
            ],
          },
        ],
      },

      // 41. An empty list names no guard, so the default stands rather than the
      // suggestion emitting `undefined(state)`
      {
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        options: [{ guardFunctions: [] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 42. A blank entry names nothing callable, so the default stands rather
      // than the suggestion emitting `(state)`
      {
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        options: [{ guardFunctions: ['  '] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 43. Only the first entry is emitted; the rest are recognised names, not
      // candidates for the rewrite
      {
        code: `
const state = useDocSnapshot({ docPath });
const ready = !!state;
        `,
        options: [{ guardFunctions: ['isReady', 'isSnapshotReady'] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withImport(
                  'isReady',
                  'src/types/FirestoreSnapshotState',
                  `
const state = useDocSnapshot({ docPath });
const ready = isReady(state);
        `,
                ),
              },
            ],
          },
        ],
      },

      // 44. An import of the configured guard is already in scope, so the
      // suggestion adds no second import
      {
        code: `
import { isReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        options: [{ guardFunctions: ['isReady'] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
import { isReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
if (!isReady(state)) return null;
        `,
              },
            ],
          },
        ],
      },

      // 45. A local declaration of the configured guard is callable as written
      {
        code: `
function isReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (state) return state.name;
        `,
        options: [{ guardFunctions: ['isReady'] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
function isReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (isReady(state)) return state.name;
        `,
              },
            ],
          },
        ],
      },

      // 46. The conflict check follows the configured name: something else owns
      // `isReady`, so no suggestion is offered
      {
        code: `
const isReady = 'not-a-guard';
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        options: [{ guardFunctions: ['isReady'] }],
        errors: [{ messageId: 'noFalsyCheck', suggestions: [] }],
      },

      // ---- REGRESSIONS: excludeFiles (issue #1509) ----

      // 47. The unexcluded twin of valid case 23: identical filename and code,
      // no options, so the default exclusion list decides nothing here.
      {
        filename: 'src/components/UserCard.tsx',
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `),
              },
            ],
          },
        ],
      },

      // 48. The other direction: an empty list retracts the default exemption
      // for the guard's own module, so that file is linted like any other. The
      // guard is declared locally there, so the suggestion calls it without
      // importing it.
      {
        filename: 'src/types/FirestoreSnapshotState.ts',
        code: `
export function isSnapshotReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        options: [{ excludeFiles: [] }],
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `
export function isSnapshotReady(value) { return typeof value !== 'string'; }
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
        `,
              },
            ],
          },
        ],
      },

      // ---- REGRESSIONS: the added import keeps the prologue intact (#1648) ----

      // 49. A file with no imports at all: the guard import goes below the
      // `'use client'` directive, which stops being a directive as soon as any
      // statement precedes it.
      {
        filename: 'src/components/Widget.tsx',
        code: `'use client';
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `'use client';
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';

const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // 50. A `#!` shebang has to stay at character 0 or the file stops parsing
      {
        filename: 'src/scripts/widget.ts',
        code: `#!/usr/bin/env node
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `#!/usr/bin/env node
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';

const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // 51. A header comment covers the code below it, so the import lands
      // under it rather than between the comment and its subject
      {
        filename: 'src/components/Widget.tsx',
        code: `// @ts-nocheck
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `// @ts-nocheck
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';

const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // 52. Control for 49-51: an existing import already sits below the
      // directive, so the guard import joins that block
      {
        filename: 'src/components/Widget.tsx',
        code: `'use client';
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `'use client';
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // 53. A suppression comment binds the line under it, so the import goes
      // above the comment instead of stealing its subject — and still below the
      // directive
      {
        filename: 'src/components/Widget.tsx',
        code: `'use client';
// eslint-disable-next-line no-console
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `'use client';
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';

// eslint-disable-next-line no-console
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // 54. The import block is joined below a shebang too, so the file still
      // parses after the suggestion is applied
      {
        filename: 'src/scripts/widget.ts',
        code: `#!/usr/bin/env node
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
`,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: `#!/usr/bin/env node
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
import { useDocSnapshot } from 'src/hooks/useDocSnapshot';
const state = useDocSnapshot({ docPath });
if (isSnapshotReady(state)) { return state.name; }
`,
              },
            ],
          },
        ],
      },

      // ---- REGRESSIONS: `??` is a fallback form too (issue #2315) ----
      // `prefer-nullish-coalescing-boolean-props` rewrites `state || fallback`
      // to `state ?? fallback`. The violation survives that rewrite verbatim —
      // no member of the union is null or undefined — so each case below mirrors
      // the `||` case of the same shape.

      // 55. The post-rewrite spelling of case 11
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const data = state ?? defaultUser;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useCachedDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : defaultUser;
        `),
              },
            ],
          },
        ],
      },

      // 56. The post-rewrite spelling of case 21
      {
        code: `
const state = useDocSnapshot({ docPath });
const data = state ?? null;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : null;
        `),
              },
            ],
          },
        ],
      },

      // 57. Chained `??` is parenthesized so the conditional does not swallow
      // the remaining operands (the post-rewrite spelling of case 25)
      {
        code: `
const state = useDocSnapshot({ docPath });
const data = state ?? cached ?? fallback;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const data = (isSnapshotReady(state) ? state : cached) ?? fallback;
        `),
              },
            ],
          },
        ],
      },

      // 58. `??` inside JSX needs no extra parentheses (case 26's spelling)
      {
        code: `
const state = useDocSnapshot({ docPath });
return <div>{state ?? <Spinner />}</div>;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
return <div>{isSnapshotReady(state) ? state : <Spinner />}</div>;
        `),
              },
            ],
          },
        ],
      },

      // 59. Source parentheses already group the expression (case 27's spelling)
      {
        code: `
const state = useDocSnapshot({ docPath });
const id = (state ?? fallback).id;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const id = (isSnapshotReady(state) ? state : fallback).id;
        `),
              },
            ],
          },
        ],
      },

      // 60. An argument position binds loosely enough for the bare conditional
      {
        code: `
const state = useDocSnapshot({ docPath });
render(state ?? defaultUser);
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
render(isSnapshotReady(state) ? state : defaultUser);
        `),
              },
            ],
          },
        ],
      },

      // 61. The configured guard drives the `??` rewrite too (case 40's
      // spelling), so the option is not silently confined to `||`
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const data = state ?? defaultUser;
        `,
        options: [
          {
            guardFunctions: ['isSnapshotDataReady'],
            guardImportSource: 'src/utils/guards',
          },
        ],
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withImport(
                  'isSnapshotDataReady',
                  'src/utils/guards',
                  `
const state = useCachedDocSnapshot({ docPath });
const data = isSnapshotDataReady(state) ? state : defaultUser;
        `,
                ),
              },
            ],
          },
        ],
      },

      // 62. The filename valid case 29 excludes, with no options: the exclusion
      // is the only thing keeping that case quiet.
      {
        filename: 'src/components/UserCard.tsx',
        code: `
const state = useDocSnapshot({ docPath });
const data = state ?? defaultUser;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : defaultUser;
        `),
              },
            ],
          },
        ],
      },

      // 63. A file already importing the guard gets no duplicate import for the
      // `??` arm either
      {
        code: `
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
const data = state ?? defaultUser;
        `,
        errors: [
          {
            messageId: 'noNullishFallback',
            suggestions: [
              {
                messageId: 'noNullishFallback',
                output: `
import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';
const state = useDocSnapshot({ docPath });
const data = isSnapshotReady(state) ? state : defaultUser;
        `,
              },
            ],
          },
        ],
      },

      // 64. `&&` keeps its own arm and message: widening the operator gate must
      // not have rerouted the narrowing form through the fallback rewrite.
      {
        code: `
const state = useDocSnapshot({ docPath });
const label = state && state.name;
        `,
        errors: [
          {
            messageId: 'noFalsyCheck',
            suggestions: [
              {
                messageId: 'noFalsyCheck',
                output: withGuardImport(`
const state = useDocSnapshot({ docPath });
const label = isSnapshotReady(state) && state.name;
        `),
              },
            ],
          },
        ],
      },
    ],
  },
);
