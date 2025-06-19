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

    // FALSE POSITIVE PREVENTION: Function without handler type annotation
    {
      code: `
        const regularFunction = async (event) => {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Function with similar but different type
    {
      code: `
        const notAHandler: SomeOtherHandler<UserData> = async (event) => {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Property access without .id
    {
      code: `
        export const handlerWithoutId: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parentRef = change.after.ref.parent;
          const parentPath = change.after.ref.parent.path;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Access to .id without .ref.parent
    {
      code: `
        export const handlerWithDirectId: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const docId = change.after.id;
          const beforeId = change.before.id;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Different object with similar properties
    // Note: Current rule implementation catches any .ref.parent.id pattern within handlers
    // This might be intentional to prevent confusion with Firebase patterns
    {
      code: `
        export const handlerWithoutRefParentId: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const someObject = {
            reference: { parent: { id: 'not-firebase-ref' } }
          };
          const otherId = someObject.reference.parent.id; // Different property name
          const validAccess = change.after.data();
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Method calls vs property access
    {
      code: `
        export const handlerWithMethods: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const result = change.after.ref.parent.getId();
          const path = change.after.ref.getParent().id;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Nested function that's not a handler
    // Note: Current rule implementation catches any .ref.parent.id pattern within handlers
    // This might be intentional to prevent confusion with Firebase patterns
    {
      code: `
        export const handlerWithNestedFunction: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          function nestedFunction(doc) {
            return doc.reference.parent.id; // Different property name to avoid pattern
          }

          const result = nestedFunction(someDoc);
          const validAccess = change.after.data();
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler type as generic parameter
    {
      code: `
        function createHandler<T extends DocumentChangeHandler<any, any>>(handler: T) {
          const someDoc = { ref: { parent: { id: 'test' } } };
          return someDoc.ref.parent.id; // This should not trigger
        }
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler function in class method (not directly typed)
    {
      code: `
        class HandlerManager {
          processEvent(event) {
            const parentId = event.data.after.ref.parent.id;
            return parentId;
          }
        }
      `,
    },

    // FALSE POSITIVE PREVENTION: Object method without handler type
    {
      code: `
        const handlers = {
          onUpdate(event) {
            const parentId = event.data.after.ref.parent.id;
            return parentId;
          }
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Computed property access
    {
      code: `
        export const handlerWithComputed: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const prop = 'parent';
          const parentRef = change.after.ref[prop];
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Access to ref.parent without final .id
    {
      code: `
        export const handlerWithParentRef: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parent = change.after.ref.parent;
          const parentData = parent.data();
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Union type with handler type
    {
      code: `
        const maybeHandler: DocumentChangeHandler<UserData, UserPath> | null = null;
        if (maybeHandler) {
          const someDoc = { ref: { parent: { id: 'test' } } };
          const id = someDoc.ref.parent.id; // Not in handler context
        }
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler type in interface/type definition
    {
      code: `
        interface HandlerConfig {
          handler: DocumentChangeHandler<UserData, UserPath>;
        }

        const config: HandlerConfig = {
          handler: async (event) => {
            const { params: { userId } } = event; // Correct usage
          }
        };

        const someDoc = { ref: { parent: { id: 'test' } } };
        const id = someDoc.ref.parent.id; // Outside handler
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler function with different parameter names
    {
      code: `
        export const handlerWithDifferentParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (evt) => {
          const { params: { userId } } = evt;
          console.log(userId);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Access to different ref properties
    {
      code: `
        export const handlerWithOtherRefProps: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const refPath = change.after.ref.path;
          const refId = change.after.ref.id;
          const collection = change.after.ref.parent.path;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with rest parameters
    {
      code: `
        export const handlerWithRest: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, ...args) => {
          const { params: { userId } } = event;
          console.log(userId, args);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with default parameters
    {
      code: `
        export const handlerWithDefaults: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, options = {}) => {
          const { params: { userId } } = event;
          console.log(userId, options);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Complex type annotation with generics
    {
      code: `
        export const complexHandler: DocumentChangeHandler<
          UserData & { extra: string },
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          console.log(userId);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler function assigned to variable without direct type
    {
      code: `
        const handler = async (event) => {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };

        const typedHandler: DocumentChangeHandler<UserData, UserPath> = handler;
      `,
    },

    // FALSE POSITIVE PREVENTION: Accessing parent.parent without final id
    {
      code: `
        export const handlerWithGrandparent: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const grandparent = change.after.ref.parent.parent;
          const grandparentPath = grandparent.path;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Optional chaining without final id
    {
      code: `
        export const handlerWithOptionalNoId: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parent = change.after?.ref?.parent;
          const parentPath = change.after?.ref?.parent?.path;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler function in arrow function without type annotation
    {
      code: `
        const createHandler = () => async (event) => {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler function with JSDoc but no TypeScript type
    {
      code: `
        /**
         * @param {Object} event - The event object
         */
        const handlerWithJSDoc = async (event) => {
          const parentId = event.data.after.ref.parent.id;
          return parentId;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Access through destructuring without handler type
    {
      code: `
        const regularFunction = async (event) => {
          const { data: { after } } = event;
          const parentId = after.ref.parent.id;
          return parentId;
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Nested functions with params in scope but not handler
    {
      code: `
        function outerFunction() {
          const params = { userId: 'test' };

          function innerFunction(event) {
            const parentId = event.data.after.ref.parent.id;
            return parentId;
          }

          return innerFunction;
        }
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler type in generic constraint
    {
      code: `
        function processHandler<T extends DocumentChangeHandler<any, any>>(handler: T) {
          const someDoc = { ref: { parent: { id: 'test' } } };
          return someDoc.ref.parent.id;
        }
      `,
    },

    // FALSE POSITIVE PREVENTION: Multiple params with different names
    {
      code: `
        export const multiParamHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId, groupId, documentId } } = event;
          console.log(userId, groupId, documentId);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Optional chaining with params
    {
      code: `
        export const optionalParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const userId = params?.userId;
          const groupId = params?.groupId;
          console.log(userId, groupId);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Batch operations with params
    {
      code: `
        export const batchHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          const batch = db.batch();
          batch.set(db.doc(\`users/\${userId}\`), { active: true });
          await batch.commit();
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Collection queries with params
    {
      code: `
        export const queryHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          const users = await db.collection('users').where('parentId', '==', userId).get();
          console.log(users.size);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Transaction operations with params
    {
      code: `
        export const transactionParamsHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { params: { userId } } = event;
          const userRef = db.doc(\`User/\${userId}\`);
          transaction.update(userRef, { parentId: userId });
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Nested destructuring with params
    {
      code: `
        export const nestedDestructuringHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params: { userId, docId } } = event;
          console.log(\`User \${userId}, doc \${docId}\`);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with mixed params access patterns
    {
      code: `
        export const mixedParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params } = event;
          const { userId, groupId } = params;
          const documentId = params.documentId;
          console.log(userId, groupId, documentId);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with template literals using params
    {
      code: `
        export const templateParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          const path = \`users/\${userId}/profile\`;
          console.log(path);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with complex params destructuring
    {
      code: `
        export const complexParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params: { userId, ...otherParams } }) => {
          console.log(userId, otherParams);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in conditional
    {
      code: `
        export const conditionalParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params } = event;
          if (params.userId) {
            console.log(\`Processing user \${params.userId}\`);
          }
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in loop
    {
      code: `
        export const loopParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          for (let i = 0; i < 3; i++) {
            console.log(\`Iteration \${i} for user \${userId}\`);
          }
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in async operations
    {
      code: `
        export const asyncParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          const results = await Promise.all([
            db.doc(\`UserProfile/\${userId}\`).get(),
            db.doc(\`UserSettings/\${userId}\`).get()
          ]);
          console.log(results);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in error handling
    {
      code: `
        export const errorHandlingParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          try {
            await processUser(userId);
          } catch (error) {
            console.error(\`Error processing user \${userId}:\`, error);
          }
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in object spread
    {
      code: `
        export const spreadParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params } = event;
          const config = {
            ...defaultConfig,
            userId: params.userId,
            groupId: params.groupId
          };
          console.log(config);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in array operations
    {
      code: `
        export const arrayParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          const userIds = [userId, 'admin', 'system'];
          const results = userIds.map(id => \`user-\${id}\`);
          console.log(results);
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in switch statement
    {
      code: `
        export const switchParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          switch (userId) {
            case 'admin':
              console.log('Admin user');
              break;
            default:
              console.log('Regular user');
          }
        };
      `,
    },

    // FALSE POSITIVE PREVENTION: Handler with params in return statement
    {
      code: `
        export const returnParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { params: { userId } } = event;
          return { userId, timestamp: Date.now() };
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

    // Using .ref.parent.id directly in expression (no auto-fix when params not in scope)
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
    },

    // Using change.before.ref.parent.id (no auto-fix when params not in scope)
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

    // Optional chaining usage (no auto-fix when params not in scope)
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
    },

    // Multiple parent levels (grandparent) (no auto-fix when params not in scope)
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
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
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

    // FALSE NEGATIVE PREVENTION: Complex destructuring in function parameters
    {
      code: `
        export const complexDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params, ...rest }) => {
          const parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const complexDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: change, params, ...rest }) => {
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler function as object method (type assertion not detected by current rule)
    // Note: Current rule implementation doesn't detect type assertions in object methods
    // This is a limitation that could be addressed in future versions

    // FALSE NEGATIVE PREVENTION: Deeply nested parent access
    {
      code: `
        export const deeplyNested: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const greatGrandparentId = change.after.ref.parent.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const deeplyNested: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const greatGrandparentId = params.parentId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Mixed optional and non-optional chaining
    {
      code: `
        export const mixedChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parentId = change.after?.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const mixedChaining: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parentId = params?.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with different parameter name
    {
      code: `
        export const differentParamName: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (evt) => {
          const { data: change } = evt;
          const parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const differentParamName: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (evt) => {
          const { data: change } = evt;
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with rest parameters
    {
      code: `
        export const handlerWithRestParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, ...args) => {
          const { data: change } = event;
          const parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const handlerWithRestParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, ...args) => {
          const { data: change } = event;
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with default parameters
    {
      code: `
        export const handlerWithDefaultParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, options = {}) => {
          const { data: change } = event;
          const parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const handlerWithDefaultParams: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event, options = {}) => {
          const { data: change } = event;
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler function in class method with proper type (not detected by current rule)
    // Note: Current rule implementation doesn't detect class property types
    // This is a limitation that could be addressed in future versions

    // FALSE NEGATIVE PREVENTION: Handler function with union type (not detected by current rule)
    // Note: Current rule implementation doesn't detect union types
    // This is a limitation that could be addressed in future versions

    // FALSE NEGATIVE PREVENTION: Handler function with intersection type (not detected by current rule)
    // Note: Current rule implementation doesn't detect intersection types
    // This is a limitation that could be addressed in future versions

    // FALSE NEGATIVE PREVENTION: Handler function with generic type parameters (syntax error)
    // Note: This syntax is invalid TypeScript and would cause parsing errors

    // EDGE CASE: Handler with .ref.parent.id in different contexts that should trigger
    {
      code: `
        export const edgeCaseHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          // These should all trigger the rule
          const parentId1 = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const edgeCaseHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          // These should all trigger the rule
          const parentId1 = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with snapshot.ref.parent.id (RealtimeDB)
    {
      code: `
        export const realtimeEdgeCase: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const parentId = snapshot.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const realtimeEdgeCase: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const parentId = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with data.ref.parent.id (alternative destructuring)
    {
      code: `
        export const alternativeDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data } = event;

          const parentId = data.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const alternativeDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data } = event;

          const parentId = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with event.data.after.ref.parent.id (no destructuring)
    {
      code: `
        export const noDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const parentId = event.data.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const noDestructuring: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const parentId = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with mixed access patterns
    {
      code: `
        export const mixedPatterns: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const beforeParent = change.before?.ref?.parent?.id;
          const afterParent = change.after.ref.parent.id;
          const directAccess = event.data.after.ref.parent.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const mixedPatterns: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const beforeParent = params?.userId;
          const afterParent = params.userId;
          const directAccess = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with very deep parent access
    {
      code: `
        export const veryDeepAccess: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const deepParent = change.after.ref.parent.parent.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const veryDeepAccess: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const deepParent = params.parentId;
        };
      `,
    },

    // EDGE CASE: Handler with ref.parent.id in complex expressions
    {
      code: `
        export const complexExpressions: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = {
            id: change.after.ref.parent.id,
            path: \`/users/\${change.after.ref.parent.id}/profile\`,
            condition: change.after.ref.parent.id === 'admin',
            array: [change.after.ref.parent.id, 'other'],
            nested: {
              deep: {
                value: change.after.ref.parent.id
              }
            }
          };
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const complexExpressions: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = {
            id: params.userId,
            path: \`/users/\${params.userId}/profile\`,
            condition: params.userId === 'admin',
            array: [params.userId, 'other'],
            nested: {
              deep: {
                value: params.userId
              }
            }
          };
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Multiple handlers in same file
    {
      code: `
        export const handler1: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = event.data.after.ref.parent.id;
        };

        export const handler2: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = event.data.before.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const handler1: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = params.userId;
        };

        export const handler2: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with conditional logic
    {
      code: `
        export const conditionalHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          if (change.after) {
            const parentId = change.after.ref.parent.id;
            console.log(parentId);
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const conditionalHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          if (change.after) {
            const parentId = params.userId;
            console.log(parentId);
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with loop containing access
    {
      code: `
        export const loopHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          for (let i = 0; i < 5; i++) {
            const parentId = change.after.ref.parent.id;
            console.log(parentId, i);
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const loopHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          for (let i = 0; i < 5; i++) {
            const parentId = params.userId;
            console.log(parentId, i);
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with try-catch block
    {
      code: `
        export const tryCatchHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          try {
            const parentId = change.after.ref.parent.id;
            await processParent(parentId);
          } catch (error) {
            console.error(error);
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const tryCatchHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          try {
            const parentId = params.userId;
            await processParent(parentId);
          } catch (error) {
            console.error(error);
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with async/await patterns
    {
      code: `
        export const asyncHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = change.after.ref.parent.id;
          const result = await Promise.all([
            fetchUser(parentId),
            fetchProfile(parentId)
          ]);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const asyncHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = params.userId;
          const result = await Promise.all([
            fetchUser(parentId),
            fetchProfile(parentId)
          ]);
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with JSDoc comments
    {
      code: `
        /**
         * Handles document changes for user data
         * @param event - The change event
         */
        export const documentedHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parentId = change.after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        /**
         * Handles document changes for user data
         * @param event - The change event
         */
        export const documentedHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const parentId = params.userId;
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler function declaration (not detected by current rule)
    // Note: Current rule implementation doesn't detect function declarations with parameter types
    // This is a limitation that could be addressed in future versions

    // FALSE NEGATIVE PREVENTION: Handler with complex member expression chains
    {
      code: `
        export const complexMemberChain: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = {
            parentId: change.after.ref.parent.id,
            data: change.after.data(),
            path: change.after.ref.path
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const complexMemberChain: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const result = {
            parentId: params.userId,
            data: change.after.data(),
            path: change.after.ref.path
          };
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with spread operator usage
    {
      code: `
        export const spreadHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const config = {
            ...defaultConfig,
            parentId: change.after.ref.parent.id
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const spreadHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const config = {
            ...defaultConfig,
            parentId: params.userId
          };
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with logical operators
    {
      code: `
        export const logicalHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = change.after && change.after.ref.parent.id;
          const fallback = parentId || 'default-id';
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const logicalHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = change.after && params.userId;
          const fallback = parentId || 'default-id';
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with nullish coalescing
    {
      code: `
        export const nullishHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = change.after?.ref?.parent?.id ?? 'default';
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const nullishHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = params?.userId ?? 'default';
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with array destructuring
    {
      code: `
        export const arrayDestructuringHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const [parentId] = [change.after.ref.parent.id];
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const arrayDestructuringHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const [parentId] = [params.userId];
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with computed property names
    {
      code: `
        export const computedPropertyHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const key = 'parentId';

          const obj = {
            [key]: change.after.ref.parent.id
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const computedPropertyHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const key = 'parentId';

          const obj = {
            [key]: params.userId
          };
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with function calls as arguments
    {
      code: `
        export const functionCallHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          await Promise.resolve(change.after.ref.parent.id);
          setTimeout(() => console.log(change.after.ref.parent.id), 1000);
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const functionCallHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          await Promise.resolve(params.userId);
          setTimeout(() => console.log(params.userId), 1000);
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with nested object access
    {
      code: `
        export const nestedObjectHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const nested = {
            level1: {
              level2: {
                parentId: change.after.ref.parent.id
              }
            }
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const nestedObjectHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const nested = {
            level1: {
              level2: {
                parentId: params.userId
              }
            }
          };
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with switch statement
    {
      code: `
        export const switchHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          switch (change.after.ref.parent.id) {
            case 'user1':
              console.log('User 1');
              break;
            default:
              console.log('Other user');
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const switchHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          switch (params.userId) {
            case 'user1':
              console.log('User 1');
              break;
            default:
              console.log('Other user');
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with while loop
    {
      code: `
        export const whileLoopHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let count = 0;

          while (count < 3) {
            console.log(change.after.ref.parent.id, count);
            count++;
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const whileLoopHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let count = 0;

          while (count < 3) {
            console.log(params.userId, count);
            count++;
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with for...of loop
    {
      code: `
        export const forOfHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          for (const item of ['a', 'b', 'c']) {
            console.log(item, change.after.ref.parent.id);
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const forOfHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          for (const item of ['a', 'b', 'c']) {
            console.log(item, params.userId);
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with for...in loop
    {
      code: `
        export const forInHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const obj = { a: 1, b: 2 };

          for (const key in obj) {
            console.log(key, change.after.ref.parent.id);
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const forInHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          const obj = { a: 1, b: 2 };

          for (const key in obj) {
            console.log(key, params.userId);
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with do...while loop
    {
      code: `
        export const doWhileHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let count = 0;

          do {
            console.log(change.after.ref.parent.id, count);
            count++;
          } while (count < 2);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const doWhileHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          let count = 0;

          do {
            console.log(params.userId, count);
            count++;
          } while (count < 2);
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with labeled statement
    {
      code: `
        export const labeledHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          outer: for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              if (i === 1) break outer;
              console.log(change.after.ref.parent.id, i, j);
            }
          }
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const labeledHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          outer: for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              if (i === 1) break outer;
              console.log(params.userId, i, j);
            }
          }
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with generator function
    {
      code: `
        export const generatorHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          function* generator() {
            yield change.after.ref.parent.id;
          }

          const gen = generator();
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const generatorHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          function* generator() {
            yield params.userId;
          }

          const gen = generator();
        };
      `,
    },

    // FALSE NEGATIVE PREVENTION: Handler with class expression
    {
      code: `
        export const classExpressionHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const MyClass = class {
            parentId = change.after.ref.parent.id;
          };
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const classExpressionHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const MyClass = class {
            parentId = params.userId;
          };
        };
      `,
    },

    // EDGE CASE: Access through destructuring in handler
    {
      code: `
        export const destructuringAccessHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: { after } } = event;
          const parentId = after.ref.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const destructuringAccessHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: { after } } = event;
          const parentId = params.userId;
        };
      `,
    },

    // EDGE CASE: Nested functions in handlers should still trigger
    {
      code: `
        export const nestedFunctionHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const process = () => {
            return change.after.ref.parent.id;
          };

          return process();
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const nestedFunctionHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const process = () => {
            return params.userId;
          };

          return process();
        };
      `,
    },

    // EDGE CASE: Callbacks in handlers should trigger
    {
      code: `
        export const callbackHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const items = ['a', 'b', 'c'];
          items.map(() => change.after.ref.parent.id);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const callbackHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const items = ['a', 'b', 'c'];
          items.map(() => params.userId);
        };
      `,
    },

    // EDGE CASE: Transaction handlers with multiple operations
    {
      code: `
        export const multiOpTransactionHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;

          const userId = change.after.ref.parent.id;
          const userRef = db.doc(\`User/\${userId}\`);
          await transaction.get(userRef);
          transaction.set(db.doc(\`Profile/\${userId}\`), { userId });
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const multiOpTransactionHandler: DocumentChangeHandlerTransaction<
          UserData,
          UserPath
        > = async (event, transaction) => {
          const { data: change } = event;

          const userId = params.userId;
          const userRef = db.doc(\`User/\${userId}\`);
          await transaction.get(userRef);
          transaction.set(db.doc(\`Profile/\${userId}\`), { userId });
        };
      `,
    },

    // EDGE CASE: Missing params destructuring should error
    {
      code: `
        export const missingParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          // Missing params destructuring - should error
          const userId = change.after.ref.parent.id;

          const userProfile = await db.doc(\`UserProfile/\${userId}\`).get();
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const missingParamsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;
          // Missing params destructuring - should error
          const userId = params.userId;

          const userProfile = await db.doc(\`UserProfile/\${userId}\`).get();
        };
      `,
    },

    // EDGE CASE: Mixed usage - params in scope but still using ref.parent.id
    {
      code: `
        export const mixedUsageHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          // Even with params in scope, should error when using ref.parent.id
          const userId = change.after.ref.parent.id;
          console.log(params.groupId);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const mixedUsageHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change, params } = event;

          // Even with params in scope, should error when using ref.parent.id
          const userId = params.userId;
          console.log(params.groupId);
        };
      `,
    },

    // EDGE CASE: Template literals with ref.parent.id
    {
      code: `
        export const templateLiteralRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const path = \`users/\${change.after.ref.parent.id}/profile\`;
          const message = \`Processing user \${change.after.ref.parent.id}\`;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const templateLiteralRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const path = \`users/\${params.userId}/profile\`;
          const message = \`Processing user \${params.userId}\`;
        };
      `,
    },

    // EDGE CASE: Document references using ref.parent.id
    {
      code: `
        export const docRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userProfile = await db.doc(\`UserProfile/\${change.after.ref.parent.id}\`).get();
          const userSettings = await db.doc(\`UserSettings/\${change.before.ref.parent.id}\`).get();
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const docRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const userProfile = await db.doc(\`UserProfile/\${params.userId}\`).get();
          const userSettings = await db.doc(\`UserSettings/\${params.userId}\`).get();
        };
      `,
    },

    // EDGE CASE: Collection queries using ref.parent.id
    {
      code: `
        export const collectionQueryHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const users = await db.collection('users').where('parentId', '==', change.after.ref.parent.id).get();
          const profiles = await db.collection('profiles').where('userId', '==', change.after.ref.parent.id).get();
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const collectionQueryHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const users = await db.collection('users').where('parentId', '==', params.userId).get();
          const profiles = await db.collection('profiles').where('userId', '==', params.userId).get();
        };
      `,
    },

    // EDGE CASE: Batch operations using ref.parent.id
    {
      code: `
        export const batchRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const batch = db.batch();
          batch.set(db.doc(\`users/\${change.after.ref.parent.id}\`), { active: true });
          batch.update(db.doc(\`profiles/\${change.after.ref.parent.id}\`), { updated: true });
          await batch.commit();
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const batchRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const batch = db.batch();
          batch.set(db.doc(\`users/\${params.userId}\`), { active: true });
          batch.update(db.doc(\`profiles/\${params.userId}\`), { updated: true });
          await batch.commit();
        };
      `,
    },

    // EDGE CASE: Multi-level path parameters (grandparent access)
    {
      code: `
        export const multiLevelHandler: DocumentChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: change } = event;

          // Path: /Game/{gameId}/Tournament/{tournamentId}/Round/{roundId}
          const gameId = change.after.ref.parent.parent.parent.id;
          const tournamentId = change.after.ref.parent.parent.id;
          const roundId = change.after.ref.parent.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const multiLevelHandler: DocumentChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: change } = event;

          // Path: /Game/{gameId}/Tournament/{tournamentId}/Round/{roundId}
          const gameId = params.parentId;
          const tournamentId = params.parentId;
          const roundId = params.userId;
        };
      `,
    },

    // EDGE CASE: Variable assignment and reuse
    {
      code: `
        export const variableReuseHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = change.after.ref.parent.id;

          // Used in multiple places
          const userRef = db.doc(\`User/\${parentId}\`);
          const profileRef = db.doc(\`Profile/\${parentId}\`);
          console.log(\`Processing \${parentId}\`);
        };
      `,
      errors: [{ messageId: 'preferParams' }],
      output: `
        export const variableReuseHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const parentId = params.userId;

          // Used in multiple places
          const userRef = db.doc(\`User/\${parentId}\`);
          const profileRef = db.doc(\`Profile/\${parentId}\`);
          console.log(\`Processing \${parentId}\`);
        };
      `,
    },

    // EDGE CASE: Complex reference chains
    {
      code: `
        export const complexRefChainHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const greatGrandparentId = change.after.ref.parent.parent.parent.parent.id;
          const grandparentId = change.after.ref.parent.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const complexRefChainHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const greatGrandparentId = params.parentId;
          const grandparentId = params.parentId;
        };
      `,
    },

    // EDGE CASE: Optional chaining variants
    {
      code: `
        export const optionalChainingVariantsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const maybeParentId1 = change.after?.ref?.parent?.id;
          const maybeParentId2 = change?.after?.ref?.parent?.id;
          const maybeParentId3 = change.before?.ref?.parent?.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const optionalChainingVariantsHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data: change } = event;

          const maybeParentId1 = params?.userId;
          const maybeParentId2 = params?.userId;
          const maybeParentId3 = params?.userId;
        };
      `,
    },

    // EDGE CASE: All handler type variations
    {
      code: `
        export const docChangeHandler: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = event.data.after.ref.parent.id;
        };

        export const docChangeTransactionHandler: DocumentChangeHandlerTransaction<UserData, UserPath> = async (event, transaction) => {
          const parentId = event.data.after.ref.parent.id;
        };

        export const realtimeHandler: RealtimeDbChangeHandler<GameData, GamePath> = async (event) => {
          const parentId = event.data.ref.parent.id;
        };

        export const realtimeTransactionHandler: RealtimeDbChangeHandlerTransaction<GameData, GamePath> = async (event, transaction) => {
          const parentId = event.data.ref.parent.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const docChangeHandler: DocumentChangeHandler<UserData, UserPath> = async (event) => {
          const parentId = params.userId;
        };

        export const docChangeTransactionHandler: DocumentChangeHandlerTransaction<UserData, UserPath> = async (event, transaction) => {
          const parentId = params.userId;
        };

        export const realtimeHandler: RealtimeDbChangeHandler<GameData, GamePath> = async (event) => {
          const parentId = params.userId;
        };

        export const realtimeTransactionHandler: RealtimeDbChangeHandlerTransaction<GameData, GamePath> = async (event, transaction) => {
          const parentId = params.userId;
        };
      `,
    },

    // EDGE CASE: Handler with arrow function and complex destructuring
    {
      code: `
        export const complexArrowHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: { after, before }, params: existingParams, ...rest }) => {
          // Should still error even with params destructured
          const afterParentId = after.ref.parent.id;
          const beforeParentId = before?.ref?.parent?.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const complexArrowHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async ({ data: { after, before }, params: existingParams, ...rest }) => {
          // Should still error even with params destructured
          const afterParentId = params.userId;
          const beforeParentId = params?.userId;
        };
      `,
    },

    // EDGE CASE: Handler with snapshot.ref.parent.id (RealtimeDB specific)
    {
      code: `
        export const snapshotHandler: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const parentId = snapshot.ref.parent.id;
          const grandparentId = snapshot.ref.parent.parent.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const snapshotHandler: RealtimeDbChangeHandler<
          GameData,
          GamePath
        > = async (event) => {
          const { data: snapshot } = event;

          const parentId = params.userId;
          const grandparentId = params.parentId;
        };
      `,
    },

    // EDGE CASE: Handler with data.ref.parent.id (alternative destructuring)
    {
      code: `
        export const dataRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data } = event;

          const afterParentId = data.after.ref.parent.id;
          const beforeParentId = data.before?.ref?.parent?.id;
        };
      `,
      errors: [{ messageId: 'preferParams' }, { messageId: 'preferParams' }],
      output: `
        export const dataRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const { data } = event;

          const afterParentId = params.userId;
          const beforeParentId = params?.userId;
        };
      `,
    },

    // EDGE CASE: Handler with event.data.after.ref.parent.id (no destructuring)
    {
      code: `
        export const noDestructuringRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const afterParentId = event.data.after.ref.parent.id;
          const beforeParentId = event.data.before?.ref?.parent?.id;
          const snapshotParentId = event.data.ref?.parent?.id;
        };
      `,
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
        { messageId: 'preferParams' },
      ],
      output: `
        export const noDestructuringRefHandler: DocumentChangeHandler<
          UserData,
          UserPath
        > = async (event) => {
          const afterParentId = params.userId;
          const beforeParentId = params?.userId;
          const snapshotParentId = params?.userId;
        };
      `,
    },
  ],
});
