import { ruleTesterTs } from '../utils/ruleTester';
import { preferCloneDeep } from '../../src/rules/prefer-clone-deep';

ruleTesterTs.run('prefer-clone-deep', preferCloneDeep, {
  valid: [
    // Single level spread is allowed
    {
      code: `const updatedUser = { ...user, active: true };`,
    },
    // Objects with functions should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          method: () => console.log('Hello'),
          data: { ...otherData }
        };
      `,
    },
    // Objects with symbols should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          [Symbol('id')]: 123,
          data: { ...otherData }
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        const result = {
          ...baseObj,
          data: {
            ...baseObj.data,
            nested: {
              ...baseObj.data.nested,
              value: 42
            }
          }
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const result = cloneDeep(baseObj, data: {
            baseObj.data,
            nested: {
              baseObj.data.nested,
              value: 42
            }
          }
         as const);
      `,
    },
    {
      code: `
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: {
            ...membershipIncomplete,
            sender: {
              ...membershipIncomplete.sender,
              request: {
                ...membershipIncomplete.sender.request,
                status: 'accepted',
              },
            },
            receiver: {
              ...membershipIncomplete.receiver,
              request: {
                ...membershipIncomplete.receiver.request,
                status: 'accepted',
              },
            },
          },
        };
      `,
      errors: [{ messageId: 'preferCloneDeep' }],
      output: `
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: cloneDeep(membershipIncomplete, {
            sender: {
              request: {
                status: 'accepted',
              },
            },
            receiver: {
              request: {
                status: 'accepted',
              },
            },
          } as const),
        };
      `,
    },
  ],
});
