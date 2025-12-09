import { ruleTesterTs } from '../utils/ruleTester';
import { syncOnwriteNameFunc } from '../rules/sync-onwrite-name-func';

const mismatchedNameData = (nameValue: string, funcName: string) => ({
  nameValue,
  funcName,
});

ruleTesterTs.run('sync-onwrite-name-func', syncOnwriteNameFunc, {
  valid: [
    // Basic valid cases
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
    // Valid case with additional properties
    {
      code: `
        const config = {
          name: 'processData',
          func: processData,
          region: 'us-central1',
          memory: '256MB',
        };
      `,
    },
    // Valid case with properties in different order
    {
      code: `
        const config = {
          func: handleUserData,
          memory: '512MB',
          name: 'handleUserData',
          timeout: '60s',
        };
      `,
    },
    // Valid case with object spread
    {
      code: `
        const baseConfig = { memory: '256MB', timeout: '30s' };
        const config = {
          ...baseConfig,
          name: 'processQueue',
          func: processQueue,
        };
      `,
    },
    // Valid case with object as variable
    {
      code: `
        const funcRef = myFunction;
        const config = {
          name: 'myFunction',
          func: funcRef,
        };
      `,
    },
    // Valid case with only name and func
    {
      code: `
        const config = { name: 'minimal', func: minimal };
      `,
    },
  ],
  invalid: [
    // Basic mismatch case
    {
      code: `
        const config = {
          name: 'processMatchMessages',
          func: notifyMatchChanges,
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData(
            'processMatchMessages',
            'notifyMatchChanges',
          ),
        },
      ],
      output: `
        const config = {
          name: 'notifyMatchChanges',
          func: notifyMatchChanges,
        };
      `,
    },
    // Mismatch with additional properties
    {
      code: `
        const config = {
          name: 'oldName',
          func: newFunctionName,
          region: 'us-central1',
          memory: '256MB',
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('oldName', 'newFunctionName'),
        },
      ],
      output: `
        const config = {
          name: 'newFunctionName',
          func: newFunctionName,
          region: 'us-central1',
          memory: '256MB',
        };
      `,
    },
    // Mismatch with properties in different order
    {
      code: `
        const handler = {
          memory: '512MB',
          func: processAuth,
          name: 'oldAuthHandler',
          timeout: '60s',
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('oldAuthHandler', 'processAuth'),
        },
      ],
      output: `
        const handler = {
          memory: '512MB',
          func: processAuth,
          name: 'processAuth',
          timeout: '60s',
        };
      `,
    },
    // Mismatch with object spread
    {
      code: `
        const baseConfig = { memory: '256MB', timeout: '30s' };
        const config = {
          ...baseConfig,
          name: 'oldName',
          func: processQueue,
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('oldName', 'processQueue'),
        },
      ],
      output: `
        const baseConfig = { memory: '256MB', timeout: '30s' };
        const config = {
          ...baseConfig,
          name: 'processQueue',
          func: processQueue,
        };
      `,
    },
    // Mismatch with object as variable
    {
      code: `
        const funcRef = myFunction;
        const config = {
          name: 'wrongName',
          func: funcRef,
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('wrongName', 'myFunction'),
        },
      ],
      output: `
        const funcRef = myFunction;
        const config = {
          name: 'myFunction',
          func: funcRef,
        };
      `,
    },
    // Mismatch in minimal object
    {
      code: `
        const config = { name: 'wrong', func: minimal };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('wrong', 'minimal'),
        },
      ],
      output: `
        const config = { name: 'minimal', func: minimal };
      `,
    },
    // Mismatch with string quotes
    {
      code: `
        const config = {
          name: "oldHandler",
          func: newHandler,
        };
      `,
      errors: [
        {
          messageId: 'mismatchedName',
          data: mismatchedNameData('oldHandler', 'newHandler'),
        },
      ],
      output: `
        const config = {
          name: 'newHandler',
          func: newHandler,
        };
      `,
    },
  ],
});
