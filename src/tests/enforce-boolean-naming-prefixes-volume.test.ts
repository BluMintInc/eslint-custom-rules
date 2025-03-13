import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-volume',
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
      // Additional test case with similar pattern
      `
      const audioLevel =
        device instanceof AudioDevice && device.getLevel();

      // Later used as a number:
      const normalizedLevel = audioLevel * 100;
      `,
    ],
    invalid: [],
  },
);
