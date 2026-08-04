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
    // The wrapper module the rule points at cannot import itself: rewriting it
    // would make it evaluate circularly and export `undefined` (#1672).
    {
      code: `import { useRouter as originalUseRouter } from 'next/router';\nexport const useRouter = () => originalUseRouter();`,
      filename: 'src/hooks/routing/useRouter.tsx',
    },
    {
      code: `import { useRouter as originalUseRouter } from 'next/router';\nexport const useRouter = () => originalUseRouter();`,
      filename: '/repo/src/hooks/routing/useRouter.ts',
    },
    // The wrapper is exempt under every source extension it can ship as (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      filename: 'src/hooks/routing/useRouter.js',
    },
    {
      code: `import { useRouter } from 'next/router';`,
      filename: '/repo/src/hooks/routing/useRouter.jsx',
    },
    // An extensionless path still identifies the wrapper (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      filename: '/repo/src/hooks/routing/useRouter',
    },
    // Windows separators name the same module as POSIX ones (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      filename: 'C:\\repo\\src\\hooks\\routing\\useRouter.tsx',
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
    // A consumer of the wrapper is reported however the wrapper's own module is
    // exempted (#1672).
    {
      code: `import { useRouter as originalUseRouter } from 'next/router';\nexport const useRouter = () => originalUseRouter();`,
      output: `import { useRouter as originalUseRouter } from 'src/hooks/routing/useRouter';\nexport const useRouter = () => originalUseRouter();`,
      filename: 'src/components/Foo.tsx',
      errors: [errorData('originalUseRouter')],
    },
    // `notsrc` is a different segment from `src`, so the path names a different
    // module and stays reportable (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';`,
      filename: 'foo/notsrc/hooks/routing/useRouter.ts',
      errors: [errorData('useRouter')],
    },
    // A sibling of the wrapper is not the wrapper: only the final extension is
    // stripped, so `useRouter.helpers` never reduces to `useRouter` (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';`,
      filename: 'src/hooks/routing/useRouter.helpers.ts',
      errors: [errorData('useRouter')],
    },
    // A longer basename sharing the prefix is a different module (#1672).
    {
      code: `import { useRouter } from 'next/router';`,
      output: `import { useRouter } from 'src/hooks/routing/useRouter';`,
      filename: 'src/hooks/routing/useRouterState.ts',
      errors: [errorData('useRouter')],
    },
  ],
});
