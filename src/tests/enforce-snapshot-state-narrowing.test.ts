import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceSnapshotStateNarrowing } from '../rules/enforce-snapshot-state-narrowing';

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

      // 1. !state from useDocSnapshot (early return pattern)
      {
        code: `
const state = useDocSnapshot({ docPath });
if (!state) return null;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 2. if (state) truthy check from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
if (state) { return state.name; }
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 3. Ternary treating state as boolean from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
return state ? <MatchView match={state} /> : null;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 4. Logical AND short-circuit from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
return state && state.name;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 5. Double negation !!state from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
const ready = !!state;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 6. Boolean() coercion from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
if (Boolean(state)) { return state.name; }
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 7. typeof state === 'object' from useDocSnapshot (bad typeof)
      {
        code: `
const state = useDocSnapshot({ docPath });
if (typeof state === 'object') { return state.name; }
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 8. typeof state !== 'string' from useDocSnapshot (equivalent to isSnapshotReady)
      {
        code: `
const state = useDocSnapshot({ docPath });
if (typeof state !== 'string') { return state.name; }
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 9. typeof state === 'object' from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (typeof state === 'object' && state !== null) { return state; }
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 10. typeof state !== 'string' from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (typeof state !== 'string') { return state; }
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 11. Logical OR short-circuit from useCachedDocSnapshot
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const data = state || defaultUser;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 12. !state from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
if (!state) return null;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 13. typeof state === 'object' from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (typeof state === 'object') { return state; }
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 14. if (state) from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (state) { return state; }
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 15. if (state) from useCachedDocSnapshot
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
if (state) return state.name;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 16. state && state.name from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
return state && state.length > 0;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 17. ternary from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
return state ? state.map(x => x.id) : [];
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 18. !!state from useCollectionSnapshot
      {
        code: `
const state = useCollectionSnapshot({ collectionPath });
const isReady = !!state;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 19. Boolean(state) from useCachedDocSnapshot
      {
        code: `
const state = useCachedDocSnapshot({ docPath });
const flag = Boolean(state);
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 20. typeof state !== 'string' from useFirestore
      {
        code: `
const state = useFirestore({ path });
if (typeof state !== 'string') return state;
        `,
        errors: [{ messageId: 'noRawTypeof' }],
      },

      // 21. state || fallback from useDocSnapshot
      {
        code: `
const state = useDocSnapshot({ docPath });
const data = state || null;
        `,
        errors: [{ messageId: 'noFalsyCheck' }],
      },

      // 22. typeof state === 'object' with custom snapshotHooks option
      {
        code: `
const state = useMyCustomSnapshot({ path });
if (typeof state === 'object') { return state; }
        `,
        options: [{ snapshotHooks: ['useMyCustomSnapshot'] }],
        errors: [{ messageId: 'noRawTypeof' }],
      },
    ],
  },
);
