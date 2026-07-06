import { ruleTesterTs } from '../utils/ruleTester';
import { avoidUtilsDirectory } from '../rules/avoid-utils-directory';

const formatError = (filePath: string) => ({
  messageId: 'avoidUtils' as const,
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
    {
      code: 'const x = 1;',
      // Issue #1270: a Windows backslash path NOT in a utils dir stays exempt.
      filename: 'C:\\repo\\src\\util\\helper.ts',
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
    {
      code: 'const x = 1;',
      // Issue #1270: a Windows backslash utils path must be flagged. Before
      // separator normalization the forward-slash regex never matched, so the
      // rule silently no-op'd on Windows. The reported path is normalized.
      filename: 'C:\\repo\\src\\utils\\helper.ts',
      errors: [formatError('C:/repo/src/utils/helper.ts')],
    },
  ],
});
