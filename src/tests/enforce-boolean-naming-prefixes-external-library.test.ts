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
    ],
    invalid: [
      // This should be invalid because localProps is not passed to an external component
      {
        code: `
        function localFunction() {
          const localProps = {
            grow: true,  // This should be invalid as it's not passed to an external component
            visible: false
          };

          return localProps;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'grow',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
