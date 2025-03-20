import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-logical-or',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case for array with logical OR fallback
      `
      const { useRoomContext, useParticipants } = livekit;
      const room = useRoomContext();
      const participants = useParticipants() || [];
      const shouldStopTracks = participants.length === 1;
      `,
      // Another example with object fallback
      `
      const user = getUser() || {};
      const name = user.name || 'Anonymous';
      `,
      // Example with string fallback
      `
      const message = getMessage() || '';
      const length = message.length;
      `,
      // Example with number fallback
      `
      const count = getCount() || 0;
      const isPositive = count > 0;
      `,
    ],
    invalid: [
      // Should still flag actual boolean variables using logical OR
      {
        code: `
        const active = isActive() || false;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },
      // Should flag boolean variables with logical AND
      {
        code: `
        const loggedIn = user && user.isAuthenticated;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'loggedIn',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },
    ],
  },
);
