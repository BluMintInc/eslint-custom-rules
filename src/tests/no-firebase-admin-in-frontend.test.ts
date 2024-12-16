import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../rules/no-firebase-admin-in-frontend';

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-firebase-admin-in-frontend', rule, {
  valid: [
    {
      code: `import React from 'react';`,
      filename: 'frontend/src/components/App.tsx',
    },
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'backend/src/server.ts',
    },
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'frontend/src/tests/mock.test.ts',
      options: [{ excludePatterns: ['**/test/**/*', '**/*.test.*'] }],
    },
    {
      code: `const dynamicImport = async () => { await import('some-package'); };`,
      filename: 'frontend/src/utils/helper.ts',
    },
  ],
  invalid: [
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'frontend/src/components/App.tsx',
      errors: [
        {
          messageId: 'noFirebaseAdmin',
          data: {
            pkg: 'firebase-admin',
            chain: 'firebase-admin',
          },
        },
      ],
    },
    {
      code: `import { functions } from 'firebase-functions';`,
      filename: 'frontend/src/utils/helper.ts',
      errors: [
        {
          messageId: 'noFirebaseAdmin',
          data: {
            pkg: 'firebase-functions',
            chain: 'firebase-functions',
          },
        },
      ],
    },
    {
      code: `const dynamicImport = async () => { await import('firebase-admin'); };`,
      filename: 'frontend/src/services/auth.ts',
      errors: [
        {
          messageId: 'noFirebaseAdmin',
          data: {
            pkg: 'firebase-admin',
            chain: 'firebase-admin',
          },
        },
      ],
    },
  ],
});
