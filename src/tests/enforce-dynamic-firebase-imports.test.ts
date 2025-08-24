import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirebaseImports } from '../rules/enforce-dynamic-firebase-imports';

const ruleTester = ruleTesterTs;

ruleTester.run('enforce-dynamic-firebase-imports', enforceFirebaseImports as any, {
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
  ],
  invalid: [
    // Single named import
    {
      code: `import { setChannelGroup } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { setChannelGroup } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
    },
    // Multiple named imports
    {
      code: `import { a, b } from '../../../../firebaseCloud/messaging/mod';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { a, b } = await import('../../../../firebaseCloud/messaging/mod');`,
    },
    // Named import with alias
    {
      code: `import { a as A } from '../../../../firebaseCloud/messaging/mod';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { a: A } = await import('../../../../firebaseCloud/messaging/mod');`,
    },
    // Multiple named with alias
    {
      code: `import { a as A, b, c as C } from '../../../../firebaseCloud/messaging/mod';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { a: A, b, c: C } = await import('../../../../firebaseCloud/messaging/mod');`,
    },
    // Default import only
    {
      code: `import helper from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { default: helper } = await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Default + named
    {
      code: `import helper, { a, b as B } from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { default: helper, a, b: B } = await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Namespace import only
    {
      code: `import * as helper from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const helper = await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Default + namespace import
    {
      code: `import def, * as helper from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const helper = await import('../../../../firebaseCloud/utils/helper'); const def = helper.default;`,
    },
    // Side-effect import
    {
      code: `import '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Mixed type and named (preserve type-only import)
    {
      code: `import { type Params, setChannelGroup as set } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output:
        `import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel'; const { setChannelGroup: set } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
    },
    // Mixed type (alias) and named (alias)
    {
      code: `import { type X as TX, a as A, b } from '../../../../firebaseCloud/messaging/mod';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output:
        `import type { X as TX } from '../../../../firebaseCloud/messaging/mod'; const { a: A, b } = await import('../../../../firebaseCloud/messaging/mod');`,
    },
    // Mixed type-only and default
    {
      code: `import def, { type T } from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output:
        `import type { T } from '../../../../firebaseCloud/utils/helper'; const { default: def } = await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Mixed type-only, default, and named
    {
      code: `import def, { type T, a as A } from '../../../../firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output:
        `import type { T } from '../../../../firebaseCloud/utils/helper'; const { default: def, a: A } = await import('../../../../firebaseCloud/utils/helper');`,
    },
    // Relative path variant to firebaseCloud
    {
      code: `import { helper } from '../../../../../src/firebaseCloud/utils/helper';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { helper } = await import('../../../../../src/firebaseCloud/utils/helper');`,
    },
    // Multiline static imports should be collapsed appropriately
    {
      code: `import {\n  a,\n  b as B\n} from '../../../../firebaseCloud/messaging/mod';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { a, b: B } = await import('../../../../firebaseCloud/messaging/mod');`,
    },
    // Ensure no change for specifier order (including aliasing)
    {
      code: `import { z as Z, a, m as M } from '../../../../firebaseCloud/messaging/alpha';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const { z: Z, a, m: M } = await import('../../../../firebaseCloud/messaging/alpha');`,
    },
    // Namespace import from src path
    {
      code: `import * as cloud from 'src/firebaseCloud/messaging/api';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const cloud = await import('src/firebaseCloud/messaging/api');`,
    },
    // Default + namespace from src path
    {
      code: `import def, * as cloud from 'src/firebaseCloud/messaging/api';`,
      errors: [{ messageId: 'noDynamicImport' }],
      output: `const cloud = await import('src/firebaseCloud/messaging/api'); const def = cloud.default;`,
    },
  ],
});
