import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-bug-fix',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report
      `
      const speakerVolume =
        caller instanceof RemoteParticipant && caller.getVolume();

      // Later used as a number:
      if (!!speakerVolume && speakerVolume > 0) {
        // Do something with the volume
      }
      `,
      // Additional test cases with similar patterns
      `
      const audioLevel =
        device instanceof AudioDevice && device.getLevel();

      // Later used as a number:
      const normalizedLevel = audioLevel * 100;
      `,
      `
      const userProfile =
        user && user.getProfile();

      // Later used as an object:
      const userName = userProfile?.name || 'Anonymous';
      `,
      `
      const responseData =
        response && response.getData();

      // Later used as an array:
      const items = responseData?.items || [];
      `,
    ],
    invalid: [
      // Should still flag actual boolean variables with logical AND
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
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
        const authenticated = user && user.checkAuth();
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'authenticated',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
