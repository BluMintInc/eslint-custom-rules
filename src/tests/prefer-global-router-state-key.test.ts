import { ruleTesterJsx } from '../utils/ruleTester';
import { preferGlobalRouterStateKey } from '../rules/prefer-global-router-state-key';

ruleTesterJsx.run('prefer-global-router-state-key', preferGlobalRouterStateKey, {
  valid: [
    // Using a global constant
    {
      code: `
        const MATCH_DIALOG_KEY = 'match-session' as const;

        function Component() {
          const [value, setValue] = useRouterState({ key: MATCH_DIALOG_KEY });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a type-safe function
    {
      code: `
        type ValidPrefix = 'match' | 'tournament' | 'session';

        function generateKey(prefix: ValidPrefix, id: string): string {
          return \`\${prefix}-\${id}\`;
        }

        function Component({ userId }) {
          const [value, setValue] = useRouterState({
            key: generateKey('match', userId)
          });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a prop with proper typing
    {
      code: `
        interface DialogProps {
          routerKey: string;
        }

        function Dialog({ routerKey }: DialogProps) {
          const [value, setValue] = useRouterState({ key: routerKey });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a variable
    {
      code: `
        function Component() {
          const matchKey = getMatchKey();
          const [value, setValue] = useRouterState({ key: matchKey });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a template literal with variables
    {
      code: `
        function Component({ id, type }) {
          const [value, setValue] = useRouterState({ key: \`\${type}-\${id}\` });
          return <div>{value}</div>;
        }
      `,
    },
  ],
  invalid: [
    // Using a string literal directly
    {
      code: `
        function Component() {
          const [value, setValue] = useRouterState({ key: 'match-session' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using a string literal with other properties
    {
      code: `
        function Component() {
          const [value, setValue] = useRouterState({
            key: 'tournament-details',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
  ],
});
