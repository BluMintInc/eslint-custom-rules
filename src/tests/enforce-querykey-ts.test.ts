import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceQueryKeyTs } from '../rules/enforce-querykey-ts';

ruleTesterJsx.run('enforce-querykey-ts', enforceQueryKeyTs, {
  valid: [
    // 1. Basic valid cases - using imported QUERY_KEY constants
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

    // 2. Aliased imports
    {
      code: `
        import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';

        function Component() {
          const [notification] = useRouterState({ key: NOTIFICATION_KEY });
          return <div>{notification}</div>;
        }
      `,
    },

    // 3. Conditional usage with valid constants
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

    // 4. Template literals with query key variables
    {
      code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ userId }) {
          const key = \`\${QUERY_KEY_USER_PROFILE}-\${userId}\`;
          const [profile] = useRouterState({ key });
          return <div>{profile}</div>;
        }
      `,
    },

    // 5. Binary expressions with query keys
    {
      code: `
        import { QUERY_KEY_MATCH } from '@/util/routing/queryKeys';

        function Component({ matchId }) {
          const [match] = useRouterState({ key: QUERY_KEY_MATCH + '-' + matchId });
          return <div>{match}</div>;
        }
      `,
    },

    // 6. Function calls (permissive approach)
    {
      code: `
        import { QUERY_KEY_TOURNAMENT } from '@/util/routing/queryKeys';

        function generateKey(base, suffix) {
          return \`\${base}-\${suffix}\`;
        }

        function Component({ tournamentId }) {
          const [tournament] = useRouterState({
            key: generateKey(QUERY_KEY_TOURNAMENT, tournamentId)
          });
          return <div>{tournament}</div>;
        }
      `,
    },

    // 7. Relative imports
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
        import { QUERY_KEY_MODAL } from '../../util/routing/queryKeys';

        function Component() {
          const [modal] = useRouterState({ key: QUERY_KEY_MODAL });
          return <div>{modal}</div>;
        }
      `,
    },

    // 8. Multiple imports in single statement
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

    // 9. Variables derived from query key constants
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

    // 10. Conditional expressions with valid constants
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

    // 11. Template literals with only separators
    {
      code: `
        import { QUERY_KEY_SECTION } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [section] = useRouterState({ key: \`\${QUERY_KEY_SECTION}-\${id}\` });
          return <div>{section}</div>;
        }
      `,
    },

    // 12. Complex nested usage
    {
      code: `
        import { QUERY_KEY_WORKSPACE, QUERY_KEY_PROJECT } from '@/util/routing/queryKeys';

        function Component({ workspaceId, projectId, isWorkspace }) {
          const baseKey = isWorkspace ? QUERY_KEY_WORKSPACE : QUERY_KEY_PROJECT;
          const id = isWorkspace ? workspaceId : projectId;
          const [data] = useRouterState({ key: \`\${baseKey}-\${id}\` });
          return <div>{data}</div>;
        }
      `,
    },

    // 13. Member expression access (for namespaced constants)
    {
      code: `
        import { QueryKeys } from '@/util/routing/queryKeys';

        function Component() {
          const [data] = useRouterState({ key: QueryKeys.MATCH });
          return <div>{data}</div>;
        }
      `,
    },

    // 14. Different relative path depths
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
        import { QUERY_KEY_PREFERENCES } from '../../../../util/routing/queryKeys';

        function Component() {
          const [preferences] = useRouterState({ key: QUERY_KEY_PREFERENCES });
          return <div>{preferences}</div>;
        }
      `,
    },

    // 15. Edge case: no key property (should not trigger rule)
    {
      code: `
        function Component() {
          const [value] = useRouterState({ location: 'queryParam' });
          return <div>{value}</div>;
        }
      `,
    },

    // 16. Edge case: empty useRouterState call
    {
      code: `
        function Component() {
          const [value] = useRouterState();
          return <div>{value}</div>;
        }
      `,
    },

    // 17. Edge case: non-object argument
    {
      code: `
        import { QUERY_KEY_DATA } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState(QUERY_KEY_DATA);
          return <div>{value}</div>;
        }
      `,
    },

    // 18. Complex variable assignment chain
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

    // 19. Function that returns query key
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
    },

    // 20. Template literal with multiple query key expressions
    {
      code: `
        import { QUERY_KEY_TEAM, QUERY_KEY_MEMBER } from '@/util/routing/queryKeys';

        function Component({ teamId, memberId }) {
          const [data] = useRouterState({
            key: \`\${QUERY_KEY_TEAM}-\${teamId}-\${QUERY_KEY_MEMBER}-\${memberId}\`
          });
          return <div>{data}</div>;
        }
      `,
    },
  ],

  invalid: [
    // 1. Basic invalid cases - string literals
    {
      code: `
        function Component() {
          const [playbackId] = useRouterState({ key: 'playback-id' });
          return <div>{playbackId}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `
        function Component() {
          const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
          return <div>{playbackId}</div>;
        }
      `,
    },

    // 2. String literal with other properties
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
      output: `
        function Component() {
          const [value] = useRouterState({
            key: QUERY_KEY_TOURNAMENT_DETAILS,
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
    },

    // 3. Multiple string literals in different components
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
      output: `
        function MatchComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_MATCH_VIEW });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_TOURNAMENT_VIEW });
          return <div>{value}</div>;
        }
      `,
    },

    // 4. String literals in custom hook
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
      output: `
        function useCustomRouterState(id) {
          const [matchValue] = useRouterState({ key: QUERY_KEY_MATCH_DETAILS });
          const [tournamentValue] = useRouterState({ key: QUERY_KEY_TOURNAMENT_DETAILS });
          return { match: matchValue, tournament: tournamentValue };
        }
      `,
    },

    // 5. String concatenation with literals
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 6. Conditional expressions with string literals
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

    // 7. Template literal with static content
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`user-profile-\${id}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 8. Variable not from queryKeys.ts
    {
      code: `
        const MY_KEY = 'custom-key';

        function Component() {
          const [value] = useRouterState({ key: MY_KEY });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyConstant', data: { variableName: 'MY_KEY' } }],
    },

    // 9. Import from wrong source
    {
      code: `
        import { QUERY_KEY_WRONG } from './wrong/path';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_WRONG });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyConstant', data: { variableName: 'QUERY_KEY_WRONG' } }],
    },

    // 10. Constant not following QUERY_KEY_ pattern
    {
      code: `
        import { WRONG_PATTERN } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: WRONG_PATTERN });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyConstant', data: { variableName: 'WRONG_PATTERN' } }],
    },

    // 11. Mixed valid and invalid usage
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
      output: `
        import { QUERY_KEY_VALID } from '@/util/routing/queryKeys';

        function Component() {
          const [valid] = useRouterState({ key: QUERY_KEY_VALID });
          const [invalid] = useRouterState({ key: QUERY_KEY_INVALID_LITERAL });
          return <div>{valid} {invalid}</div>;
        }
      `,
    },

    // 12. Complex string literal patterns
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
      output: `
        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_SECTION_SUBSECTION });
          const [value2] = useRouterState({ key: QUERY_KEY_USER_PROFILE_SETTINGS });
          const [value3] = useRouterState({ key: QUERY_KEY_APP_MODULE_COMPONENT });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
    },

    // 13. Nested component with string literal
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
      output: `
        function ParentComponent() {
          return <ChildComponent />;
        }

        function ChildComponent() {
          const [value] = useRouterState({ key: QUERY_KEY_CHILD_COMPONENT });
          return <div>{value}</div>;
        }
      `,
    },

    // 14. Array mapping with string literals
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

    // 15. Variable assignment from string literal
    {
      code: `
        function Component() {
          const keyName = 'user-settings';
          const [value] = useRouterState({ key: keyName });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyConstant', data: { variableName: 'keyName' } }],
    },

    // 16. Template literal with significant static content
    {
      code: `
        function Component({ userId }) {
          const [value] = useRouterState({ key: \`user-profile-details-\${userId}\` });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 17. Binary expression with string literal
    {
      code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'prefix-' + id + '-suffix' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
    },

    // 18. Conditional with mixed valid/invalid
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

    // 19. Special characters in string literals
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
      output: `
        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: QUERY_KEY_SECTION_DETAILS });
          const [value3] = useRouterState({ key: QUERY_KEY_APP_MODULE });
          return <div>{value1} {value2} {value3}</div>;
        }
      `,
    },

    // 20. Empty string literal
    {
      code: `
        function Component() {
          const [value] = useRouterState({ key: '' });
          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'enforceQueryKeyImport' }],
      output: `
        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_ });
          return <div>{value}</div>;
        }
      `,
    },
  ],
});
