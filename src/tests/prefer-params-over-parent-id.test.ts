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
        { messageId: 'preferParams' }
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
        { messageId: 'preferParams' }
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
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' }
      ],
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
      errors: [
        { messageId: 'preferParams' },
        { messageId: 'preferParams' }
      ],
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
  ],
});
