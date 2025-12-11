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
    {
      // Misused logical OR
      code: `
        switch (input) {
          case 'a' || 'b':
            // This is invalid
            break;
          default:
            // Handle default
        }
        `,
      errors: [
        {
          messageId: 'noMisusedSwitchCase',
          data: {
            expressionText: "'a' || 'b'",
            cascadingCases: "case 'a': case 'b':",
          },
        },
      ],
    },
    {
      // Misused logical OR with additional valid cases
      code: `
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
      errors: [
        {
          messageId: 'noMisusedSwitchCase',
          data: {
            expressionText: "'a' || 'b'",
            cascadingCases: "case 'a': case 'b':",
          },
        },
      ],
    },
    {
      // Misused nested logical OR should suggest individual operands
      code: `
        switch (input) {
          case first() || second() || third():
            doThing();
            break;
        }
        `,
      errors: [
        {
          messageId: 'noMisusedSwitchCase',
          data: {
            expressionText: 'first() || second() || third()',
            cascadingCases: 'case first(): case second(): case third():',
          },
        },
      ],
    },
  ],
});
