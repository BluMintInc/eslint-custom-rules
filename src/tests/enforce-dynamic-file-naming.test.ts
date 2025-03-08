import { ESLintUtils } from '@typescript-eslint/utils';
import rule, { RULE_NAME } from '../rules/enforce-dynamic-file-naming';

// Create a custom rule tester that doesn't require the actual enforce-dynamic-imports rule
const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.ts',
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
      errors: [{ messageId: 'requireDynamicExtension' }],
    },
    // File without .dynamic.tsx extension but with enforce-dynamic-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.tsx',
      errors: [{ messageId: 'requireDynamicExtension' }],
    },
    // File without .dynamic.ts extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.ts',
      errors: [{ messageId: 'requireDynamicExtension' }],
    },
    // File without .dynamic.tsx extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// ednl @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.tsx',
      errors: [{ messageId: 'requireDynamicExtension' }],
    },
    // File with .dynamic.ts extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
      errors: [{ messageId: 'requireDisableDirective' }],
    },
    // File with .dynamic.tsx extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
      errors: [{ messageId: 'requireDisableDirective' }],
    },
    // File with .dynamic.tsx extension but with disable directive for another rule
    {
      code: `// ednl no-console
console.log('Debugging');`,
      filename: 'example.dynamic.tsx',
      errors: [{ messageId: 'requireDisableDirective' }],
    },
  ],
});
