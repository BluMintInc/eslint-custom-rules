import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../rules/no-firebase-admin-in-frontend';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
});

// Set up virtual file system for testing
const backendUtilsContent = `
  import * as admin from 'firebase-admin';
  export const getUser = () => {
    return admin.auth().getUser('123');
  };
`;

const safeBackendUtilsContent = `
  export const someBackendUtil = () => {
    return 'hello';
  };
`;

ruleTester.run('no-firebase-admin-in-frontend', rule, {
  valid: [
    {
      code: `import React from 'react';`,
      filename: 'src/components/App.tsx',
    },
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'functions/src/server.ts',
    },
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'src/tests/mock.test.ts',
      options: [{ excludePatterns: ['**/test/**/*', '**/*.test.*'] }],
    },
    {
      code: `const dynamicImport = async () => { await import('some-package'); };`,
      filename: 'src/utils/helper.ts',
    },
    // Backend utility that doesn't use firebase-admin
    {
      code: safeBackendUtilsContent,
      filename: 'functions/src/server/utils.ts',
    },
    // Frontend importing a safe backend utility
    {
      code: `
        import { someBackendUtil } from '../functions/src/server/utils';
        console.log(someBackendUtil());
      `,
      filename: 'src/components/MyComponent.tsx',
      files: {
        'functions/src/server/utils.ts': safeBackendUtilsContent,
      },
    },
  ],
  invalid: [
    {
      code: `import admin from 'firebase-admin';`,
      filename: 'src/components/App.tsx',
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
      filename: 'src/utils/helper.ts',
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
    // Backend utility that uses firebase-admin
    {
      code: backendUtilsContent,
      filename: 'functions/src/server/auth.ts',
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
    // Frontend importing a backend utility that uses firebase-admin
    {
      code: `
        import { getUser } from '../functions/src/server/auth';
        const user = getUser();
      `,
      filename: 'src/components/UserProfile.tsx',
      files: {
        'functions/src/server/auth.ts': backendUtilsContent,
      },
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
    // Dynamic import of a backend utility that uses firebase-admin
    {
      code: `
        const loadUser = async () => {
          const { getUser } = await import('../functions/src/server/auth');
          return getUser();
        };
      `,
      filename: 'src/components/LazyUserProfile.tsx',
      files: {
        'functions/src/server/auth.ts': backendUtilsContent,
      },
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
