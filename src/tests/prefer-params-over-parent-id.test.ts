import { ruleTesterTs } from '../utils/ruleTester';
import { preferParamsOverParentId } from '../rules/prefer-params-over-parent-id';

ruleTesterTs.run('prefer-params-over-parent-id', preferParamsOverParentId, {
  valid: [
    // Using params correctly
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

    // Using destructured params
    {
      code: `
        export const handleUserUpdate: DocumentChangeHandler<
          UserData,
          UserProfilePath
        > = async (event) => {
          const { params: { userId } } = event;
          console.log(userId);
        };
      `,
    },

    // Non-handler function (should be ignored)
    {
      code: `
        const regularFunction = async (data: any) => {
          const parentId = data.ref.parent.id;
          return parentId;
        };
      `,
    },

    // Different property access (not parent.id)
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const docId = change.after.ref.id;
        };
      `,
    },
  ],

  invalid: [
    // Basic parent.id access
    {
      code: `
        export const updateRelatedDocuments: DocumentChangeHandler<
          OverwolfUpdate,
          OverwolfUpdatePath
        > = async (event) => {
          const { data: change } = event;
          const userId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Optional chaining
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const maybeParentId = change.after?.ref?.parent?.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Multiple parent levels
    {
      code: `
        export const handler: DocumentChangeHandler<Round, RoundPath> = async (event) => {
          const { data: change } = event;
          const grandparentId = change.after.ref.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Variable assignment
    {
      code: `
        export const handler: DocumentChangeHandler<Data, UserProfilePath> = async (event) => {
          const { data: change } = event;
          const parentId = change.after.ref.parent.id;
          console.log(parentId);
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Using before instead of after
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const userId = change.before.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // RealtimeDB handler
    {
      code: `
        export const realtimeHandler: RealtimeDbChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const userId = change.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Transaction handler
    {
      code: `
        export const transactionHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;
          const userId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // RealtimeDB transaction handler
    {
      code: `
        export const realtimeTransactionHandler: RealtimeDbChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;
          const userId = change.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Inline usage
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          await db.doc(\`UserProfile/\${change.after.ref.parent.id}\`).get();
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Complex expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const result = someFunction(change.after.ref.parent.id, 'other', 'args');
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Arrow function without block
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = (event) =>
          event.data.after.ref.parent.id;
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Nested function call
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          return {
            parentId: change.after.ref.parent.id,
            docId: change.after.ref.id
          };
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Multiple violations in same function
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const parentId1 = change.after.ref.parent.id;
          const parentId2 = change.before.ref.parent.id;
        };
      `,
      errors: [
        { messageId: 'preferParamsWithSuggestion' },
        { messageId: 'preferParamsWithSuggestion' }
      ],
    },

    // Property assignment
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const obj = {
            id: change.after.ref.parent.id
          };
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Array element
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const ids = [change.after.ref.parent.id, 'other-id'];
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Conditional expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const id = condition ? change.after.ref.parent.id : 'default';
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Template literal
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const path = \`users/\${change.after.ref.parent.id}/profile\`;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Method call
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          console.log(change.after.ref.parent.id);
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Return statement
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          return change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Await expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          await someAsyncFunction(change.after.ref.parent.id);
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Logical expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const result = change.after.ref.parent.id || 'default';
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Binary expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const isEqual = change.after.ref.parent.id === 'some-id';
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Unary expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const hasParent = !!change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Assignment expression
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          let parentId;
          parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },

    // Update expression context
    {
      code: `
        export const handler: DocumentChangeHandler<Data, Path> = async (event) => {
          const { data: change } = event;
          const ids = [];
          ids.push(change.after.ref.parent.id);
        };
      `,
      errors: [{ messageId: 'preferParamsWithSuggestion' }],
    },
  ],
});
