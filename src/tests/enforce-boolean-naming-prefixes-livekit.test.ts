import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-livekit',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report
      `
      const { useRoomContext, useParticipants } = livekit;

      const room = useRoomContext();
      const participants = useParticipants() || [];

      // Later used as an array:
      const shouldStopTracks = participants.length === 1;
      `,
      // Additional test case with similar pattern
      `
      const { useUsers } = someHook;
      const users = useUsers() || [];
      const hasUsers = users.length > 0;
      `,
    ],
    invalid: [],
  },
);
