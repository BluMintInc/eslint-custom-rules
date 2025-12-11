import { ruleTesterTs } from '../utils/ruleTester';
import { useCustomRouter } from '../rules/use-custom-router';

const ruleTester = ruleTesterTs;
const errorData = (imports: string) =>
  ({
    messageId: 'useCustomRouter',
    data: { imports },
  } as const);

ruleTester.run('use-custom-router', useCustomRouter, {
  valid: [
    {
      code: `import { useRouter } from 'src/hooks/routing/useRouter';`,
    },
    {
      code: `import { useRouter as CustomRouter } from 'src/hooks/routing/useRouter';`,
    },
    {
      code: `import { something } from 'next/router';`,
    },
  ],
  invalid: [
    {
      code: `import { useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';`,
      errors: [errorData('useRouter')],
    },
    {
      code: `import { useRouter as NextRouter } from 'next/router';`,
      output: `import { useRouter as NextRouter } from 'src/hooks/routing/useRouter';`,
      errors: [errorData('NextRouter')],
    },
    {
      code: `import { useRouter, something } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';\nimport { something } from 'next/router';`,
      errors: [errorData('useRouter')],
    },
    {
      code: `import { something, useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';\nimport { something } from 'next/router';`,
      errors: [errorData('useRouter')],
    },
  ],
});
