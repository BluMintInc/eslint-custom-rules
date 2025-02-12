import { ruleTesterTs } from '../utils/ruleTester';
import { requireRouterStateConstantKey } from '../../src/rules/require-router-state-constant-key';

ruleTesterTs.run('require-router-state-constant-key', requireRouterStateConstantKey, {
  valid: [
    // Constant with as const assertion
    {
      code: `
        const MATCH_DIALOG_KEY = 'match-session' as const;
        const [value, setValue] = useRouterState({ key: MATCH_DIALOG_KEY });
      `,
    },
    // Object of constants
    {
      code: `
        const TOURNAMENT_KEYS = {
          MATCH_DIALOG: 'match-session',
          SESSION_DIALOG: 'session-dialog',
        } as const;
        const [value, setValue] = useRouterState({ key: TOURNAMENT_KEYS.MATCH_DIALOG });
      `,
    },
    // Dynamic key with template literal
    {
      code: `
        const [value, setValue] = useRouterState({ key: \`\${prefix}-\${id}\` });
      `,
    },
    // Logical expression with constant
    {
      code: `
        const DEFAULT_KEY = 'default' as const;
        const [value, setValue] = useRouterState({ key: providedKey || DEFAULT_KEY });
      `,
    },
    // Test file with string literal
    {
      code: `
        const [value, setValue] = useRouterState({ key: 'test-key' });
      `,
      filename: 'src/components/test.test.ts',
    },
  ],
  invalid: [
    // String literal
    {
      code: `
        const [value, setValue] = useRouterState({ key: 'match-session' });
      `,
      errors: [{ messageId: 'requireConstantKey' }],
    },
    // Variable without as const
    {
      code: `
        const matchKey = 'match-session';
        const [value, setValue] = useRouterState({ key: matchKey });
      `,
      errors: [{ messageId: 'requireConstantKey' }],
    },
    // Object without as const
    {
      code: `
        const TOURNAMENT_KEYS = {
          MATCH_DIALOG: 'match-session',
        };
        const [value, setValue] = useRouterState({ key: TOURNAMENT_KEYS.MATCH_DIALOG });
      `,
      errors: [{ messageId: 'requireConstantKey' }],
    },
  ],
});
