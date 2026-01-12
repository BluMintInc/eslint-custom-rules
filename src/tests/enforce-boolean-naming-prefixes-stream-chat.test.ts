import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-stream-chat',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case for a property that should be exempted (function call syntax)
      `
      import { Thread } from 'stream-chat-react';

      function ChatComponent() {
        // Using a property with an approved prefix
        const messageInputProps = {
          grow: true,
          hasTextArea: true,
        };

        return Thread({
          additionalMessageInputProps: messageInputProps
        });
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

// Test JSX syntax separately
ruleTesterJsx.run(
  'enforce-boolean-naming-prefixes-stream-chat-jsx',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case for a property that should be exempted (JSX syntax)
      `
      import { Thread } from 'stream-chat-react';

      function ChatComponent() {
        const messageInputProps = {
          grow: true,
          hasTextArea: true,
        };

        return <Thread additionalMessageInputProps={messageInputProps} />;
      }
      `,
      // Now all object literals are ignored
      `
      function localFunction_jsx() {
        const localProps = {
          grow: true,
          visible: false
        };

        return <div>{localProps.grow}</div>;
      }
      `,
    ],
    invalid: [],
  },
);
