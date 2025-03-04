import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIdCapitalization } from '../rules/enforce-id-capitalization';

// Test with TypeScript support to verify the bug with type definitions
ruleTesterTs.run('enforce-id-capitalization-bug', enforceIdCapitalization, {
  valid: [
    // This should be valid, but currently fails with the bug
    {
      code: `
        export type CallerRequestButtonsProps = Pick<
          CallerCardBaseProps,
          'status' | 'id'
        >;
      `,
    },
    // Another example of type definition that should be valid
    {
      code: `
        type UserData = {
          id: string;
          name: string;
        };
      `,
    },
    // Type alias with Pick utility
    {
      code: `
        type UserSummary = Pick<User, 'id' | 'name'>;
      `,
    },
  ],
  invalid: [],
});
