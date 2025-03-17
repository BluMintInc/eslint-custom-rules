import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-getstream',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case for GetStream's MessageInput component with 'grow' prop
      `
      import { MessageInput } from 'stream-chat-react';
      import React from 'react';

      const ChatComponent = () => {
        const textAreaProps = {};
        const getThreadInputDraft = () => '';
        const sendMessageOverride = () => {};

        // Using React.createElement instead of JSX for testing
        return React.createElement(MessageInput, {
          grow: true,  // This should not be flagged as it's from GetStream's API
          additionalTextareaProps: textAreaProps,
          getDefaultValue: getThreadInputDraft,
          overrideSubmitHandler: sendMessageOverride
        });
      };
      `,
      // Test case for React's built-in props
      `
      import React from 'react';

      const FormComponent = () => {
        // Using React.createElement instead of JSX for testing
        return React.createElement('input', {
          disabled: true,  // This should not be flagged as it's a React built-in prop
          required: false, // This should not be flagged as it's a React built-in prop
          checked: true    // This should not be flagged as it's a React built-in prop
        });
      };
      `,
    ],
    invalid: [
      // Should flag boolean properties in object literals NOT passed to external components
      {
        code: `
        const config = {
          grow: true,  // Should be flagged as it's not passed to an external component
          disabled: false  // Should be flagged as it's not passed to an external component
        };
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
              name: 'disabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
