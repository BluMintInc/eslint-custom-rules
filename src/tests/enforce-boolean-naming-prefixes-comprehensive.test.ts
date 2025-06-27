import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// Focused test suite for the most important edge cases and scenarios
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-comprehensive',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Core case: useMemo with external API (the main bug report case)
      `
      import { Thread } from 'stream-chat-react';
      import { useMemo } from 'react';

      function ChatComponent() {
        const messageInputProps = useMemo(() => ({
          grow: true,  // Should be allowed - external API
          additionalTextareaProps: {},
        }), []);

        return Thread({ additionalMessageInputProps: messageInputProps });
      }
      `,

      // Core case: Direct object literal passed to external function
      `
      import { ExternalLib } from 'external-lib';

      function Component() {
        return ExternalLib({
          active: true,  // Should be allowed - external API
          visible: false,
        });
      }
      `,

      // Core case: Variable assigned and used with external API
      `
      import { ExternalLib } from 'external-lib';

      function Component() {
        const config = {
          enabled: true,  // Should be allowed - external API
          disabled: false,
        };

        return ExternalLib(config);
      }
      `,

      // Edge case: Multiple external libraries
      `
      import { LibA, LibB } from 'external-lib';

      function Component() {
        const configA = { active: true };
        const configB = { visible: false };

        return {
          a: LibA(configA),
          b: LibB(configB),
        };
      }
      `,

      // Edge case: Member expression external API calls
      `
      import * as ExternalLib from 'external-lib';

      function Component() {
        const config = { enabled: true };
        return ExternalLib.create(config);
      }
      `,
    ],
    invalid: [
      // Should be invalid: Local usage without external API
      {
        code: `
        function Component() {
          const localConfig = {
            active: true,
            visible: false,
          };

          console.log(localConfig.active);
          return null;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: useMemo not used with external API
      {
        code: `
        import { useMemo } from 'react';

        function Component() {
          const config = useMemo(() => ({
            active: true,
            visible: false,
          }), []);

          console.log(config.active);
          return null;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: Object passed to local function
      {
        code: `
        function localFunction(config: any) {
          return config;
        }

        function Component() {
          const config = {
            active: true,
            visible: false,
          };

          return localFunction(config);
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);

// JSX-specific focused tests
ruleTesterJsx.run(
  'enforce-boolean-naming-prefixes-comprehensive-jsx',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Core case: JSX with external components and spread attributes
      `
      import { ExternalComponent } from 'external-lib';
      import { useMemo } from 'react';

      function App() {
        const props = useMemo(() => ({
          active: true,  // Should be allowed - external API
          visible: false,
        }), []);

        return <ExternalComponent {...props} />;
      }
      `,

      // Core case: JSX with direct object literal props
      `
      import { ExternalComponent } from 'external-lib';

      function App() {
        return (
          <ExternalComponent
            config={{
              enabled: true,  // Should be allowed - external API
              disabled: false,
            }}
          />
        );
      }
      `,

      // Core case: JSX with variable props
      `
      import { ExternalComponent } from 'external-lib';

      function App() {
        const config = {
          active: true,  // Should be allowed - external API
          visible: false,
        };

        return <ExternalComponent config={config} />;
      }
      `,
    ],
    invalid: [
      // Should be invalid: useMemo not used with external API (JSX version)
      {
        code: `
        import { useMemo } from 'react';

        function Component() {
          const config = useMemo(() => ({
            active: true,
            visible: false,
          }), []);

          return <div>{config.active ? 'Active' : 'Inactive'}</div>;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: JSX with local components
      {
        code: `
        function LocalComponent({ config }: { config: any }) {
          return <div>{config.active ? 'Active' : 'Inactive'}</div>;
        }

        function App() {
          const config = {
            active: true,
            visible: false,
          };

          return <LocalComponent config={config} />;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: JSX with built-in HTML elements
      {
        code: `
        function App() {
          const config = {
            active: true,
            visible: false,
          };

          return <div data-config={JSON.stringify(config)} />;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
