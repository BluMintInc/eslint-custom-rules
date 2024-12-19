import { ruleTesterTs } from '../utils/ruleTester';
import { useCustomRouter } from '../rules/use-custom-router';

const ruleTester = ruleTesterTs;

ruleTester.run('use-custom-router', useCustomRouter, {
  valid: [
    {
      code: `import { useRouter } from 'src/hooks/useRouter';`,
    },
    {
      code: `import { useRouter as CustomRouter } from 'src/hooks/useRouter';`,
    },
    {
      code: `import { something } from 'next/router';`,
    },
  ],
  invalid: [
    {
      code: `import { useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';`,
      errors: [{ messageId: 'useCustomRouter' }],
    },
    {
      code: `import { useRouter as NextRouter } from 'next/router';`,
      output: `import { useRouter as NextRouter } from 'src/hooks/routing/useRouter';`,
      errors: [{ messageId: 'useCustomRouter' }],
    },
    {
      code: `import { useRouter, something } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';\nimport { something } from 'next/router';`,
      errors: [{ messageId: 'useCustomRouter' }],
    },
    {
      code: `import { something, useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';\nimport { something } from 'next/router';`,
      errors: [{ messageId: 'useCustomRouter' }],
    },
  ],
});
