import { ruleTesterTs } from '../utils/ruleTester';
import { preferParamsOverParentId } from '../rules/prefer-params-over-parent-id';

ruleTesterTs.run('prefer-params-over-parent-id', preferParamsOverParentId, {
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

    // Using params correctly in DocumentChangeHandlerTransaction
    {
      code: `
        export const updateInTransaction: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { params: { userId } } = event;

          const userRef = db.doc(\`User/\${userId}\`);
          transaction.update(userRef, { lastModified: new Date() });
        };
      `,
    },

    // Using params correctly in RealtimeDbChangeHandler
    {
      code: `
        export const onDataChange: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { params: { gameId } } = event;

          console.log(\`Game \${gameId} was updated\`);
        };
      `,
    },

    // Using params correctly in RealtimeDbChangeHandlerTransaction
    {
      code: `
        export const updateGameTransaction: RealtimeDbChangeHandlerTransaction<
          GameData,
          GamePath
        > = async (event, transaction) => {
          const { params: { gameId, playerId } } = event;

          transaction.update(\`games/\${gameId}/players/\${playerId}\`, { active: true });
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

    // Using different property access that's not .ref.parent.id
    {
      code: `
        export const anotherHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const docId = change.after.id;
          const refPath = change.after.ref.path;
        };
      `,
    },

    // Using params with destructuring
    {
      code: `
        export const handlerWithDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params: { userId, docId } }) => {
          console.log(\`User \${userId}, doc \${docId}\`);
        };
      `,
    },
  ],

  invalid: [
    // Basic .ref.parent.id usage in DocumentChangeHandler
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
      output: `
        export const updateRelatedDocuments: DocumentChangeHandler<
          OverwolfUpdate,
          OverwolfUpdatePath
        > = async (event) => {
          const { data: change } = event;

          const userId = params.userId;

          const userProfile = await db.doc(\`UserProfile/\${userId}\`).get();
        };
      `,
    },

    // Using .ref.parent.id directly in expression
    {
      code: `
        export const directUsage: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userProfile = await db.doc(\`UserProfile/\${change.after.ref.parent.id}\`).get();
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const directUsage: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userProfile = await db.doc(\`UserProfile/\${params.userId}\`).get();
        };
      `,
    },

    // Using change.before.ref.parent.id
    {
      code: `
        export const beforeRefUsage: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId = change.before.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const beforeRefUsage: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId = params.userId;
        };
      `,
    },

    // Optional chaining usage
    {
      code: `
        export const optionalChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId = change.after?.ref?.parent?.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const optionalChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId = params?.userId;
        };
      `,
    },

    // Multiple parent levels (grandparent)
    {
      code: `
        export const grandparentAccess: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const grandparentId = change.after.ref.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const grandparentAccess: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const grandparentId = params.parentId;
        };
      `,
    },

    // DocumentChangeHandlerTransaction
    {
      code: `
        export const transactionHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;

          const userId = change.after.ref.parent.id;
          transaction.update(db.doc(\`User/\${userId}\`), { updated: true });
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const transactionHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;

          const userId = params.userId;
          transaction.update(db.doc(\`User/\${userId}\`), { updated: true });
        };
      `,
    },

    // RealtimeDbChangeHandler
    {
      code: `
        export const realtimeHandler: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const gameId = snapshot.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const realtimeHandler: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const gameId = params.userId;
        };
      `,
    },

    // RealtimeDbChangeHandlerTransaction
    {
      code: `
        export const realtimeTransactionHandler: RealtimeDbChangeHandlerTransaction<
          GameData,
          GamePath
        > = async (event, transaction) => {
          const { data: snapshot } = event;

          const gameId = snapshot.ref.parent.id;
          transaction.update(\`games/\${gameId}\`, { active: true });
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const realtimeTransactionHandler: RealtimeDbChangeHandlerTransaction<
          GameData,
          GamePath
        > = async (event, transaction) => {
          const { data: snapshot } = event;

          const gameId = params.userId;
          transaction.update(\`games/\${gameId}\`, { active: true });
        };
      `,
    },

    // Arrow function with implicit return
    {
      code: `
        export const implicitReturn: DocumentChangeHandler<
          UserData,
          UserPath
        > = (event) => event.data.after.ref.parent.id;
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const implicitReturn: DocumentChangeHandler<
          UserData,
          UserPath
        > = (event) => params.userId;
      `,
    },

    // Function expression
    {
      code: `
        const handler: DocumentChangeHandler<UserData, UserPath> = function(event) {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        const handler: DocumentChangeHandler<UserData, UserPath> = function(event) {
          const parentId = params.userId;
          return parentId;
        };
      `,
    },

    // Multiple usages in same function
    {
      code: `
        export const multipleUsages: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId1 = change.after.ref.parent.id;
          const userId2 = change.before.ref.parent.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' }
      ],
      output: `
        export const multipleUsages: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userId1 = params.userId;
          const userId2 = params.userId;
        };
      `,
    },

    // Complex member expression chain
    {
      code: `
        export const complexChain: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = someFunction(change.after.ref.parent.id, 'other', 'args');
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const complexChain: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = someFunction(params.userId, 'other', 'args');
        };
      `,
    },

    // Nested function calls
    {
      code: `
        export const nestedCalls: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          await updateUser(change.after.ref.parent.id);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const nestedCalls: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          await updateUser(params.userId);
        };
      `,
    },

    // Object property access
    {
      code: `
        export const objectProperty: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const config = {
            userId: change.after.ref.parent.id,
            timestamp: Date.now()
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const objectProperty: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const config = {
            userId: params.userId,
            timestamp: Date.now()
          };
        };
      `,
    },

    // Template literal usage
    {
      code: `
        export const templateLiteral: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const message = \`User \${change.after.ref.parent.id} was updated\`;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const templateLiteral: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const message = \`User \${params.userId} was updated\`;
        };
      `,
    },

    // Conditional expression
    {
      code: `
        export const conditionalExpression: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const id = change.after ? change.after.ref.parent.id : null;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const conditionalExpression: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const id = change.after ? params.userId : null;
        };
      `,
    },

    // Array element
    {
      code: `
        export const arrayElement: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const ids = [change.after.ref.parent.id, 'other-id'];
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const arrayElement: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const ids = [params.userId, 'other-id'];
        };
      `,
    },

    // Return statement
    {
      code: `
        export const returnStatement: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          return change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const returnStatement: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          return params.userId;
        };
      `,
    },

    // Assignment to existing variable
    {
      code: `
        export const assignment: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let userId;

          userId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const assignment: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let userId;

          userId = params.userId;
        };
      `,
    },
  ],
});
