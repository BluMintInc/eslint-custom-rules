import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/no-restricted-imports-dynamic';

const ruleTester = ruleTesterTs;

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Regular imports that are not restricted
    {
      code: `import React from 'react';`,
      options: [{ paths: ['lodash'] }],
    },
    // Type imports from restricted paths with allowTypeImports
    {
      code: `import type { Something } from 'lodash';`,
      options: [{ paths: [{ name: 'lodash', allowTypeImports: true }] }],
    },
    // Dynamic imports from restricted paths with allowDynamicImports
    {
      code: `import { Something } from 'lodash.dynamic';`,
      options: [{ paths: [{ name: 'lodash.dynamic', allowDynamicImports: true }] }],
    },
    // Imports in .dynamic.tsx files should be allowed regardless of restrictions
    {
      code: `import { Something } from 'lodash';`,
      options: [{ paths: ['lodash'] }],
      filename: 'Component.dynamic.tsx',
    },
    // Imports in .dynamic.tsx files that import other dynamic files
    {
      code: `import { useMessage } from './MessageContext.dynamic';`,
      options: [
        {
          patterns: [
            {
              group: ['*.dynamic'],
              message: 'Do not import {{importSource}} in frontend code. These imports are only allowed in backend code.',
            },
          ],
        },
      ],
      filename: 'useMessageActions.dynamic.tsx',
    },
    // Regular imports that don't match restricted patterns
    {
      code: `import { useState } from 'react';`,
      options: [
        {
          patterns: [
            {
              group: ['lodash/*'],
              message: 'Use individual lodash functions instead.',
            },
          ],
        },
      ],
    },
  ],
  invalid: [
    // Restricted path
    {
      code: `import _ from 'lodash';`,
      options: [{ paths: ['lodash'] }],
      errors: [{ messageId: 'restrictedImport' }],
    },
    // Restricted path with custom message
    {
      code: `import _ from 'lodash';`,
      options: [
        {
          paths: [
            {
              name: 'lodash',
              message: 'Use individual lodash functions instead.',
            },
          ],
        },
      ],
      errors: [
        {
          messageId: 'restrictedImport',
          data: {
            importSource: 'lodash',
            customMessage: ': Use individual lodash functions instead.',
          },
        },
      ],
    },
    // Restricted pattern
    {
      code: `import partition from 'lodash/partition';`,
      options: [
        {
          patterns: [
            {
              group: ['lodash/*'],
              message: 'Use individual lodash functions instead.',
            },
          ],
        },
      ],
      errors: [{ messageId: 'restrictedImportPattern' }],
    },
    // Dynamic import in a regular file (not .dynamic.tsx)
    {
      code: `import { useMessage } from './MessageContext.dynamic';`,
      options: [
        {
          patterns: [
            {
              group: ['*.dynamic'],
              message: 'Do not import {{importSource}} in frontend code. These imports are only allowed in backend code.',
            },
          ],
        },
      ],
      errors: [{ messageId: 'restrictedImportPattern' }],
    },
  ],
});
