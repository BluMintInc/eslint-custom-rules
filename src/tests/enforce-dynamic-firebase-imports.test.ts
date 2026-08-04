import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import enforceFirebaseImports from '../rules/enforce-dynamic-firebase-imports';

const ruleTester = ruleTesterTs;

const errorMessage = (importPath: string) =>
  `Static import from firebaseCloud path "${importPath}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Load it at the call site instead, inside an async function body (e.g., \`const { export } = await import('${importPath}')\`). Keep it out of module scope: a top-level \`await import(...)\` defers nothing and does not parse once the module is compiled to CommonJS.`;

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
      // Every fixture in this first block is a bare import with no reader, so
      // the only place the rewrite could land is module scope — where it would
      // neither defer the load nor parse under a CommonJS transform. They
      // assert the report only (`output: null`); the shape-by-shape fix
      // assertions live in the relocation block at the end of this array.

      // Single named import
      {
        code: `import { setChannelGroup } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
        errors: [error('../../../../firebaseCloud/messaging/setGroupChannel')],
        output: null,
      },
      // Multiple named imports
      {
        code: `import { a, b } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Named import with alias
      {
        code: `import { a as A } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Multiple named with alias
      {
        code: `import { a as A, b, c as C } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Default import only
      {
        code: `import helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Default + named
      {
        code: `import helper, { a, b as B } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Namespace import only
      {
        code: `import * as helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Default + namespace import
      {
        code: `import def, * as helper from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Side-effect import
      {
        code: `import '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Mixed type and named (preserve type-only import)
      {
        code: `import { type Params, setChannelGroup as set } from '../../../../firebaseCloud/messaging/setGroupChannel';`,
        errors: [error('../../../../firebaseCloud/messaging/setGroupChannel')],
        output: null,
      },
      // Mixed type (alias) and named (alias)
      {
        code: `import { type X as TX, a as A, b } from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Mixed type-only and default
      {
        code: `import def, { type T } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Mixed type-only, default, and named
      {
        code: `import def, { type T, a as A } from '../../../../firebaseCloud/utils/helper';`,
        errors: [error('../../../../firebaseCloud/utils/helper')],
        output: null,
      },
      // Relative path variant to firebaseCloud
      {
        code: `import { helper } from '../../../../../src/firebaseCloud/utils/helper';`,
        errors: [error('../../../../../src/firebaseCloud/utils/helper')],
        output: null,
      },
      // Multiline static imports should be collapsed appropriately
      {
        code: `import {\n  a,\n  b as B\n} from '../../../../firebaseCloud/messaging/mod';`,
        errors: [error('../../../../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Ensure no change for specifier order (including aliasing)
      {
        code: `import { z as Z, a, m as M } from '../../../../firebaseCloud/messaging/alpha';`,
        errors: [error('../../../../firebaseCloud/messaging/alpha')],
        output: null,
      },
      // Namespace import from src path
      {
        code: `import * as cloud from 'src/firebaseCloud/messaging/api';`,
        errors: [error('src/firebaseCloud/messaging/api')],
        output: null,
      },
      // Default + namespace from src path
      {
        code: `import def, * as cloud from 'src/firebaseCloud/messaging/api';`,
        errors: [error('src/firebaseCloud/messaging/api')],
        output: null,
      },
      // A production module beside an exempt test file still reports, so the
      // test-file carve-out cannot silently widen
      {
        code: `import { create } from '../firebaseCloud/transaction/create';`,
        filename: 'src/hooks/useUserTransaction.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // Production modules whose names merely contain "test"/"spec"
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/hooks/latest.tsx',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/components/contest.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/utils/testHelpers.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/testing/setup.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      // The suffix is anchored: a bare `spec.ts`/`test.ts` basename is a
      // production module, not a suite
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/spec.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      // `.test.` mid-name is not the file's suffix
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/hooks/useStartMatch.test.helper.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      // Directories that merely start with the Jest convention names
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/__tests__helpers/render.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/mocks/startMatch.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      // `.d.tsx` is a component, not a declaration file
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/components/Chat.d.tsx',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },
      // A directory named `firebaseCloud.d.ts`-like does not exempt its members
      {
        code: `import { a } from '../firebaseCloud/messaging/mod';`,
        filename: 'src/types/firebaseCloud.d.ts/index.ts',
        errors: [error('../firebaseCloud/messaging/mod')],
        output: null,
      },

      // ---------------------------------------------------------------------
      // #1716 — the fixer must never splice a module-scope `await import(...)`
      // ---------------------------------------------------------------------

      // The reported site: the binding is only read from a synchronous
      // function, so there is nowhere to put an `await`.
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const useUserTransaction = () => {
  return create;
};`,
        filename: 'src/hooks/useUserTransaction.ts',
        errors: [{ messageId: 'noDynamicImport' }],
        output: null, // fixer declines rather than emitting top-level await
      },
      // Three call sites spread across two async callbacks — the agora shape.
      {
        code: `import { create as createTransaction } from '../firebaseCloud/transaction/create';

export const useUserTransaction = () => {
  const transact = async (params: unknown) => {
    return await createTransaction(params);
  };
  const offchainTransfer = async (params: { op: string }) => {
    if (params.op === 'mint') {
      return await createTransaction(params);
    }
    return await createTransaction(params);
  };
  return { transact, offchainTransfer };
};`,
        filename: 'src/hooks/useUserTransaction.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // Default import consumed at module scope
      {
        code: `import helper from '../firebaseCloud/utils/helper';

export const config = helper.config;`,
        filename: 'src/utils/config.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // Namespace import consumed from a synchronous function
      {
        code: `import * as helper from '../firebaseCloud/utils/helper';

export const run = () => {
  return helper.run();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // Mixed default + named consumed at module scope
      {
        code: `import def, { a } from '../firebaseCloud/utils/helper';

export const pair = [def, a];`,
        filename: 'src/utils/pair.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // A side-effect import has no binding to relocate
      {
        code: `import '../firebaseCloud/utils/helper';

export const noop = () => undefined;`,
        filename: 'src/utils/noop.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // An unreferenced binding gives the fixer no call site to move to
      {
        code: `import { unused } from '../firebaseCloud/utils/helper';

export const noop = () => undefined;`,
        filename: 'src/utils/noop.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // Re-exporting the binding pins it to module scope
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export { a };`,
        filename: 'src/utils/reexport.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // An expression-bodied async arrow has no block to hoist into
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // A type annotation on the async function's signature is evaluated
      // outside the body, so the binding cannot move into it
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async (fn: typeof a = a) => {
  return fn();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },

      // ---------------------------------------------------------------------
      // #1716 — the narrowing is a narrowing: these still receive a real fix,
      // landing the dynamic import inside an existing async function body.
      // ---------------------------------------------------------------------

      // Named import consumed by exactly one async arrow
      {
        code: `import { setGroupChannel } from '../firebaseCloud/messaging/setGroupChannel';

export const handler = async () => {
  return setGroupChannel();
};`,
        filename: 'src/hooks/useSetGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/setGroupChannel')],
        output: `
export const handler = async () => {
  const { setGroupChannel } = await import('../firebaseCloud/messaging/setGroupChannel');
  return setGroupChannel();
};`,
      },
      // Aliased named import
      {
        code: `import { create as createTransaction } from '../firebaseCloud/transaction/create';

export const transact = async (params: unknown) => {
  return await createTransaction(params);
};`,
        filename: 'src/hooks/useTransact.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const transact = async (params: unknown) => {
  const { create: createTransaction } = await import('../firebaseCloud/transaction/create');
  return await createTransaction(params);
};`,
      },
      // Three call sites inside ONE async function are still expressible
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const transact = async (op: string) => {
  if (op === 'mint') {
    return await create(op);
  }
  if (op === 'burn') {
    return await create(op);
  }
  return await create(op);
};`,
        filename: 'src/hooks/useTransact.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const transact = async (op: string) => {
  const { create } = await import('../firebaseCloud/transaction/create');
  if (op === 'mint') {
    return await create(op);
  }
  if (op === 'burn') {
    return await create(op);
  }
  return await create(op);
};`,
      },
      // Default import
      {
        code: `import helper from '../firebaseCloud/utils/helper';

export const run = async () => {
  return helper();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { default: helper } = await import('../firebaseCloud/utils/helper');
  return helper();
};`,
      },
      // Namespace import
      {
        code: `import * as helper from '../firebaseCloud/utils/helper';

export const run = async () => {
  return helper.run();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const helper = await import('../firebaseCloud/utils/helper');
  return helper.run();
};`,
      },
      // Default + named
      {
        code: `import helper, { a, b as B } from '../firebaseCloud/utils/helper';

export const run = async () => {
  return helper(a, B);
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { default: helper, a, b: B } = await import('../firebaseCloud/utils/helper');
  return helper(a, B);
};`,
      },
      // Default + namespace emits two statements
      {
        code: `import def, * as helper from '../firebaseCloud/utils/helper';

export const run = async () => {
  return def(helper);
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const helper = await import('../firebaseCloud/utils/helper');
  const def = helper.default;
  return def(helper);
};`,
      },
      // Type-only specifiers stay at module scope; only the value moves
      {
        code: `import { type Params, setGroupChannel } from '../firebaseCloud/messaging/setGroupChannel';

export const handler = async (params: Params) => {
  return setGroupChannel(params);
};`,
        filename: 'src/hooks/useSetGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/setGroupChannel')],
        output: `import type { Params } from '../firebaseCloud/messaging/setGroupChannel';

export const handler = async (params: Params) => {
  const { setGroupChannel } = await import('../firebaseCloud/messaging/setGroupChannel');
  return setGroupChannel(params);
};`,
      },
      // An async class method is an async body too
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export class Transactor {
  public async run() {
    return create();
  }
}`,
        filename: 'src/utils/Transactor.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export class Transactor {
  public async run() {
    const { create } = await import('../firebaseCloud/transaction/create');
    return create();
  }
}`,
      },
      // A reference captured by a synchronous callback nested inside the async
      // function still resolves once the declaration heads that body
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const run = async (items: string[]) => {
  return items.map((item) => create(item));
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const run = async (items: string[]) => {
  const { create } = await import('../firebaseCloud/transaction/create');
  return items.map((item) => create(item));
};`,
      },
      // A single-line async body keeps its shape
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => { return a(); };`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => { const { a } = await import('../firebaseCloud/utils/helper'); return a(); };`,
      },
      // A comment trailing the import outlives it, and does not inherit the
      // whitespace that separated it from the statement now removed
      {
        code: `import { a } from '../firebaseCloud/utils/helper'; // needed by run
export const run = async () => {
  return a();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `// needed by run
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a();
};`,
      },
      // The import sharing its line with the target function does not let the
      // removal swallow the function
      {
        code: `import { a } from '../firebaseCloud/utils/helper'; export const run = async () => { return a(); };`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `export const run = async () => { const { a } = await import('../firebaseCloud/utils/helper'); return a(); };`,
      },
      // A directive prologue keeps its position: a declaration in front of
      // `'use server'` would demote it to a discarded string expression
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const act = async (input: string) => {
  'use server';
  return create(input);
};`,
        filename: 'src/actions/act.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const act = async (input: string) => {
  'use server';
  const { create } = await import('../firebaseCloud/transaction/create');
  return create(input);
};`,
      },
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => { 'use server'; return a(); };`,
        filename: 'src/actions/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => { 'use server'; const { a } = await import('../firebaseCloud/utils/helper'); return a(); };`,
      },
      // An async generator body accepts an await just as an async function does
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export async function* run() {
  yield a();
}`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export async function* run() {
  const { a } = await import('../firebaseCloud/utils/helper');
  yield a();
}`,
      },
    ],
  },
);
