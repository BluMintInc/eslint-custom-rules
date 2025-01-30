import { ruleTesterTs } from '../utils/ruleTester';
import { noRedundantParamTypes } from '../rules/no-redundant-param-types';

ruleTesterTs.run('no-redundant-param-types', noRedundantParamTypes, {
  valid: [
    // Arrow function without type annotations
    {
      code: 'const fn = (x) => x;',
    },
    // Arrow function with type annotation only on variable
    {
      code: `
        const fn: (x: number) => number = (x) => x;
      `,
    },
    // Anonymous function passed as argument
    {
      code: `
        documentQuery.filter((doc: DocumentSnapshot) => doc.exists);
      `,
    },
    // Function without variable type annotation
    {
      code: `
        const process = (value: number) => value * 2;
      `,
    },
    // Generic function with type parameters but no redundant param types
    {
      code: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id) => {
          return await apiCall(id);
        };
      `,
    },
  ],
  invalid: [
    // Basic case with single parameter
    {
      code: `
        const fn: (x: number) => number = (x: number) => x;
      `,
      output: `
        const fn: (x: number) => number = (x) => x;
      `,
      errors: [{ messageId: 'redundantParamType' }],
    },
    // Multiple parameters
    {
      code: `
        const example: (x: number, y: string) => void = (x: number, y: string) => {};
      `,
      output: `
        const example: (x: number, y: string) => void = (x, y) => {};
      `,
      errors: [
        { messageId: 'redundantParamType' },
        { messageId: 'redundantParamType' },
      ],
    },
    // Complex type with redundant parameter type
    {
      code: `
        export const enforceMembershipLimit: DocumentChangeHandler<
          ChannelMembership,
          ChannelMembershipPath
        > = async (
          event: FirestoreEvent<Change<DocumentSnapshot<ChannelMembership>>>,
        ) => {
          // function logic
        };
      `,
      output: `
        export const enforceMembershipLimit: DocumentChangeHandler<
          ChannelMembership,
          ChannelMembershipPath
        > = async (
          event,
        ) => {
          // function logic
        };
      `,
      errors: [{ messageId: 'redundantParamType' }],
    },
    // Generic function with redundant parameter type
    {
      code: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id: string): Promise<T> => {
          return await apiCall(id);
        };
      `,
      output: `
        const fetchData: <T>(id: string) => Promise<T> = async <T>(id): Promise<T> => {
          return await apiCall(id);
        };
      `,
      errors: [{ messageId: 'redundantParamType' }],
    },
  ],
});
