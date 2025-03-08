import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/global-const-style';

ruleTesterTs.run('global-const-style-avatar', rule, {
  valid: [
    // Valid global constants with UPPER_SNAKE_CASE and as const in TypeScript
    {
      code: "export const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default.svg' as const;",
      filename: 'test.ts',
    },
  ],
  invalid: [
    // Missing as const in TypeScript for exported constant
    {
      code: "export const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default.svg';",
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output:
        "export const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default.svg' as const;",
    },
  ],
});
