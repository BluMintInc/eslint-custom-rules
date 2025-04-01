import { ESLintUtils } from '@typescript-eslint/utils';
import { noExcessiveParentChain } from '../rules/no-excessive-parent-chain';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('no-excessive-parent-chain', noExcessiveParentChain, {
  valid: [
    // Valid case: Using params object
    `
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
    // Valid case: Using up to 2 parent calls (allowed)
    `
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
    // Valid case: Non-handler function with excessive parent chain (not reported)
    `
    export const regularFunction = async (ref) => {
      // This is not a handler, so it's allowed to have excessive parent chains
      const docId = ref.parent.parent.parent.parent.parent.id;
    };
    `,
    // Valid case: Using parent chain in a non-ref context
    `
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
    // Skip this test case for now as it's difficult to detect ref chains through variables
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
  ],
});
