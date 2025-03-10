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
  ],
  invalid: [],
});
