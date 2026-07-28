import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceSnapshotStateNarrowing } from '../rules/enforce-snapshot-state-narrowing';

/**
 * Suggestions bring the guard into scope, so every expected output for a file
 * that does not already import `isSnapshotReady` is prefixed with the canonical
 * import.
 */
const withGuardImport = (code: string) =>
  `import { isSnapshotReady } from 'src/types/FirestoreSnapshotState';\n${code}`;

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
    ],
  },
);
