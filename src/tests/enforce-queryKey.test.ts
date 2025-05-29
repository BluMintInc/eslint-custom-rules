
import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceQueryKey } from '../rules/enforce-queryKey';

ruleTesterJsx.run(
  'enforce-queryKey',
  enforceQueryKey,
  {
    valid: [
      // Using an imported query key constant
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

          function Component() {
            const [playbackId, setPlaybackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
            return <div>{playbackId}</div>;
          }
        `,
      },
      // Using an imported query key constant with alias
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID as PLAYBACK_KEY } from '@/util/routing/queryKeys';

          function Component() {
            const [playbackId, setPlaybackId] = useRouterState({ key: PLAYBACK_KEY });
            return <div>{playbackId}</div>;
          }
        `,
      },
      // Using a variable assigned from an imported query key constant
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

          function Component() {
            const playbackKey = QUERY_KEY_PLAYBACK_ID;
            const [playbackId, setPlaybackId] = useRouterState({ key: playbackKey });
            return <div>{playbackId}</div>;
          }
        `,
      },
      // Using multiple imported query key constants
      {
        code: `
          import {
            QUERY_KEY_PLAYBACK_ID,
            QUERY_KEY_NOTIFICATION,
            QUERY_KEY_CHANNEL
          } from '@/util/routing/queryKeys';

          function Component() {
            const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
            const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
            const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
            return <div>{playbackId}</div>;
          }
        `,
      },
      // Using a conditional with imported query key constants
      {
        code: `
          import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

          function Component({ isNotification }) {
            const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
            const [value] = useRouterState({ key: keyToUse });
            return <div>{value}</div>;
          }
        `,
      },
      // Using a re-exported query key constant
      {
        code: `
          // In a file that re-exports
          // export { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';

          import { NOTIFICATION_KEY } from './constants';

          function Component() {
            const [notification] = useRouterState({ key: NOTIFICATION_KEY });
            return <div>{notification}</div>;
          }
        `,
      },
      // Using a computed property with imported query key constants
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

          const KEYS = {
            playback: QUERY_KEY_PLAYBACK_ID,
            channel: QUERY_KEY_CHANNEL,
          };

          function Component({ type }) {
            const keyToUse = KEYS[type];
            const [value] = useRouterState({ key: keyToUse });
            return <div>{value}</div>;
          }
        `,
      },
      // Using a template literal with only dynamic parts
      {
        code: `
          function Component({ id, type }) {
            const [value] = useRouterState({ key: \`\${type}-\${id}\` });
            return <div>{value}</div>;
          }
        `,
      },
      // Using a function that returns a key
      {
        code: `
          function getKeyForEntity(entity) {
            return \`\${entity.type}-\${entity.id}\`;
          }

          function Component({ entity }) {
            const [value] = useRouterState({ key: getKeyForEntity(entity) });
            return <div>{value}</div>;
          }
        `,
      },
      // Using a relative import path
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID } from '../../../util/routing/queryKeys';

          function Component() {
            const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
            return <div>{playbackId}</div>;
          }
        `,
      },
      // Using src/util/routing/queryKeys path
      {
        code: `
          import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

          function Component() {
            const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
            return <div>{playbackId}</div>;
          }
        `,
      },
    ],
    invalid: [
      // Using a string literal directly
      {
        code: `
          function Component() {
            const [playbackId] = useRouterState({ key: 'playback-id' });
            return <div>{playbackId}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using a string literal with other properties
      {
        code: `
          function Component() {
            const [playbackId] = useRouterState({
              key: 'playback-id',
              location: 'queryParam'
            });
            return <div>{playbackId}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using multiple string literals in different components
      {
        code: `
          function PlaybackComponent() {
            const [playbackId] = useRouterState({ key: 'playback-id' });
            return <div>{playbackId}</div>;
          }

          function ChannelComponent() {
            const [channelId] = useRouterState({ key: 'channel-id' });
            return <div>{channelId}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using string literals in a custom hook
      {
        code: `
          function useCustomRouterState() {
            const [playbackId] = useRouterState({ key: 'playback-id' });
            const [channelId] = useRouterState({ key: 'channel-id' });

            return {
              playback: playbackId,
              channel: channelId,
            };
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using string literals with template expressions
      {
        code: `
          function Component({ id }) {
            const [playbackId] = useRouterState({ key: 'playback-' + id });
            return <div>{playbackId}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using string literals in conditional expressions
      {
        code: `
          function Component({ isPlayback }) {
            const [value] = useRouterState({
              key: isPlayback ? 'playback-id' : 'channel-id'
            });
            return <div>{value}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using string literals in array mapping
      {
        code: `
          function MultiComponent({ items }) {
            return (
              <div>
                {items.map(item => {
                  const [value] = useRouterState({ key: 'item-' + item.id });
                  return <div key={item.id}>{value}</div>;
                })}
              </div>
            );
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using string literals in nested components
      {
        code: `
          function ParentComponent() {
            return (
              <div>
                <ChildComponent />
              </div>
            );
          }

          function ChildComponent() {
            const [value] = useRouterState({ key: 'child-component' });
            return <div>{value}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using template literals with static parts
      {
        code: `
          function Component({ id }) {
            const [value] = useRouterState({ key: \`playback-\${id}\` });
            return <div>{value}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
      // Using a variable with a string literal
      {
        code: `
          function Component() {
            const key = 'playback-id';
            const [value] = useRouterState({ key });
            return <div>{value}</div>;
          }
        `,
        errors: [
          {
            messageId: 'enforceQueryKey',
          },
        ],
      },
    ],
  },
);
