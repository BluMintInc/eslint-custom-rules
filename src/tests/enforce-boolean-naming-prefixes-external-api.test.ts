import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run('enforce-boolean-naming-prefixes-external-api', enforceBooleanNamingPrefixes, {
  valid: [
    // Test case for external API calls with boolean properties
    `
    import { mkdirSync, writeFileSync } from 'fs';
    import { dirname } from 'path';

    function writeTsFile(filePath: string, content: string) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }
    `,
    // Another example with a different external API
    `
    import { createServer } from 'http';

    const server = createServer({ keepAlive: true });
    `,
    // Test with member expression from imported module
    `
    import * as fs from 'fs';
    import { dirname } from 'path';

    function createDirectory(path: string) {
      fs.mkdirSync(dirname(path), { recursive: true });
    }
    `,
    // Test with renamed import
    `
    import { mkdirSync as makeDir } from 'fs';
    import { dirname } from 'path';

    function ensureDirectoryExists(path: string) {
      makeDir(dirname(path), { recursive: true });
    }
    `,
  ],
  invalid: [
    // Should flag boolean properties in object literals NOT passed to external APIs
    {
      code: `
      function createSettings() {
        return { enabled: true, visible: false };
      }
      `,
      errors: [
        {
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: 'enabled',
            prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
          },
        },
        {
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: 'visible',
            prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
          },
        },
      ],
    },
    // Should flag boolean properties in object literals passed to non-imported functions
    {
      code: `
      function localFunction(options: { enabled: boolean }) {
        return options.enabled;
      }

      const result = localFunction({ enabled: true });
      `,
      errors: [
        {
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: 'enabled',
            prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
          },
          line: 6,
          column: 38,
        },
        {
          messageId: 'missingBooleanPrefix',
          data: {
            type: 'property',
            name: 'enabled',
            prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
          },
          line: 2,
          column: 41,
        },
      ],
    },
  ],
});
