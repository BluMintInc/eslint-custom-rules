import { ruleTesterTs } from '../utils/ruleTester';
import { useCustomMemo } from '../rules/use-custom-memo';

ruleTesterTs.run('use-custom-memo', useCustomMemo, {
  valid: [
    {
      code: `import { memo } from 'src/util/memo';`,
    },
    {
      code: `import { memo as CustomMemo } from 'src/util/memo';`,
    },
    {
      code: `import { something } from 'react';`,
    },
  ],
  invalid: [
    {
      code: `import { memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { memo as ReactMemo } from 'react';`,
      output: `import { memo as ReactMemo } from 'src/util/memo';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { memo, useState } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
    {
      code: `import { useState, memo } from 'react';`,
      output: `import { memo } from 'src/util/memo';\nimport { useState } from 'react';`,
      errors: [{ messageId: 'useCustomMemo' }],
    },
  ],
});
