import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-stream-chat',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case for a property that should be exempted
      `
      // Mock the external API
      function Thread(props) {
        return props;
      }

      function ChatComponent() {
        // Using a property with an approved prefix
        const messageInputProps = {
          isGrowing: true,
          hasTextArea: true,
        };

        return Thread({
          additionalMessageInputProps: messageInputProps
        });
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
