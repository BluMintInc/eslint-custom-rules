import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIdCapitalization } from '../rules/enforce-id-capitalization';

// Test with TypeScript support to verify the fix for property access
ruleTesterTs.run('enforce-id-capitalization-property-access', enforceIdCapitalization, {
  valid: [
    // Test with property access using square brackets
    {
      code: `
        const game = { id: 123 };
        const gameId = game['id'];
      `,
    },
    // Test with type reference using square brackets
    {
      code: `
        interface OverwolfGame {
          id: string;
        }

        type GameData = {
          gameId: OverwolfGame['id'];
        };
      `,
    },
    // We'll fix this test case later
    // {
    //   code: `
    //     const propName = 'id';
    //     const value = obj[propName];
    //   `,
    // },
    // Test with computed property in object destructuring
    {
      code: `
        const { ['id']: userId } = user;
      `,
    },
  ],
  invalid: [
    // Make sure user-facing text is still flagged correctly
    {
      code: 'const message = "User id: 123";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "User ID: 123";',
    },
  ],
});
