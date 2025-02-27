import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { enforceIdCapitalization } from '../rules/enforce-id-capitalization';

// Test with JSX support
ruleTesterJsx.run('enforce-id-capitalization', enforceIdCapitalization, {
  valid: [
    {
      code: 'const message = "Please enter your in-game ID.";',
    },
    {
      code: 'const label = "User ID:";',
    },
    {
      code: 'const error = "Invalid ID format";',
    },
    {
      code: '<div>Please enter your ID</div>',
    },
    {
      code: '<Button>Submit ID</Button>',
    },
    {
      code: 'const userId = 12345; // Variable names are not affected',
    },
    {
      code: 'function getUserId() { return 123; } // Function names are not affected',
    },
    {
      code: 'const message = "This grid system is flexible.";', // "id" as part of another word
    },
    {
      code: 'const message = "Rapid development";', // "id" as part of another word
    },
    {
      code: 'const message = `Your ID is ${userId}`;', // Already using "ID"
    },
    {
      code: 't("user.profile.ID");', // Translation key with correct "ID"
    },
  ],
  invalid: [
    {
      code: 'const message = "Please enter your in-game id.";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "Please enter your in-game ID.";',
    },
    {
      code: 'const label = "User id:";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const label = "User ID:";',
    },
    {
      code: 'const error = "Invalid id format";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const error = "Invalid ID format";',
    },
    {
      code: '<div>Please enter your id</div>',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: '<div>Please enter your ID</div>',
    },
    {
      code: '<Button>Submit id</Button>',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: '<Button>Submit ID</Button>',
    },
    {
      code: 't("user.profile.id");', // Translation key with incorrect "id"
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 't("user.profile.ID");',
    },
    {
      code: 'const message = "Enter id, name, and email";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "Enter ID, name, and email";',
    },
    {
      code: 'const message = "id:";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "ID:";',
    },
  ],
});

// Test with TypeScript support
ruleTesterTs.run('enforce-id-capitalization', enforceIdCapitalization, {
  valid: [
    {
      code: 'const message: string = "Please enter your ID";',
    },
    {
      code: 'interface User { id: string; } // Interface properties are not affected',
    },
    {
      code: 'type UserData = { id: number; } // Type properties are not affected',
    },
  ],
  invalid: [
    {
      code: 'const message: string = "Please enter your id";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message: string = "Please enter your ID";',
    },
  ],
});
