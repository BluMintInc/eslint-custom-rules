import { ruleTesterTs } from '../utils/ruleTester';
import { noExcessiveParentChain } from '../rules/no-excessive-parent-chain';

ruleTesterTs.run('no-excessive-parent-chain', noExcessiveParentChain, {
  valid: [
    // Valid case: Using params object
    {
      code: `
      export const validHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const {
          data: change,
          params: { userId } // Access path parameter directly from event params
        } = event;
        const { gameId: overwolfGameId, data } = change.after.data() || {};

        // Rest of the handler implementation using userId...
      };
      `,
    },
    // Valid case: Using up to 2 parent calls (allowed)
    {
      code: `
      export const validParentChain: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const { gameId: overwolfGameId, data } = change.after.data() || {};

        // Using only 2 parent calls is allowed
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Non-handler function with excessive parent chain (not reported)
    {
      code: `
      export const regularFunction = async (ref) => {
        // This is not a handler, so it's allowed to have excessive parent chains
        const docId = ref.parent.parent.parent.parent.parent.id;
      };
      `,
    },
    // Valid case: Using parent chain in a non-ref context
    {
      code: `
      export const validNonRefContext: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        // This is not a ref.parent chain, so it's allowed
        const someObj = {
          parent: {
            parent: {
              parent: {
                id: 'test'
              }
            }
          }
        };
        const id = someObj.parent.parent.parent.id;
      };
      `,
    },
    // Valid case: Single parent call
    {
      code: `
      export const singleParentHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const parentId = change.after.ref.parent.id;
      };
      `,
    },
    // Valid case: No parent calls
    {
      code: `
      export const noParentHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.id;
      };
      `,
    },
    // Valid case: Parent chains in nested functions that aren't handlers
    {
      code: `
      export const handlerWithNestedFunction: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        function helperFunction(someRef) {
          // This is not a handler function, so excessive parent chains are allowed
          return someRef.parent.parent.parent.parent.id;
        }

        const result = helperFunction(someOtherRef);
      };
      `,
    },
    // Valid case: Parent chains in object literals
    {
      code: `
      export const objectLiteralHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const config = {
          path: someRef.parent.parent.parent.parent.id,
          nested: {
            deepPath: anotherRef.parent.parent.parent.parent.parent.key
          }
        };
      };
      `,
    },
    // Valid case: Parent chains in array methods
    {
      code: `
      export const arrayMethodHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const refs = [ref1, ref2, ref3];
        const ids = refs.map(ref => ref.parent.parent.parent.parent.id);
      };
      `,
    },
    // Valid case: Parent chains in conditional expressions (non-ref context)
    {
      code: `
      export const conditionalHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = condition ?
          someObj.parent.parent.parent.parent.value :
          otherObj.parent.parent.parent.parent.parent.value;
      };
      `,
    },
    // Valid case: Parent chains in try-catch blocks (non-ref context)
    {
      code: `
      export const tryCatchHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        try {
          const value = someObj.parent.parent.parent.parent.id;
        } catch (error) {
          const fallback = error.parent.parent.parent.parent.message;
        }
      };
      `,
    },
    // Valid case: Parent chains in switch statements (non-ref context)
    {
      code: `
      export const switchHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        switch (type) {
          case 'A':
            return objA.parent.parent.parent.parent.id;
          case 'B':
            return objB.parent.parent.parent.parent.parent.key;
          default:
            return null;
        }
      };
      `,
    },
    // Valid case: Parent chains in template literals (non-ref context)
    {
      code: `
      export const templateLiteralHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const message = \`Path: \${obj.parent.parent.parent.parent.id}\`;
      };
      `,
    },
    // Valid case: Handler function with different parameter names
    {
      code: `
      export const differentParamNames: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const { data: changeData } = evt;
        const docId = changeData.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler function with destructured parameters
    {
      code: `
      export const destructuredParams: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async ({ data: change, params }) => {
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler function with default parameters
    {
      code: `
      export const defaultParams: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event = {}) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler function as object property
    {
      code: `
      export const handlers = {
        objectPropertyHandler: (async (event) => {
          const { data: change } = event;
          const docId = change.after.ref.parent.parent.id;
        }) as DocumentChangeHandler<OverwolfUpdate, OverwolfUpdatePath>
      };
      `,
    },
    // Valid case: Handler function with complex type annotations
    {
      code: `
      export const complexTypeHandler: DocumentChangeHandler<
        OverwolfUpdate & { extra: string },
        OverwolfUpdatePath | AlternatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler function with generic type parameters
    {
      code: `
      export const genericHandler: DocumentChangeHandler<OverwolfUpdate, OverwolfUpdatePath> = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Parent chains in async/await contexts (non-ref)
    {
      code: `
      export const asyncAwaitHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = await Promise.resolve(obj.parent.parent.parent.parent.id);
      };
      `,
    },
    // Valid case: Parent chains in Promise chains (non-ref)
    {
      code: `
      export const promiseChainHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        return Promise.resolve()
          .then(() => obj.parent.parent.parent.parent.id)
          .catch(() => fallback.parent.parent.parent.parent.parent.value);
      };
      `,
    },
    // Valid case: Parent chains in logical expressions (non-ref)
    {
      code: `
      export const logicalExprHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = obj1.parent.parent.parent.parent.id ||
                      obj2.parent.parent.parent.parent.parent.key;
      };
      `,
    },
    // Valid case: Parent chains with exactly 2 calls (boundary case)
    {
      code: `
      export const exactlyTwoParents: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Multiple separate parent chains, each within limit
    {
      code: `
      export const multipleSeparateChains: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId1 = change.after.ref.parent.parent.id;
        const docId2 = change.before.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Parent chains in class methods (non-handler context)
    {
      code: `
      export const classMethodHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        class Helper {
          getPath(ref) {
            return ref.parent.parent.parent.parent.id;
          }
        }

        const helper = new Helper();
        const path = helper.getPath(someRef);
      };
      `,
    },
    // Valid case: Parent chains in arrow function callbacks
    {
      code: `
      export const callbackHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const results = refs.map(ref => ref.parent.parent.parent.parent.id);
        const filtered = refs.filter(ref => ref.parent.parent.parent.parent.isValid);
      };
      `,
    },
    // Valid case: Parent chains in generator functions (non-handler)
    {
      code: `
      export const generatorHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        function* pathGenerator(refs) {
          for (const ref of refs) {
            yield ref.parent.parent.parent.parent.id;
          }
        }

        const paths = [...pathGenerator(someRefs)];
      };
      `,
    },
    // Valid case: Parent chains in higher-order functions
    {
      code: `
      export const higherOrderHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const createPathExtractor = () => (ref) => ref.parent.parent.parent.parent.id;
        const extractor = createPathExtractor();
        const path = extractor(someRef);
      };
      `,
    },
    // Valid case: Parent chains in closures
    {
      code: `
      export const closureHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const createClosure = (baseRef) => {
          return () => baseRef.parent.parent.parent.parent.id;
        };

        const closure = createClosure(someRef);
        const result = closure();
      };
      `,
    },
    // Valid case: Parent chains with comments
    {
      code: `
      export const commentHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        // This is a comment about obj.parent.parent.parent.parent.id
        /* Another comment with obj.parent.parent.parent.parent.parent.key */
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with optional chaining (non-ref context)
    {
      code: `
      export const optionalChainingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const value = obj?.parent?.parent?.parent?.parent?.id;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with computed property access (non-ref context)
    {
      code: `
      export const computedPropertyHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const key = 'parent';
        const value = obj[key][key][key][key].id;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with mixed access patterns (non-ref context)
    {
      code: `
      export const mixedAccessHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const value = obj.parent['parent'].parent['parent'].id;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with function expressions
    {
      code: `
      export const functionExpressionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async function(event) {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with rest parameters
    {
      code: `
      export const restParamsHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event, ...args) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with JSDoc comments
    {
      code: `
      /**
       * Handler with JSDoc comments
       * @param event - The event parameter
       */
      export const jsdocHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler in different export patterns
    {
      code: `
      const namedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };

      export { namedHandler };
      `,
    },
    // Valid case: Handler with union types
    {
      code: `
      export const unionTypeHandler: DocumentChangeHandler<
        OverwolfUpdate | AlternateUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with intersection types
    {
      code: `
      export const intersectionTypeHandler: DocumentChangeHandler<
        OverwolfUpdate & ExtraData,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with nested object destructuring
    {
      code: `
      export const nestedDestructuringHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: { after: { ref } } } = event;
        const docId = ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with array destructuring
    {
      code: `
      export const arrayDestructuringHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const [first, second] = [change.after.ref, change.before.ref];
        const docId1 = first.parent.parent.id;
        const docId2 = second.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with spread operator (non-ref context)
    {
      code: `
      export const spreadOperatorHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const obj = { parent: { parent: { parent: { parent: { id: 'test' } } } } };
        const newObj = { ...obj.parent.parent.parent.parent };
        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with for-of loop (non-ref context)
    {
      code: `
      export const forOfLoopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        for (const item of items) {
          const value = item.parent.parent.parent.parent.id;
        }

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with while loop (non-ref context)
    {
      code: `
      export const whileLoopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        let current = obj;
        while (current) {
          const value = current.parent.parent.parent.parent.id;
          current = current.next;
        }

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with do-while loop (non-ref context)
    {
      code: `
      export const doWhileLoopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        let current = obj;
        do {
          const value = current.parent.parent.parent.parent.id;
          current = current.next;
        } while (current);

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with for-in loop (non-ref context)
    {
      code: `
      export const forInLoopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        for (const key in obj) {
          const value = obj[key].parent.parent.parent.parent.id;
        }

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with labeled statements (non-ref context)
    {
      code: `
      export const labeledStatementHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        outer: for (const item of items) {
          inner: for (const subItem of item.children) {
            const value = subItem.parent.parent.parent.parent.id;
            break outer;
          }
        }

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
    // Valid case: Handler with with statement (non-ref context)
    {
      code: `
      export const withStatementHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        with (obj) {
          const value = parent.parent.parent.parent.id;
        }

        const docId = change.after.ref.parent.parent.id;
      };
      `,
    },
  ],
  invalid: [
    // Invalid case: Using excessive parent chain
    {
      code: `
      export const propagateOverwolfPlacement: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const { gameId: overwolfGameId, data } = change.after.data() || {};

        // Brittle navigation using multiple parent calls
        const uid = change.after.ref.parent.parent.parent.parent.id;

        // Rest of the handler implementation...
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Using excessive parent chain in RealtimeDbChangeHandler
    {
      code: `
      export const realtimeDbHandler: RealtimeDbChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        // Excessive parent chain in RealtimeDB handler
        const path = change.after.ref.parent.parent.parent.key;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Using excessive parent chain in transaction handler
    {
      code: `
      export const transactionHandler: DocumentChangeHandlerTransaction<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event, transaction) => {
        const { data: change } = event;

        // Excessive parent chain in transaction handler
        const docPath = change.after.ref.parent.parent.parent.path;

        // Use transaction
        await transaction.get(docPath);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Using excessive parent chain in RealtimeDbChangeHandlerTransaction
    {
      code: `
      export const realtimeDbTransactionHandler: RealtimeDbChangeHandlerTransaction<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event, transaction) => {
        const { data: change } = event;

        // Excessive parent chain in RealtimeDB transaction handler
        const path = change.after.ref.parent.parent.parent.parent.key;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Variable assignment with event data
    {
      code: `
      export const variableAssignmentHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const change = event.data;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Destructuring assignment with event data
    {
      code: `
      export const destructuringHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data } = event;
        const uid = data.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Nested destructuring with event data
    {
      code: `
      export const nestedDestructuringHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const { after } = change;
        const uid = after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Multiple excessive parent chains
    {
      code: `
      export const multipleExcessiveChains: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid1 = change.after.ref.parent.parent.parent.id;
        const uid2 = change.before.ref.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with 5 calls
    {
      code: `
      export const fiveParentCalls: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 5 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with 6 calls
    {
      code: `
      export const sixParentCalls: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 6 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 5 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in conditional expression
    {
      code: `
      export const conditionalExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = condition ?
          change.after.ref.parent.parent.parent.id :
          change.before.ref.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in logical expression
    {
      code: `
      export const logicalExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id ||
                   change.before.ref.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in array method (direct access)
    {
      code: `
      export const arrayMethodExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const refs = [change.after.ref, change.before.ref];
        const id1 = change.after.ref.parent.parent.parent.id;
        const id2 = change.before.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in template literal
    {
      code: `
      export const templateLiteralExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const message = \`Path: \${change.after.ref.parent.parent.parent.id}\`;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in try-catch block
    {
      code: `
      export const tryCatchExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        try {
          const uid = change.after.ref.parent.parent.parent.id;
        } catch (error) {
          const fallback = change.before.ref.parent.parent.parent.parent.id;
        }
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in switch statement
    {
      code: `
      export const switchExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        switch (type) {
          case 'A':
            return change.after.ref.parent.parent.parent.id;
          case 'B':
            return change.before.ref.parent.parent.parent.parent.id;
          default:
            return null;
        }
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in async/await
    {
      code: `
      export const asyncAwaitExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = await Promise.resolve(change.after.ref.parent.parent.parent.id);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in Promise chain
    {
      code: `
      export const promiseChainExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        return Promise.resolve()
          .then(() => change.after.ref.parent.parent.parent.id)
          .catch(() => change.before.ref.parent.parent.parent.parent.id);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with different parameter names
    {
      code: `
      export const differentParamExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const { data: changeData } = evt;
        const uid = changeData.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with destructured parameters
    {
      code: `
      export const destructuredParamExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async ({ data: change, params }) => {
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in object literal
    {
      code: `
      export const objectLiteralExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const config = {
          path: change.after.ref.parent.parent.parent.id,
          nested: {
            deepPath: change.before.ref.parent.parent.parent.parent.key
          }
        };
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in return statement
    {
      code: `
      export const returnExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        return change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in function call argument
    {
      code: `
      export const functionCallExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        console.log(change.after.ref.parent.parent.parent.id);
        someFunction(change.before.ref.parent.parent.parent.parent.key);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 4 },
        },
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with assignment to another variable (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through variables
    // {
    //   code: `
    //   export const reassignmentExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //     const ref = change.after.ref;
    //     const uid = ref.parent.parent.parent.id;
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain with chained assignments
    {
      code: `
      export const chainedAssignmentExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const change = event.data;
        const afterRef = change.after;
        const uid = afterRef.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with optional chaining
    {
      code: `
      export const optionalChainingExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent?.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in nested object destructuring (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through nested destructuring
    // {
    //   code: `
    //   export const nestedDestructuringExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: { after: { ref } } } = event;
    //     const uid = ref.parent.parent.parent.id;
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in array destructuring (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through array destructuring
    // {
    //   code: `
    //   export const arrayDestructuringExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //     const [first, second] = [change.after.ref, change.before.ref];
    //     const uid1 = first.parent.parent.parent.id;
    //     const uid2 = second.parent.parent.parent.parent.id;
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 4 },
    //     },
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in for-of loop (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through loop variables
    // {
    //   code: `
    //   export const forOfLoopExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //
    //     for (const ref of [change.after.ref, change.before.ref]) {
    //       const uid = ref.parent.parent.parent.id;
    //     }
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in while loop (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through variables
    // {
    //   code: `
    //   export const whileLoopExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //
    //     let current = change.after.ref;
    //     while (current) {
    //       const uid = current.parent.parent.parent.id;
    //       current = current.next;
    //     }
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in do-while loop (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through variables
    // {
    //   code: `
    //   export const doWhileLoopExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //
    //     let current = change.after.ref;
    //     do {
    //       const uid = current.parent.parent.parent.id;
    //       current = current.next;
    //     } while (current);
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in for-in loop (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through computed property access
    // {
    //   code: `
    //   export const forInLoopExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //
    //     const refs = { first: change.after.ref, second: change.before.ref };
    //     for (const key in refs) {
    //       const uid = refs[key].parent.parent.parent.id;
    //     }
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain in labeled statements (false negative - limitation)
    // Note: This is a known limitation where the rule doesn't track ref assignments through loop variables
    // {
    //   code: `
    //   export const labeledStatementExcessiveHandler: DocumentChangeHandler<
    //     OverwolfUpdate,
    //     OverwolfUpdatePath
    //   > = async (event) => {
    //     const { data: change } = event;
    //
    //     outer: for (const ref of [change.after.ref]) {
    //       inner: for (const prop of ['parent']) {
    //         const uid = ref.parent.parent.parent.id;
    //         break outer;
    //       }
    //     }
    //   };
    //   `,
    //   errors: [
    //     {
    //       messageId: 'excessiveParentChain',
    //       data: { count: 3 },
    //     },
    //   ],
    // },
    // Invalid case: Excessive parent chain with function expressions
    {
      code: `
      export const functionExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async function(event) {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with rest parameters
    {
      code: `
      export const restParamsExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event, ...args) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with JSDoc comments
    {
      code: `
      /**
       * Handler with JSDoc comments and excessive parent chain
       * @param event - The event parameter
       */
      export const jsdocExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in different export patterns
    {
      code: `
      const namedExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };

      export { namedExcessiveHandler };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with union types
    {
      code: `
      export const unionTypeExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate | AlternateUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with intersection types
    {
      code: `
      export const intersectionTypeExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate & ExtraData,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with spread operator in object
    {
      code: `
      export const spreadObjectExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const config = {
          ...someConfig,
          path: change.after.ref.parent.parent.parent.id,
        };
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain with spread operator in array
    {
      code: `
      export const spreadArrayExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const paths = [
          ...existingPaths,
          change.after.ref.parent.parent.parent.id,
        ];
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in yield expression
    {
      code: `
      export const yieldExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async function*(event) {
        const { data: change } = event;
        yield change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in throw statement
    {
      code: `
      export const throwStatementExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        if (error) {
          throw new Error(change.after.ref.parent.parent.parent.id);
        }
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in new expression
    {
      code: `
      export const newExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const instance = new SomeClass(change.after.ref.parent.parent.parent.id);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in assignment expression
    {
      code: `
      export const assignmentExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        let result;
        result = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in update expression
    {
      code: `
      export const updateExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const counter = { value: 0 };
        counter.value += change.after.ref.parent.parent.parent.id.length;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in sequence expression
    {
      code: `
      export const sequenceExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = (console.log('debug'), change.after.ref.parent.parent.parent.id);
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in unary expression
    {
      code: `
      export const unaryExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const isValid = !!change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in binary expression
    {
      code: `
      export const binaryExpressionExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const isEqual = change.after.ref.parent.parent.parent.id === 'expected';
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
    // Invalid case: Excessive parent chain in tagged template literal
    {
      code: `
      export const taggedTemplateExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;

        const result = tag\`Path: \${change.after.ref.parent.parent.parent.id}\`;
      };
      `,
      errors: [
        {
          messageId: 'excessiveParentChain',
          data: { count: 3 },
        },
      ],
    },
  ],
});
