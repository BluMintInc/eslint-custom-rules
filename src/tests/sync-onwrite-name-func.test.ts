import { ruleTesterTs } from '../utils/ruleTester';
import { syncOnwriteNameFunc } from '../rules/sync-onwrite-name-func';

ruleTesterTs.run('sync-onwrite-name-func', syncOnwriteNameFunc, {
  valid: [
    {
      code: `
        const config = {
          name: 'processMatchMessages',
          func: processMatchMessages,
        };
      `,
    },
    {
      code: `
        const handler = {
          name: 'notifyMatchChanges',
          func: notifyMatchChanges,
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        const config = {
          name: 'processMatchMessages',
          func: notifyMatchChanges,
        };
      `,
      errors: [{ messageId: 'mismatchedName' }],
      output: `
        const config = {
          name: 'notifyMatchChanges',
          func: notifyMatchChanges,
        };
      `,
    },
    {
      code: `
        const handler = {
          name: 'oldName',
          func: newFunctionName,
        };
      `,
      errors: [{ messageId: 'mismatchedName' }],
      output: `
        const handler = {
          name: 'newFunctionName',
          func: newFunctionName,
        };
      `,
    },
  ],
});
