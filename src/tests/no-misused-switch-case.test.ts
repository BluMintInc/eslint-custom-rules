import { noMisusedSwitchCase } from '../rules/no-misused-switch-case';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-misused-switch-case', noMisusedSwitchCase, {
  valid: [
    // Separate cases
    `
        switch (input) {
          case 'a':
          case 'b':
            // Handle cases
            break;
          default:
            // Handle default
        }
        `,

    // Single case
    `
        switch (input) {
          case 'a':
            // Handle case 'a'
            break;
          default:
            // Handle default
        }
        `,
  ],
  invalid: [
    // Misused logical OR
    `
        switch (input) {
          case 'a' || 'b':
            // This is invalid
            break;
          default:
            // Handle default
        }
        `,

    // Misused logical OR with additional valid cases
    `
        switch (input) {
          case 'a' || 'b':
            // This is invalid
            break;
          case 'c':
          case 'd':
            // Handle cases 'c' and 'd'
            break;
          default:
            // Handle default
        }
        `,
  ].map((testCase) => {
    return {
      code: testCase,
      errors: [{ messageId: 'noMisusedSwitchCase' }],
    };
  }),
});
