import { ruleTesterTs } from '../utils/ruleTester';
import { avoidUtilsDirectory } from '../rules/avoid-utils-directory';

type AvoidUtilsTestError = {
  message: string;
  messageId: 'avoidUtils';
  data: { path: string };
};

const formatMessage = (filePath: string) =>
  `Path "${filePath}" lives under a "utils/" directory. Generic "utils" folders become grab bags where unrelated helpers accumulate, which makes imports unpredictable and hides ownership. Move this file into a focused "util/" folder (e.g., "util/date" or "util/string") so callers know where to find it and understand its responsibility.`;

const formatError = (filePath: string): AvoidUtilsTestError => ({
  message: formatMessage(filePath),
  messageId: 'avoidUtils',
  data: { path: filePath },
});

ruleTesterTs.run('avoid-utils-directory', avoidUtilsDirectory, {
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
      errors: [formatError('src/utils/helper.ts')],
    },
    {
      code: 'const x = 1;',
      filename: 'src/components/utils/helper.ts',
      errors: [formatError('src/components/utils/helper.ts')],
    },
    {
      code: 'const x = 1;',
      filename: 'src/Utils/helper.ts', // Case insensitive check
      errors: [formatError('src/Utils/helper.ts')],
    },
  ],
});
