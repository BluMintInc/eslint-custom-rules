import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceQueryKeyTs } from '../rules/enforce-querykey-ts';

ruleTesterJsx.run('enforce-querykey-ts', enforceQueryKeyTs, {
  valid: [
    {
      code: `
        import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

        function Component() {
          const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{playbackId}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from 'src/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
          const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
          return <div>{notification} {channel}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: NOTIFICATION_KEY });
          return <div>{notification}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

        function Component({ isNotification }) {
          const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
          const [queryValue] = useRouterState({ key: keyToUse });
          return <div>{queryValue}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_SESSION } from './util/routing/queryKeys';

        function Component() {
          const [session] = useRouterState({ key: QUERY_KEY_SESSION });
          return <div>{session}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_DIALOG } from '../util/routing/queryKeys';

        function Component() {
          const [dialog] = useRouterState({ key: QUERY_KEY_DIALOG });
          return <div>{dialog}</div>;
        }
      `,
    },
    {
      code: `
        import {
          QUERY_KEY_NOTIFICATION,
          QUERY_KEY_CHANNEL,
          QUERY_KEY_PLAYBACK_ID
        } from '@/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
          const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
          const [playback] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{notification} {channel} {playback}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_USER } from '@/util/routing/queryKeys';

        function Component() {
          const userKey = QUERY_KEY_USER;
          const [user] = useRouterState({ key: userKey });
          return <div>{user}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_ADMIN, QUERY_KEY_USER } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [data] = useRouterState({
            key: isAdmin ? QUERY_KEY_ADMIN : QUERY_KEY_USER
          });
          return <div>{data}</div>;
        }
      `,
    },
    {
      code: `
        import { QueryKeys } from '@/util/routing/queryKeys';

        function Component() {
          const [data] = useRouterState({ key: QueryKeys.QUERY_KEY_MATCH });
          return <div>{data}</div>;
        }
      `,
    },
    {
      code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [data] = useRouterState({ key: QueryKeys.QUERY_KEY_MATCH });
          return <div>{data}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_SETTINGS } from '../../../util/routing/queryKeys';

        function Component() {
          const [settings] = useRouterState({ key: QUERY_KEY_SETTINGS });
          return <div>{settings}</div>;
        }
      `,
    },
    {
      code: `
        function Component() {
          const [value] = useRouterState({ location: 'queryParam' });
          return <div>{value}</div>;
        }
      `,
    },
    {
      code: `
        function Component() {
          const [value] = useRouterState();
          return <div>{value}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_DATA } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState(QUERY_KEY_DATA);
          return <div>{value}</div>;
        }
      `,
    },
    {
      code: `
        import { QUERY_KEY_ANALYTICS } from '@/util/routing/queryKeys';

        function Component() {
          const baseKey = QUERY_KEY_ANALYTICS;
          const finalKey = baseKey;
          const [analytics] = useRouterState({ key: finalKey });
          return <div>{analytics}</div>;
        }
      `,
    },
  ],

  invalid: [
    {
      code: `
        function Component() {
          const [playbackId] = useRouterState({ key: 'playback-id' });
          return <div>{playbackId}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component() {
          const [value] = useRouterState({
            key: 'tournament-details',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function MatchComponent() {
          const [value] = useRouterState({ key: 'match-view' });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [value] = useRouterState({ key: 'tournament-view' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
    },
    {
      code: `
        function useCustomRouterState(id) {
          const [matchValue] = useRouterState({ key: 'match-details' });
          const [tournamentValue] = useRouterState({ key: 'tournament-details' });
          return { match: matchValue, tournament: tournamentValue };
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
    },
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`user-profile-\${id}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        const MY_KEY = 'custom-key';

        function Component() {
          const [value] = useRouterState({ key: MY_KEY });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'MY_KEY' },
        },
      ],
    },
    {
      code: `
        import { QUERY_KEY_WRONG } from './wrong/path';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_WRONG });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'QUERY_KEY_WRONG' },
        },
      ],
    },
    {
      code: `
        import { WRONG_PATTERN } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: WRONG_PATTERN });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'WRONG_PATTERN' },
        },
      ],
    },
    {
      code: `
        import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          const [invalid] = useRouterState({ key: 'invalid-literal' });
          return <div>{valid} {invalid}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component() {
          const [value1] = useRouterState({ key: 'section.subsection' });
          const [value2] = useRouterState({ key: 'user:profile:settings' });
          const [value3] = useRouterState({ key: 'app/module/component' });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
    },
    {
      code: `
        function ParentComponent() {
          return <ChildComponent />;
        }

        function ChildComponent() {
          const [value] = useRouterState({ key: 'child-component' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function MultiComponent({ sections }) {
          return (
            <div>
              {sections.map(section => {
                const [value] = useRouterState({ key: 'section-' + section.id });
                return <div key={section.id}>{value}</div>;
              })}
            </div>
          );
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component() {
          const keyName = 'user-settings';
          const [value] = useRouterState({ key: keyName });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'keyName' },
        },
      ],
    },
    {
      code: `
        function Component({ userId }) {
          const [value] = useRouterState({ key: \`user-profile-details-\${userId}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'prefix-' + id + '-suffix' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        import { QUERY_KEY_ADMIN } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? QUERY_KEY_ADMIN : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component() {
          const [value1] = useRouterState({ key: 'user@profile' });
          const [value2] = useRouterState({ key: 'section#details' });
          const [value3] = useRouterState({ key: 'app$module' });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
      errors: [
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
        { messageId: 'enforceQueryKeyImport' },
      ],
    },
    {
      code: `
        function Component() {
          const [value] = useRouterState({ key: '' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ userId }) {
          const [profile] = useRouterState({ key: \`\${QUERY_KEY_USER_PROFILE}-\${userId}\` });
          return <div>{profile}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        import { QUERY_KEY_MATCH } from '@/util/routing/queryKeys';

        function Component({ matchId }) {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH + matchId });
          return <div>{match}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        import { QUERY_KEY_REPORT } from '@/util/routing/queryKeys';

        function getReportKey() {
          return QUERY_KEY_REPORT;
        }

        function Component() {
          const [report] = useRouterState({ key: getReportKey() });
          return <div>{report}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
    {
      code: `
        function Component() {
          const a = b;
          const b = a;
          const [value] = useRouterState({ key: a });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'enforceQueryKeyConstant',
          data: { variableName: 'a' },
        },
      ],
    },
    {
      code: `
        const QueryKeys = { OTHER: 'other' };

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.OTHER });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },
  ],
});
