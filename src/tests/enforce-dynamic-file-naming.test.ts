import { ESLintUtils } from '@typescript-eslint/utils';
import { Linter } from 'eslint';
import rule, { RULE_NAME } from '../rules/enforce-dynamic-file-naming';

// Create a custom rule tester that doesn't require the actual enforce-dynamic-imports rule
const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

const linter = (ruleTester as unknown as { linter: Linter }).linter;

linter.defineRule('@blumintinc/blumint/enforce-dynamic-imports', {
  meta: {
    type: 'problem',
    docs: { description: 'stub', recommended: false },
    schema: [],
  },
  create: () => ({}),
});

linter.defineRule('@blumintinc/blumint/require-dynamic-firebase-imports', {
  meta: {
    type: 'problem',
    docs: { description: 'stub', recommended: false },
    schema: [],
  },
  create: () => ({}),
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.ts',
    },
    // File with .dynamic.ts extension and enforce-dynamic-imports eslint-disable-line directive
    {
      code: `import SomeModule from './SomeModule'; // eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports`,
      filename: 'example.dynamic.ts',
    },
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.tsx',
    },
    // File with .dynamic.ts extension and enforce-dynamic-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
    },
    // File with .dynamic.tsx extension and enforce-dynamic-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
    },
    // File with .dynamic.ts extension and require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.dynamic.ts',
    },
    // File with .dynamic.tsx extension and require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.dynamic.tsx',
    },
    // Ignore files with other extensions
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.test.ts',
    },
    // Ignore files with other extensions
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.deprecated.ts',
    },
    // Ignore non-TypeScript files
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.js',
    },
  ],
  invalid: [
    // File without .dynamic.ts extension but with enforce-dynamic-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
    // File without .dynamic.tsx extension but with enforce-dynamic-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.tsx',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.tsx',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.tsx',
            suggestedName: 'example.dynamic.tsx',
          },
        },
      ],
    },
    // File without .dynamic.ts extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/require-dynamic-firebase-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
    // File without .dynamic.tsx extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.tsx',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.tsx',
            ruleName: '@blumintinc/blumint/require-dynamic-firebase-imports',
            extension: '.tsx',
            suggestedName: 'example.dynamic.tsx',
          },
        },
      ],
    },
    // File with .dynamic.ts extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.ts',
            standardName: 'example.ts',
          },
        },
      ],
    },
    // File with .dynamic.tsx extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.tsx',
            standardName: 'example.tsx',
          },
        },
      ],
    },
    // File with .dynamic.tsx extension but with disable directive for another rule
    {
      code: `// ednl no-console
console.log('Debugging');`,
      filename: 'example.dynamic.tsx',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.tsx',
            standardName: 'example.tsx',
          },
        },
      ],
    },
    // File without .dynamic.ts extension but with enforce-dynamic-imports eslint-disable-line directive
    {
      code: `import SomeModule from './SomeModule'; // eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
  ],
});
