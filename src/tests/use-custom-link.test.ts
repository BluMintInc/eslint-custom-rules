import { RuleTester } from '../utils/ruleTester';
import { useCustomLink } from '../rules/use-custom-link';

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('use-custom-link', useCustomLink, {
  valid: [
    {
      code: `import Link from 'src/components/Link';`,
    },
    {
      code: `import { CustomComponent } from 'src/components/Link';`,
    },
    {
      code: `import Link, { CustomComponent } from 'src/components/Link';`,
    },
  ],
  invalid: [
    {
      code: `import Link from 'next/link';`,
      errors: [{ messageId: 'useCustomLink' }],
      output: `import Link from 'src/components/Link';`,
    },
    {
      code: `import { default as NextLink } from 'next/link';`,
      errors: [{ messageId: 'useCustomLink' }],
      output: `import NextLink from 'src/components/Link';`,
    },
  ],
});
