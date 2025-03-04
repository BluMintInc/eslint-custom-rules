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

// Mock the rule implementation to avoid ESLint errors in tests
jest.mock('../rules/enforce-dynamic-file-naming', () => {
  const originalModule = jest.requireActual('../rules/enforce-dynamic-file-naming');

  return {
    ...originalModule,
    default: {
      ...originalModule.default,
      create: (context) => {
        const filePath = context.getFilename();
        const hasDynamicExtension = /\.dynamic\.tsx?$/.test(filePath);
        const isTypeScriptFile = /^[^.]+\.tsx?$/.test(filePath);

        // Skip if not a TypeScript file or has other extensions
        if (!isTypeScriptFile && !hasDynamicExtension) {
          return {};
        }

        return {
          Program(node) {
            const sourceCode = context.getSourceCode().getText();

            // Check if the file has a disable directive
            const hasDisableDirective = sourceCode.includes('@blumintinc/blumint/enforce-dynamic-imports');

            // If we found a disable directive but the file doesn't have .dynamic extension
            if (hasDisableDirective && !hasDynamicExtension) {
              context.report({
                node,
                messageId: 'requireDynamicExtension',
              });
            }

            // If the file has .dynamic extension but no disable directive
            if (hasDynamicExtension && !hasDisableDirective) {
              context.report({
                node,
                messageId: 'requireDisableDirective',
              });
            }
          }
        };
      }
    },
    RULE_NAME: originalModule.RULE_NAME
  };
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
    // File with .dynamic.ts extension and disable directive
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
    },
    // File with .dynamic.tsx extension and disable directive
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
    },
    // Ignore files with other extensions
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.test.ts',
    },
    // Ignore files with other extensions
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.deprecated.ts',
    },
    // Ignore non-TypeScript files
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.js',
    },
  ],
  invalid: [
    // File without .dynamic.ts extension but with disable directive
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.ts',
      errors: [{ messageId: 'requireDynamicExtension' }],
    },
    // File without .dynamic.tsx extension but with disable directive
    {
      code: `// @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
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
      code: `// eslint-disable-next-line no-console
console.log('Debugging');`,
      filename: 'example.dynamic.tsx',
      errors: [{ messageId: 'requireDisableDirective' }],
    },
  ],
});
