import { RuleTester } from '../utils/ruleTester';
import { avoidUtilsDirectory } from '../rules/avoid-utils-directory';

const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser',
});

ruleTester.run('avoid-utils-directory', avoidUtilsDirectory, {
  valid: [
    {
      code: 'const x = 1;',
      filename: 'src/util/helper.ts',
    },
    {
      code: 'const x = 1;',
      filename: 'src/components/util/helper.ts',
    },
    {
      code: 'const x = 1;',
      filename: 'src/myutils/helper.ts', // Should not flag when utils is part of another word
    },
    {
      code: 'const x = 1;',
      filename: 'node_modules/package/utils/helper.ts', // Should not flag node_modules
    },
  ],
  invalid: [
    {
      code: 'const x = 1;',
      filename: 'src/utils/helper.ts',
      errors: [{ messageId: 'avoidUtils' }],
    },
    {
      code: 'const x = 1;',
      filename: 'src/components/utils/helper.ts',
      errors: [{ messageId: 'avoidUtils' }],
    },
    {
      code: 'const x = 1;',
      filename: 'src/Utils/helper.ts', // Case insensitive check
      errors: [{ messageId: 'avoidUtils' }],
    },
  ],
});
