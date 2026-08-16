import { ruleTesterTs } from '../utils/ruleTester';
import { noExcessiveParentChain } from '../rules/no-excessive-parent-chain';

const messageTemplate =
  'Found {{count}} consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.';

const message = (count: number) =>
  messageTemplate.replace('{{count}}', String(count));

const error = (count: number) => ({
  messageId: 'excessiveParentChain' as const,
  data: { count },
});

// Suggestions must rewrite the chain in terms of the handler's actual parameter
// name, so assertions pin the applied output rather than the message alone.
const errorWithSuggestion = (count: number, output: string) => ({
  ...error(count),
  suggestions: [
    {
      messageId: 'excessiveParentChain' as const,
      data: { count },
      output,
    },
  ],
});

const errorWithoutSuggestion = (count: number) => ({
  ...error(count),
  suggestions: [],
});

// The `max` cases below reuse these two fixtures verbatim on both sides of the
// valid/invalid divide so the option value is the only difference. The
// three-hop chain exceeds the default of 2 and has to be silenced by widening
// `max`; the two-hop chain sits at the default and only reports once `max` is
// narrowed below it.
const MAX_THREE_HOP_CODE = `
      export const maxOptionThreeHopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `;

// The rewrite takes the only reference to `change` with it, so the suggestion
// removes the declaration that binds it (#2026).
const MAX_THREE_HOP_SUGGESTION = `
      export const maxOptionThreeHopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `;

const MAX_TWO_HOP_CODE = `
      export const maxOptionTwoHopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.id;
      };
      `;

const MAX_TWO_HOP_SUGGESTION = `
      export const maxOptionTwoHopHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `;

describe('no-excessive-parent-chain messages', () => {
  it('matches the documented template', () => {
    expect(noExcessiveParentChain.meta.messages.excessiveParentChain).toBe(
      messageTemplate,
    );
  });

  it('renders the count placeholder for reported chains', () => {
    expect(message(3)).toBe(
      'Found 3 consecutive ref.parent hops in this handler. Long parent chains break when Firestore/RealtimeDB paths change and bypass the typed params the trigger already provides. Read path components from event.params (for example, params.userId) instead of walking ref.parent repeatedly.',
    );
  });
});

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
    // Valid case (#2026): agora's `aggregateGroupIds` shape at the default max.
    // Nothing is reported, so nothing is rewritten and the destructured `change`
    // its `data()` calls read stays exactly as written.
    {
      code: `
      export const aggregateGroupIds: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const before = change.before.data();
        const after = change.after.data();
        const groupId = change.after.ref.parent.parent.id;
        return { before, after, groupId };
      };
      `,
    },
    // `max` widened above the chain length silences a chain that the default
    // max of 2 reports (see the invalid twin on the identical fixture).
    {
      code: MAX_THREE_HOP_CODE,
      options: [{ max: 3 }],
    },
    // The default value stated explicitly, pairing with the invalid twin that
    // narrows it to 1 on the identical fixture.
    {
      code: MAX_TWO_HOP_CODE,
      options: [{ max: 2 }],
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
      errors: [error(4), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(4), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(5), error(4), error(3)],
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
      errors: [error(6), error(5), error(4), error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3), error(4), error(3)],
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
        errorWithSuggestion(
          3,
          `
      export const differentParamExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const uid = evt.params.id;
      };
      `,
        ),
      ],
    },
    // Invalid case: Excessive parent chain with destructured parameters
    // The event object has no identifier here, so the report declines to suggest
    // rather than inventing one.
    {
      code: `
      export const destructuredParamExcessiveHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async ({ data: change, params }) => {
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [errorWithoutSuggestion(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3), error(4), error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
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
      errors: [error(3)],
    },
    // Regression (#1368): the suggestion must use the handler's actual parameter
    // name, and must replace the entire parent chain instead of an inner slice.
    {
      code: `
      export const shortParamNameHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const { data: change } = e;
        const uid = change.after.ref.parent.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          4,
          `
      export const shortParamNameHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const uid = e.params.id;
      };
      `,
        ),
        errorWithSuggestion(
          3,
          `
      export const shortParamNameHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const uid = e.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1368): a parameter literally named `event` keeps working.
    {
      code: `
      export const eventParamNamePinHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const eventParamNamePinHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1368): every hop of a long chain replaces the full chain, so
    // no suggestion leaves a dangling `.parent` behind.
    {
      code: `
      export const fiveHopSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const { data: change } = e;
        const uid = change.after.ref.parent.parent.parent.parent.parent.id;
      };
      `,
      errors: [5, 4, 3].map((count) =>
        errorWithSuggestion(
          count,
          `
      export const fiveHopSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const uid = e.params.id;
      };
      `,
        ),
      ),
    },
    // Regression (#1368): the chain rooted at the handler parameter itself.
    {
      code: `
      export const eventRootedChainHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const uid = evt.data.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const eventRootedChainHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const uid = evt.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1368): the event name survives hops through intermediate
    // variables. Regression (#2026): both intermediates go with the rewrite —
    // `afterRef` loses its last reference to the rewrite, and `change` loses its
    // last reference to `afterRef`'s removal.
    {
      code: `
      export const chainedAssignmentSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const change = e.data;
        const afterRef = change.after;
        const uid = afterRef.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const chainedAssignmentSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const uid = e.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1368): each handler in a file gets its own parameter name.
    {
      code: `
      export const firstNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (first) => {
        const { data: change } = first;
        const uid = change.after.ref.parent.parent.parent.id;
      };

      export const secondNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (second) => {
        const { data: change } = second;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const firstNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (first) => {
        const uid = first.params.id;
      };

      export const secondNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (second) => {
        const { data: change } = second;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
        ),
        errorWithSuggestion(
          3,
          `
      export const firstNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (first) => {
        const { data: change } = first;
        const uid = change.after.ref.parent.parent.parent.id;
      };

      export const secondNamedHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (second) => {
        const uid = second.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1368): an optional-chaining tail keeps its own range.
    {
      code: `
      export const optionalChainSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const { data: change } = e;
        const uid = change.after.ref.parent.parent.parent?.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const optionalChainSuggestionHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (e) => {
        const uid = e.params?.id;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): the reported reproducer. The rewrite takes the only
    // reference to `change` with it, so the declaration binding it goes too —
    // leaving it behind turned a clean file into a `no-unused-vars` failure.
    {
      code: `
      export const orphanedBindingHandler: RealtimeDbChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const path = change.after.ref.parent.parent.parent.key;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const orphanedBindingHandler: RealtimeDbChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const path = event.params.key;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): a re-destructure stacks two orphans. `after` loses its
    // last reference to the rewrite, and only then does `change` lose its last
    // reference — to the removal of the declaration that read it.
    {
      code: `
      export const reDestructuredOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const { after } = change;
        const uid = after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const reDestructuredOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): a renamed binding read from a renamed event parameter.
    {
      code: `
      export const renamedOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const { data: changeData } = evt;
        const path = changeData.after.ref.parent.parent.parent.path;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const renamedOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (evt) => {
        const path = evt.params.path;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): only the orphaned property leaves the pattern, and the
    // separator goes with it. The orphan is FIRST here, so the run reaches
    // forward to the survivor.
    {
      code: `
      export const firstPropertyOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change, params } = event;
        const uid = change.after.ref.parent.parent.parent.id;
        return \`\${params.gameId}:\${uid}\`;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const firstPropertyOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { params } = event;
        const uid = event.params.id;
        return \`\${params.gameId}:\${uid}\`;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): the same pattern with the orphan LAST, where the run
    // has to reach backward from the previous survivor instead.
    {
      code: `
      export const lastPropertyOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { params, data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
        return \`\${params.gameId}:\${uid}\`;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const lastPropertyOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { params } = event;
        const uid = event.params.id;
        return \`\${params.gameId}:\${uid}\`;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): agora's `aggregateGroupIds` shape. `change` is read by
    // two `data()` calls the rewrite does not touch, so the declaration stays
    // exactly as written and the suggestion is the rewrite alone.
    {
      code: `
      export const survivingBindingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const before = change.before.data();
        const after = change.after.data();
        const uid = change.after.ref.parent.parent.parent.id;
        return { before, after, uid };
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const survivingBindingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const before = change.before.data();
        const after = change.after.data();
        const uid = event.params.id;
        return { before, after, uid };
      };
      `,
        ),
      ],
    },
    // Regression (#2026): a chain rooted at the handler parameter itself has no
    // declaration to remove, so the rewrite ships alone. A parameter is part of
    // the signature and is never deleted.
    {
      code: `
      export const paramRootedOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.data.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const paramRootedOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#2026): a handler that destructures its parameter in place has
    // no event identifier to rewrite to, so it still declines to suggest at all
    // rather than inventing one and then deleting a binding for it.
    {
      code: `
      export const inPlaceDestructuredOrphanHandler: RealtimeDbChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async ({ data: change }) => {
        const path = change.after.ref.parent.parent.parent.key;
      };
      `,
      errors: [errorWithoutSuggestion(3)],
    },
    // Regression (#2026): a `let` binding can be assigned from anywhere its
    // scope reaches, so "nothing reads it" is not the whole story and the
    // suggestion is withheld rather than deleting a binding that may be written.
    {
      code: `
      export const mutableBindingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        let change = event.data;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [errorWithoutSuggestion(3)],
    },
    // Regression (#2026): the removal spans separators, so a comment inside the
    // declaration would be swallowed. The suggestion is withheld instead.
    {
      code: `
      export const commentedDeclarationHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change /* the before/after pair */ } = event;
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [errorWithoutSuggestion(3)],
    },
    // Regression (#2026): a rest element absorbs whatever the pattern does not
    // name, so dropping a property rewrites what it receives.
    {
      code: `
      export const restSiblingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change, ...rest } = event;
        const uid = change.after.ref.parent.parent.parent.id;
        return { rest, uid };
      };
      `,
      errors: [errorWithoutSuggestion(3)],
    },
    // Regression (#2026): a declaration that binds something else keeps its
    // surviving declarator, and the separator goes with the one that leaves.
    {
      code: `
      export const multiDeclaratorOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const change = event.data, limit = 5;
        const uid = change.after.ref.parent.parent.parent.id;
        return [uid, limit];
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const multiDeclaratorOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const limit = 5;
        const uid = event.params.id;
        return [uid, limit];
      };
      `,
        ),
      ],
    },
    // Regression (#2026): a comment trailing the declaration on its own line
    // describes the declaration, so it leaves with it. Anything else would
    // strand a note — or an `eslint-disable-line` — on the statement that moves
    // up into its place.
    {
      code: `
      export const trailingCommentOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event; // the before/after pair
        const uid = change.after.ref.parent.parent.parent.id;
      };
      `,
      errors: [
        errorWithSuggestion(
          3,
          `
      export const trailingCommentOrphanHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const uid = event.params.id;
      };
      `,
        ),
      ],
    },
    // Regression (#1903 applied to #2026): a shadowing local carrying the same
    // spelling is a different binding. The scope-resolved orphan is the outer
    // `change`, and because the name still occurs inside the declaring scope the
    // removal declines rather than guessing which occurrence it owns.
    {
      code: `
      export const shadowedBindingHandler: DocumentChangeHandler<
        OverwolfUpdate,
        OverwolfUpdatePath
      > = async (event) => {
        const { data: change } = event;
        const uid = change.after.ref.parent.parent.parent.id;
        const describe = (change: string) => change.trim();
        return describe(uid);
      };
      `,
      errors: [errorWithoutSuggestion(3)],
    },
    // Twin of the `max: 3` valid case: the same three-hop chain reports under
    // the default max of 2.
    {
      code: MAX_THREE_HOP_CODE,
      errors: [errorWithSuggestion(3, MAX_THREE_HOP_SUGGESTION)],
    },
    // Twin of the `max: 2` valid case: narrowing `max` to 1 turns a two-hop
    // chain the default permits into a violation.
    {
      code: MAX_TWO_HOP_CODE,
      options: [{ max: 1 }],
      errors: [errorWithSuggestion(2, MAX_TWO_HOP_SUGGESTION)],
    },
  ],
});
