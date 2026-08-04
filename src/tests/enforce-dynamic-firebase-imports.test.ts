import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import enforceFirebaseImports from '../rules/enforce-dynamic-firebase-imports';

const ruleTester = ruleTesterTs;

const errorMessage = (importPath: string) =>
  `Static import from firebaseCloud path "${importPath}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Replace it with an awaited dynamic import so the code only loads when invoked (e.g., \`const module = await import('${importPath}')\` or destructure the exports you need).`;

type ErrorWithData = Pick<
  TSESLint.TestCaseError<'noDynamicImport'>,
  'messageId' | 'data'
>;

const error = (importPath: string): ErrorWithData => ({
  messageId: 'noDynamicImport',
  data: { importPath },
});

describe('rule messages', () => {
  it('documents dynamic import guidance', () => {
    expect(enforceFirebaseImports.meta.messages?.noDynamicImport).toBe(
      errorMessage('{{importPath}}'),
    );
  });
});

ruleTester.run(
  'enforce-dynamic-firebase-imports',
  enforceFirebaseImports as any,
  {
    valid: [
      // Type-only import from firebaseCloud is allowed
      {
        code: `import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      },
      // Type-only import using inline type keyword on specifier
      {
        code: `import { type Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      },
      // Type-only with alias
      {
        code: `import { type Params as P } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      },
      // Regular imports from other directories are allowed
      {
        code: `import { someFunction } from '../../../../otherDirectory/messaging/someFile';`,
      },
      // Framework imports are not targeted by this rule
      {
        code: `import { initializeApp } from 'firebase/app';`,
      },
      // Dynamic imports from firebaseCloud are allowed
      {
        code: `const { setGroupChannel } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
      },
      // Path that contains "firebaseCloud" but not followed by a slash should not match
      {
        code: `import { helper } from '../../../../firebaseClouds/utils/helper';`,
      },
      // All specifiers are type-only
      {
        code: `import { type A, type B as BB } from '../../../../firebaseCloud/utils/types';`,
      },
      // A test file is never part of the client bundle, so the rule's
      // bundle-size rationale cannot apply to it. Jest also needs the static
      // binding: `jest.mock()` hoisting only intercepts a module the suite
      // imported statically, and the fixer's module-scope `await import(...)`
      // does not parse under a CommonJS test transform.
      {
        code: `import { startMatch } from '../firebaseCloud/tournament/startMatch';`,
        filename: 'src/hooks/useStartMatch.test.tsx',
      },
      {
        code: `import { create } from '../firebaseCloud/transaction/create';`,
        filename: 'src/hooks/useUserTransaction.spec.ts',
      },
      // Every test/spec extension the suffix accepts
      {
        code: `import { a } from '../../firebaseCloud/messaging/mod';`,
        filename: 'src/utils/mod.test.ts',
      },
      {
        code: `import { a } from '../../firebaseCloud/messaging/mod';`,
        filename: 'src/components/Chat.spec.tsx',
      },
      {
        code: `import { a } from '../../firebaseCloud/messaging/mod';`,
        filename: 'src/legacy/mod.test.js',
      },
      {
        code: `import { a } from '../../firebaseCloud/messaging/mod';`,
        filename: 'src/legacy/mod.spec.jsx',
      },
      {
        code: `import { a } from '../../firebaseCloud/messaging/mod';`,
        filename: 'src/utils/mod.test.mts',
      },
      // Multi-part suffixes still end in `.test.<ext>`
      {
        code: `import { startMatch } from '../firebaseCloud/tournament/startMatch';`,
        filename: 'src/hooks/useStartMatch.integration.test.ts',
      },
      // Jest convention directories hold test-only modules regardless of name
      {
        code: `import { startMatch } from '../../firebaseCloud/tournament/startMatch';`,
        filename: 'src/hooks/__tests__/useStartMatch.tsx',
      },
      {
        code: `import { startMatch } from '../../firebaseCloud/tournament/startMatch';`,
        filename: 'src/hooks/__mocks__/startMatch.ts',
      },
      // Windows separators must not defeat the exemption
      {
        code: `import { startMatch } from '../firebaseCloud/tournament/startMatch';`,
        filename: 'C:\\repo\\src\\hooks\\useStartMatch.test.tsx',
      },
      {
        code: `import { startMatch } from '../../firebaseCloud/tournament/startMatch';`,
        filename: 'C:\\repo\\src\\hooks\\__tests__\\useStartMatch.tsx',
      },
      // Absolute POSIX paths reach the same exemption
      {
        code: `import { startMatch } from '../firebaseCloud/tournament/startMatch';`,
        filename: '/home/runner/project/src/hooks/useStartMatch.test.tsx',
      },
      // Declaration files emit no runtime code, so nothing is bundled
      {
        code: `import { Params } from '../firebaseCloud/messaging/setGroupChannel';`,
        filename: 'src/types/firebaseCloud.d.ts',
      },
      // Every import shape is exempt inside a test file, not just named imports
      {
        code: `import helper from '../firebaseCloud/utils/helper';`,
        filename: 'src/utils/helper.test.ts',
      },
      {
        code: `import * as helper from '../firebaseCloud/utils/helper';`,
        filename: 'src/utils/helper.test.ts',
      },
      {
        code: `import '../firebaseCloud/utils/helper';`,
        filename: 'src/utils/helper.test.ts',
      },
      // Third-party sources stay exempt
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'node_modules/@blumint/pkg/dist/index.ts',
      },
    ],
    invalid: [
      // Single named import
      {
        code: `import { setChannelGroup } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
        errors: [error('../../../../firebaseCloud/messaging/setGroupChannel')],
        output: `const { setChannelGroup } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
      },
      // Multiple named imports
      {
        code: `import { a, b } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: `const { a, b } = await import('../../../../firebaseCloud/messaging/mod');`,
      },
      // Named import with alias
      {
        code: `import { a as A } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: `const { a: A } = await import('../../../../firebaseCloud/messaging/mod');`,
      },
      // Multiple named with alias
      {
        code: `import { a as A, b, c as C } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: `const { a: A, b, c: C } = await import('../../../../firebaseCloud/messaging/mod');`,
      },
      // Default import only
      {
        code: `import helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `const { default: helper } = await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Default + named
      {
        code: `import helper, { a, b as B } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `const { default: helper, a, b: B } = await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Namespace import only
      {
        code: `import * as helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `const helper = await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Default + namespace import
      {
        code: `import def, * as helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `const helper = await import('../../../../firebaseCloud/utils/helper'); const def = helper.default;`,
      },
      // Side-effect import
      {
        code: `import '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Mixed type and named (preserve type-only import)
      {
        code: `import { type Params, setChannelGroup as set } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
        errors: [error('../../../../firebaseCloud/messaging/setGroupChannel')],
        output: `import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel'; const { setChannelGroup: set } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
      },
      // Mixed type (alias) and named (alias)
      {
        code: `import { type X as TX, a as A, b } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: `import type { X as TX } from '../../../../firebaseCloud/messaging/mod'; const { a: A, b } = await import('../../../../firebaseCloud/messaging/mod');`,
      },
      // Mixed type-only and default
      {
        code: `import def, { type T } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `import type { T } from '../../../../firebaseCloud/utils/helper'; const { default: def } = await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Mixed type-only, default, and named
      {
        code: `import def, { type T, a as A } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: `import type { T } from '../../../../firebaseCloud/utils/helper'; const { default: def, a: A } = await import('../../../../firebaseCloud/utils/helper');`,
      },
      // Relative path variant to firebaseCloud
      {
        code: `import { helper } from '../../../../../src/firebaseCloud/utils/helper';`,
        errors: [error('../../../../../src/firebaseCloud/utils/helper')],
        output: `const { helper } = await import('../../../../../src/firebaseCloud/utils/helper');`,
      },
      // Multiline static imports should be collapsed appropriately
      {
        code: `import {\n  a,\n  b as B\n} from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: `const { a, b: B } = await import('../../../../firebaseCloud/messaging/mod');`,
      },
      // Ensure no change for specifier order (including aliasing)
      {
        code: `import { z as Z, a, m as M } from '../../../../firebaseCloud/messaging/alpha';`,
        errors: [error('../../../../firebaseCloud/messaging/alpha')],
        output: `const { z: Z, a, m: M } = await import('../../../../firebaseCloud/messaging/alpha');`,
      },
      // Namespace import from src path
      {
        code: `import * as cloud from 'src/firebaseCloud/messaging/api';`,
        errors: [error('src/firebaseCloud/messaging/api')],
        output: `const cloud = await import('src/firebaseCloud/messaging/api');`,
      },
      // Default + namespace from src path
      {
        code: `import def, * as cloud from 'src/firebaseCloud/messaging/api';`,
        errors: [error('src/firebaseCloud/messaging/api')],
        output: `const cloud = await import('src/firebaseCloud/messaging/api'); const def = cloud.default;`,
      },
      // A production module beside an exempt test file still reports, so the
      // test-file carve-out cannot silently widen
      {
        code: `import { create } from '../firebaseCloud/transaction/create';`,
        filename: 'src/hooks/useUserTransaction.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `const { create } = await import('../firebaseCloud/transaction/create');`,
      },
      // Production modules whose names merely contain "test"/"spec"
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/hooks/latest.tsx',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/components/contest.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/utils/testHelpers.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/testing/setup.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      // The suffix is anchored: a bare `spec.ts`/`test.ts` basename is a
      // production module, not a suite
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/spec.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      // `.test.` mid-name is not the file's suffix
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/hooks/useStartMatch.test.helper.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      // Directories that merely start with the Jest convention names
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/__tests__helpers/render.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/mocks/startMatch.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      // `.d.tsx` is a component, not a declaration file
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/components/Chat.d.tsx',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
      // A directory named `firebaseCloud.d.ts`-like does not exempt its members
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/types/firebaseCloud.d.ts/index.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: `const { a } = await import('../firebaseCloud/messaging/mod');`,
      },
    ],
  },
);
