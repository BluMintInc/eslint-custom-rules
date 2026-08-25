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
    // Missing as const in TypeScript for exported constant. The declaration
    // fits at 73 columns and the appended ` as const` pushes it to 84, so the
    // fix breaks after the `=` — the shape prettier settles on. Pinning the
    // flat spelling here is what kept #2126 open: this is the very fixture the
    // fixed-point sweep reported, and its expected output was the defect.
    {
      code: "export const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default.svg';",
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output:
        "export const PLACEHOLDER_AVATAR_URL =\n  '/assets/images/avatar-default.svg' as const;",
    },
  ],
});
