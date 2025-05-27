import { ruleTesterTs } from '../utils/ruleTester';
import { enforceRouterStateKeys } from '../rules/enforce-routerStateKeys';

ruleTesterTs.run('enforce-routerStateKeys', enforceRouterStateKeys, {
  valid: [
    // Using QueryKey from the correct import
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: QueryKey.PLAYBACK_ID });
      `,
    },
    // Using QueryKey with an alias
    {
      code: `
        import { QueryKey as RouterKeys } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: RouterKeys.PLAYBACK_ID });
      `,
    },
    // Using namespace import
    {
      code: `
        import * as RouterStateKeys from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: RouterStateKeys.QueryKey.PLAYBACK_ID });
      `,
    },
    // Using a variable that references QueryKey
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const keyToUse = QueryKey.PLAYBACK_ID;
        const [playbackId] = useRouterState({ key: keyToUse });
      `,
    },
    // Using a conditional expression with QueryKey constants
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({
          key: isNotification ? QueryKey.NOTIFICATION : QueryKey.CHANNEL
        });
      `,
    },
    // Using a member expression that's not a string literal
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const keys = { notification: QueryKey.NOTIFICATION };
        const [value] = useRouterState({ key: keys.notification });
      `,
    },
    // Using a function call that returns a key
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        function getKey() { return QueryKey.NOTIFICATION; }
        const [value] = useRouterState({ key: getKey() });
      `,
    },
    // Using a template literal with only dynamic parts
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const prefix = QueryKey.NOTIFICATION;
        const [value] = useRouterState({ key: \`\${prefix}-\${id}\` });
      `,
    },
    // Not using useRouterState at all
    {
      code: `
        const value = 'some-string-literal';
      `,
    },
    // Using useRouterState without a key property
    {
      code: `
        const [value] = useRouterState({ defaultValue: 'default' });
      `,
    },
    // Using relative import path
    {
      code: `
        import { QueryKey } from '../util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: QueryKey.PLAYBACK_ID });
      `,
    },
  ],
  invalid: [
    // Using string literal without importing QueryKey
    {
      code: `
        const [playbackId] = useRouterState({ key: 'playback-id' });
      `,
      errors: [{ messageId: 'missingImport' }],
    },
    // Using string literal with QueryKey imported
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: 'playback-id' });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
      output: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: QueryKey.PLAYBACK_ID });
      `,
    },
    // Using string literal with aliased import
    {
      code: `
        import { QueryKey as RouterKeys } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: 'playback-id' });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
      output: `
        import { QueryKey as RouterKeys } from '@/util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: RouterKeys.PLAYBACK_ID });
      `,
    },
    // Using template literal with static parts
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: \`notification-\${id}\` });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
    },
    // Using string concatenation
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: 'notification' + '-' + id });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
    },
    // Using conditional expression with string literals
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({
          key: isNotification ? 'notification' : 'channel'
        });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
    },
    // Using snake_case string that should be converted to UPPER_SNAKE_CASE
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: 'notification_id' });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
      output: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: QueryKey.NOTIFICATION_ID });
      `,
    },
    // Using kebab-case string that should be converted to UPPER_SNAKE_CASE
    {
      code: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: 'notification-id' });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
      output: `
        import { QueryKey } from '@/util/routing/routerStateKeys';
        const [value] = useRouterState({ key: QueryKey.NOTIFICATION_ID });
      `,
    },
    // Using relative import path with string literal
    {
      code: `
        import { QueryKey } from '../util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: 'playback-id' });
      `,
      errors: [{ messageId: 'enforceRouterStateKeys' }],
      output: `
        import { QueryKey } from '../util/routing/routerStateKeys';
        const [playbackId] = useRouterState({ key: QueryKey.PLAYBACK_ID });
      `,
    },
  ],
});
