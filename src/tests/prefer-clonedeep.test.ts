import { ruleTesterTs } from '../utils/ruleTester';
import { preferCloneDeep } from '../rules/prefer-clonedeep';

ruleTesterTs.run('prefer-clonedeep', preferCloneDeep, {
  valid: [
    // Single level spread is fine
    {
      code: `
        const updatedUser = { ...user, active: true };
      `,
    },
    // Objects with functions should not trigger
    {
      code: `
        const obj = {
          ...base,
          method: () => console.log('Hello'),
          [Symbol('id')]: 123,
        };
      `,
    },
    // Simple object without spread
    {
      code: `
        const obj = {
          a: 1,
          b: 2,
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        const result = {
          membership: {
            ...membershipIncomplete,
            sender: {
              ...membershipIncomplete.sender,
              request: {
                ...membershipIncomplete.sender.request,
                status: 'accepted',
              },
            },
          },
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const result = {
          membership: cloneDeep(membershipIncomplete, {
            sender: {
              request: {
                status: 'accepted'
              }
            }
          } as const)
        };
      `,
    },
    {
      code: `
        const nested = {
          ...original.nested,
          request: {
            ...original.nested.request,
            value: 42
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const nested = cloneDeep(original.nested, {
          request: {
            value: 42
          }
        } as const);
      `,
    },
  ],
});
