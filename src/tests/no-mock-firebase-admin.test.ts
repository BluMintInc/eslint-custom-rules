import { ruleTesterTs } from '../utils/ruleTester';
import { noMockFirebaseAdmin } from '../rules/no-mock-firebase-admin';

const errorFor = (modulePath: string) => ({
  messageId: 'noMockFirebaseAdmin' as const,
  data: { modulePath },
});

ruleTesterTs.run('no-mock-firebase-admin', noMockFirebaseAdmin, {
  valid: [
    // Frontend-tier module (src/config/firebaseAdmin) has NO shared
    // jest.setup.node.js mock -- only functions/src/config/firebaseAdmin is
    // auto-mocked there. A local jest.mock for this resolved path is the only
    // way to satisfy Next.js API-route tests exercising assertPostRequest.
    {
      code: `jest.mock('../../../config/firebaseAdmin', () => ({
        auth: { verifyIdToken: jest.fn() },
        db: { collection: jest.fn(), doc: jest.fn() },
      }));`,
      filename: 'src/pages/api/test/kv.test.ts',
    },
    // Frontend tier reached from a test colocated under src/__tests__
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        auth: { verifyIdToken: jest.fn() },
      }));`,
      filename: 'src/__tests__/pages/stream-settings.test.tsx',
    },
    // Frontend tier addressed with a bare (root-relative) specifier
    {
      code: `jest.mock('src/config/firebaseAdmin', () => ({ db: {} }));`,
      filename:
        'src/__tests__/pages/[utc]/[groupId]/stream-settings/index.test.tsx',
    },
    {
      code: `jest.mock('src/config/firebaseAdmin');`,
      filename:
        'src/components/snapshots/server/buildPreemptionSnapshotStrategy.test.ts',
    },
    // Bare frontend specifier from a deeply nested frontend test
    {
      code: `jest.mock('src/config/firebaseAdmin', () => ({
        db: { collection: jest.fn() },
      }));`,
      filename:
        'src/components/tournament/registration/server/buildRegistrationSeeds.test.ts',
    },
    // Frontend tier reached from a component-level server helper test
    {
      code: `jest.mock('../../../config/firebaseAdmin');`,
      filename:
        'src/components/stream-settings/server/buildStreamSettingsSeeds.test.ts',
    },
    // Frontend tier reached from Next.js API-route tests
    {
      code: `jest.mock('../../../config/firebaseAdmin');`,
      filename: 'src/pages/api/short-url/index.test.ts',
    },
    {
      code: `jest.mock('../../../config/firebaseAdmin', () => ({
        auth: { verifyIdToken: jest.fn() },
      }));`,
      filename: 'src/pages/api/coinflow/withdraw-quote.test.ts',
    },
    {
      code: `jest.mock('../../../config/firebaseAdmin', () => ({
        auth: { verifyIdToken: jest.fn() },
      }));`,
      filename: 'src/pages/api/coinflow/sign-in-event.test.ts',
    },
    // Frontend tier, no factory
    {
      code: `jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/__tests__/pages/foo.test.tsx',
    },
    // Frontend tier written as a template literal
    {
      code: 'jest.mock(`../../config/firebaseAdmin`);',
      filename: 'src/__tests__/pages/foo.test.tsx',
    },
    // Frontend tier with an explicit module extension
    {
      code: `jest.mock('../../config/firebaseAdmin.ts');`,
      filename: 'src/__tests__/pages/foo.test.tsx',
    },
    // Frontend tier from a .spec file
    {
      code: `jest.mock('../../../config/firebaseAdmin');`,
      filename: 'src/pages/api/short-url/index.spec.ts',
    },
    // Frontend tier reached with a leading ./ segment
    {
      code: `jest.mock('./config/firebaseAdmin', () => ({}));`,
      filename: 'src/test.test.ts',
    },
    // ---------------------------------------------------------------------
    // Backend tier, BARE call. `jest.setup.node.js` already runs
    // `jest.mock('./functions/src/config/firebaseAdmin')` with no factory, so a
    // local bare call is the IDENTICAL call: it re-activates the manual mock at
    // functions/src/config/__mocks__/firebaseAdmin.ts. It replaces nothing and
    // supplies no divergent state. Only a factory overrides the shared mock.
    // ---------------------------------------------------------------------
    {
      /**
       * A BARE jest.mock activates the project's own manual mock in
       * __mocks__/ — it replaces nothing and supplies no divergent state, so
       * the rule's own stated rationale ("overriding it creates divergent
       * Firestore/Auth state") does not apply. A suite needs this form to
       * obtain per-call spies on db.doc / db.runTransaction, which the shared
       * FakeFirestore instance does not expose.
       */
      code: `jest.mock('../../../config/firebaseAdmin');`,
      filename:
        'functions/src/firestore/GitHubIssue/changeHandlers/respondGitHubIssueChange.test.ts',
    },
    // Same bare re-activation from a payout test.
    {
      code: `jest.mock('../../../config/firebaseAdmin');`,
      filename:
        'functions/src/util/tournament/payout/deriveIsChampionPayout.test.ts',
    },
    // A written-out module extension names the same backend module, so the bare
    // call is the same re-activation.
    {
      code: `jest.mock('../../config/firebaseAdmin.ts');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Bare backend re-activation written as an uninterpolated template literal.
    {
      code: 'jest.mock(`../../config/firebaseAdmin`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Bare backend re-activation from a .spec file.
    {
      code: `jest.mock('../config/firebaseAdmin');`,
      filename: 'functions/src/util/updateIfExists.spec.ts',
    },
    // Bare backend re-activation addressed through a workspace alias: the
    // specifier still names functions/src/config/firebaseAdmin.
    {
      code: `jest.mock('@project/functions/src/config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
    },
    // Mixed tiers, neither of which overrides a shared mock: the backend call is
    // bare (re-activation) and the frontend module has no shared mock at all.
    {
      code: `
        jest.mock('../../config/firebaseAdmin');
        jest.mock('src/config/firebaseAdmin', () => ({}));`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // An explicit `undefined` placeholder is how a suite reaches the third
    // argument; it supplies no module body, so the call is still the bare one.
    {
      code: `jest.mock('../../config/firebaseAdmin', undefined, { virtual: true });`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    {
      code: `jest.mock('../../config/firebaseAdmin', undefined);`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Interpolated specifiers name a module only known at runtime, so no tier
    // can be attributed. The trailing interpolation makes these a DIFFERENT
    // module than firebaseAdmin even on a backend filename.
    {
      code: 'jest.mock(`../../config/firebaseAdmin${env}`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    {
      code: 'jest.mock(`../../config/firebaseAdmin${env}`, () => ({ db: {} }));',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Interpolation in a leading segment leaves the basename unknowable too.
    {
      code: 'jest.mock(`${root}/functions/src/config/firebaseAdmin`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    {
      code: 'jest.mock(`../../config/${name}`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    {
      code: 'jest.mock(`${dir}/firebaseAdmin`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // A factory that hand-rolls `collectionGroup`: the shared mockFirestore fake
    // has no collectionGroup at all, so the prescribed remedy cannot express the
    // surface under test. Modelled on agora's
    // migrateOverlaySettingsToPerAlert.f.test.ts, which must exercise the real
    // __name__-ordered, index-free pagination loop.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => {
        const state = { docs: [], updates: [] };
        const buildQuery = (afterPath, limitCount) => ({
          orderBy: () => buildQuery(afterPath, limitCount),
          limit: (count) => buildQuery(afterPath, count),
          startAfter: (snapshot) => buildQuery(snapshot.ref.path, limitCount),
          get: async () => ({ docs: state.docs, empty: state.docs.length === 0 }),
        });
        return {
          db: {
            collectionGroup: (name) => buildQuery(),
            batch: () => ({ update: jest.fn(), commit: jest.fn() }),
          },
          __mockState: state,
        };
      });`,
      filename:
        'functions/src/callable/scripts/migrateOverlaySettingsToPerAlert.f.test.ts',
    },
    // The collectionGroup call sits deep inside a returned object's method body
    // rather than at the top level of the factory's return value.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => {
        const actual = jest.requireActual('firebase-admin/firestore');
        return {
          db: {
            queries: {
              paginate(name, cursor) {
                return actual
                  .collectionGroup(name)
                  .orderBy('__name__')
                  .limit(500)
                  .startAfter(cursor);
              },
            },
          },
        };
      });`,
      filename:
        'functions/src/callable/scripts/backfillOverlaySettings.f.test.ts',
    },
    // The same surface declared with a string key
    {
      code: `jest.mock('functions/src/config/firebaseAdmin', () => ({
        db: { 'collectionGroup': jest.fn(() => ({ get: jest.fn() })) },
      }));`,
      filename: 'src/test.test.ts',
    },
    // Valid usage of mockFirestore
    {
      code: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

      beforeEach(() => {
        mockFirestore({
          'some/path': [{ id: 'test' }],
        });
      });`,
      filename: 'src/test.test.ts',
    },
    // Other module mocks
    {
      code: `jest.mock('some-other-module');`,
      filename: 'src/test.test.ts',
    },
    // Similar but different paths, even when they sit beside the backend module
    {
      code: `jest.mock('../../config/firebaseAdminHelper');`,
      filename: 'src/test.test.ts',
    },
    {
      code: `jest.mock('../config/firebaseAdminHelper');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    {
      code: `jest.mock('../../config/firebase-admin-utils');`,
      filename: 'src/test.test.ts',
    },
    {
      code: `jest.mock('../config/firebase-admin-utils');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // The firebase-admin SDK itself is a different module
    {
      code: `jest.mock('firebase-admin/firestore');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // A colocated manual mock file is not the module under protection
    {
      code: `jest.mock('../config/firebaseAdmin.mock');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Interpolated specifiers cannot be attributed to a module
    {
      code: 'jest.mock(`../../config/${name}`);',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
    },
    // Non-test files should be ignored
    {
      code: `jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/component.tsx',
    },
    {
      code: `jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/utils.ts',
    },
    {
      code: `jest.mock('functions/src/config/firebaseAdmin');`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.ts',
    },
    // Comments and whitespace variations
    {
      code: `// This is a valid mock
      jest.mock('some-other-module'); // End of line comment`,
      filename: 'src/test.test.ts',
    },
    // Dynamic imports (not jest.mock)
    {
      code: `import('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
    },
    // Regular require statements
    {
      code: `const firebaseAdmin = require('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
    },
    // Complex but valid scenarios
    {
      code: `
        const mockPath = '../../config/firebaseAdmin';
        const str = 'jest.mock("../../config/firebaseAdmin")';
        const obj = {
          path: '../../config/firebaseAdmin',
          mock: jest.fn()
        };`,
      filename: 'src/test.test.ts',
    },
  ],
  invalid: [
    // Backend tier WITH a factory: the factory replaces the manual mock
    // jest.setup.node.js activates, which is the override this rule exists to
    // catch.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: mockFirestore()
      }));`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    {
      code: `jest.mock('../../../../config/firebaseAdmin', () => ({
        db: mockFirestore(),
      }));`,
      filename:
        'functions/src/util/tournament/aggregation/__tests__/recomputeGuestlistMetadataCounts.test.ts',
      errors: [errorFor('../../../../config/firebaseAdmin')],
    },
    // The exact specifier/file pair whose BARE form is exempt above: adding a
    // factory turns re-activation into an override, so protection survives the
    // bare-call exemption.
    {
      code: `jest.mock('../../../config/firebaseAdmin', () => ({
        db: { doc: jest.fn() },
      }));`,
      filename:
        'functions/src/util/tournament/payout/deriveIsChampionPayout.test.ts',
      errors: [errorFor('../../../config/firebaseAdmin')],
    },
    // Backend tier with an explicit module extension, overridden by a factory
    {
      code: `jest.mock('../../config/firebaseAdmin.ts', () => ({ db: {} }));`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin.ts')],
    },
    // Backend tier written as a template literal, overridden by a factory
    {
      code: 'jest.mock(`../../config/firebaseAdmin`, () => ({ db: {} }));',
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Backend tier from a .spec file, overridden by a factory
    {
      code: `jest.mock('../config/firebaseAdmin', () => ({ auth: jest.fn() }));`,
      filename: 'functions/src/util/updateIfExists.spec.ts',
      errors: [errorFor('../config/firebaseAdmin')],
    },
    // A factory need not be written inline: any second argument that is not the
    // `undefined` placeholder substitutes a module body.
    {
      code: `jest.mock('../../config/firebaseAdmin', buildFirebaseAdminMock);`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Backend tier addressed with a bare specifier
    {
      code: `jest.mock('functions/src/config/firebaseAdmin', () => ({
        db: mockFirestore(),
        auth: jest.fn(),
        storage: jest.fn()
      }));`,
      filename: 'src/test.test.ts',
      errors: [errorFor('functions/src/config/firebaseAdmin')],
    },
    // Backend tier addressed through a workspace alias, overridden by a factory
    {
      code: `jest.mock('@project/functions/src/config/firebaseAdmin', () => ({
        db: mockFirestore(),
      }));`,
      filename: 'src/test.test.ts',
      errors: [errorFor('@project/functions/src/config/firebaseAdmin')],
    },
    // Mixed tiers in one file: only the backend factory overrides a shared mock
    {
      code: `
        jest.mock('../../config/firebaseAdmin', () => ({ db: {} }));
        jest.mock('src/config/firebaseAdmin', () => ({}));`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Unattributable specifiers stay protected, INCLUDING the bare form. The
    // bare-call exemption rests on a KNOWN manual mock sibling; for an
    // unfamiliar layout no such sibling is known, so a bare call may fall
    // through to Jest's automock, which replaces every export with an empty
    // jest.fn() — divergent state by any measure.
    {
      code: `jest.mock('firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [errorFor('firebaseAdmin')],
    },
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: mockFirestore()
      }));`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // The `undefined` placeholder reads as "no factory", which is exempt only in
    // the backend tier; an unattributable module still reports.
    {
      code: `jest.mock('firebaseAdmin', undefined, { virtual: true });`,
      filename: 'src/test.test.ts',
      errors: [errorFor('firebaseAdmin')],
    },
    // Simple mock without factory
    {
      code: `jest.mock('../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../config/firebaseAdmin')],
    },
    // Mock with requireActual
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: jest.requireActual('../../config/firebaseAdmin').db,
      }));`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Mock with resetModules
    {
      code: `jest.resetModules();
      jest.mock('../../config/firebaseAdmin');`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Multi-line variations
    {
      code: `
        jest
          .mock(
            '../../config/firebaseAdmin'
          );`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // With comments
    {
      code: `// Mock firebase admin
      jest.mock(
        // Path to mock
        '../../config/firebaseAdmin'
        // Factory function
      );`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Template literal path
    {
      code: 'jest.mock(`../../config/firebaseAdmin`);',
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Multiple mocks in one file; the frontend-tier mock is exempt
    {
      code: `
        jest.mock('../../config/firebaseAdmin');
        jest.mock('../other/module');
        jest.mock('./config/firebaseAdmin', () => ({}));`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Mock with complex factory
    {
      code: `
        jest.mock('../../config/firebaseAdmin', () => {
          const originalModule = jest.requireActual('../../config/firebaseAdmin');
          return {
            ...originalModule,
            db: mockFirestore(),
            auth: () => ({
              verifyIdToken: jest.fn(),
              createCustomToken: jest.fn(),
            }),
          };
        });`,
      filename: 'src/test.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // The collectionGroup exemption is pinned to collectionGroup itself, not to
    // "the factory is large": this is the same fake with plain `collection`,
    // which the shared mockFirestore expresses, so it still reports.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => {
        const state = { docs: [], updates: [] };
        const buildQuery = (afterPath, limitCount) => ({
          orderBy: () => buildQuery(afterPath, limitCount),
          limit: (count) => buildQuery(afterPath, count),
          startAfter: (snapshot) => buildQuery(snapshot.ref.path, limitCount),
          get: async () => ({ docs: state.docs, empty: state.docs.length === 0 }),
        });
        return {
          db: {
            collection: (name) => buildQuery(),
            batch: () => ({ update: jest.fn(), commit: jest.fn() }),
          },
          __mockState: state,
        };
      });`,
      filename:
        'functions/src/callable/scripts/migrateOverlaySettingsToPerAlert.f.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Cursor pagination alone is expressible through the shared fake, so
    // orderBy/limit/startAfter without collectionGroup stays reported.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: {
          collection: () => ({
            orderBy: () => ({
              limit: () => ({ startAfter: () => ({ get: jest.fn() }) }),
            }),
          }),
        },
      }));`,
      filename:
        'functions/src/callable/scripts/migrateOverlaySettingsToPerAlert.f.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
    // Merely naming collectionGroup in a string is not exercising it.
    {
      code: `jest.mock('../../config/firebaseAdmin', () => ({
        db: {
          collection: () => {
            throw new Error('collectionGroup is not supported here');
          },
        },
      }));`,
      filename: 'functions/src/util/realtimeDb/updateIfExists.test.ts',
      errors: [errorFor('../../config/firebaseAdmin')],
    },
  ],
});
