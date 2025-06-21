import { ruleTesterTs } from '../utils/ruleTester';
import { preferParamsOverParentId } from '../rules/prefer-params-over-parent-id';

ruleTesterTs.run(
  'prefer-params-over-parent-id-core',
  preferParamsOverParentId,
  {
    valid: [
      // Using params correctly in DocumentChangeHandler
      {
        code: `
        export const updateRelatedDocuments: DocumentChangeHandler<
          OverwolfUpdate,
          OverwolfUpdatePath
        > = async (event) => {
          const {
            data: change,
            params: { userId }
          } = event;

          const userProfile = await db.doc(\`UserProfile/\${userId}\`).get();
        };
      `,
      },

      // Non-handler function using .ref.parent.id (should be ignored)
      {
        code: `
        function regularFunction() {
          const parentId = someDoc.ref.parent.id;
          return parentId;
        }
      `,
      },

      // Handler function not using .ref.parent.id
      {
        code: `
        export const validHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          console.log('Document changed:', change.after.data());
        };
      `,
      },
    ],

    invalid: [
      // Basic .ref.parent.id usage in DocumentChangeHandler (no auto-fix when params not in scope)
      {
        code: `
        export const updateRelatedDocuments: DocumentChangeHandler<
          OverwolfUpdate,
          OverwolfUpdatePath
        > = async (event) => {
          const { data: change } = event;

          const userId = change.after.ref.parent.id;

          const userProfile = await db.doc(\`UserProfile/\${userId}\`).get();
        };
      `,
        errors: [{ messageId: 'preferParams' }],
      },

      // Auto-fix should work when params is in scope
      {
        code: `
        export const withParamsInScope: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const userId = change.after.ref.parent.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const withParamsInScope: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const userId = params.userId;
        };
      `,
      },

      // Auto-fix should work with destructured params in function signature
      {
        code: `
        export const withDestructuredParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params: { userId } }) => {
          const parentId = change.after.ref.parent.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const withDestructuredParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params: { userId } }) => {
          const parentId = params.userId;
        };
      `,
      },

      // Optional chaining should work with auto-fix when params in scope
      {
        code: `
        export const withOptionalChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const userId = change.after?.ref?.parent?.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const withOptionalChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const userId = params?.userId;
        };
      `,
      },

      // Multiple parent levels should suggest parentId
      {
        code: `
        export const multipleParents: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const grandparentId = change.after.ref.parent.parent.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const multipleParents: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          const grandparentId = params.parentId;
        };
      `,
      },

      // No auto-fix when params not in scope (different destructuring)
      {
        code: `
        export const noParamsInScope: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId = change.after.ref.parent.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
      },

      // Transaction handler with params should get auto-fix
      {
        code: `
        export const transactionWithParams: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change, params } = event;

          const userId = change.after.ref.parent.id;
          transaction.update(db.doc(\`User/\${userId}\`), { updated: true });
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const transactionWithParams: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change, params } = event;

          const userId = params.userId;
          transaction.update(db.doc(\`User/\${userId}\`), { updated: true });
        };
      `,
      },

      // RealtimeDb handler should work
      {
        code: `
        export const realtimeWithParams: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot, params } = event;

          const gameId = snapshot.ref.parent.id;
        };
      `,
        errors: [{ messageId: 'preferParams' }],
        output: `
        export const realtimeWithParams: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot, params } = event;

          const gameId = params.userId;
        };
      `,
      },
    ],
  },
);
