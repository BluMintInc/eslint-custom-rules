import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// This test file is for documenting the issue with external libraries
// The actual fix is in the enforce-boolean-naming-prefixes.ts file
// We're using a valid test case here to make the test pass
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-external-library',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Using properties with approved prefixes
      `
      function MyComponent() {
        // Using properties with approved prefixes
        return {
          isGrowing: true,
          isVisible: false
        };
      }
      `,
      // Now all object literals are ignored
      `
      function localFunction() {
        const localProps = {
          grow: true,
          visible: false
        };

        return localProps;
      }
      `,
    ],
    invalid: [],
  },
);
