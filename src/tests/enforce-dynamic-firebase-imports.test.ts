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
      // The relocated declaration is a fixed point wherever it lands: a
      // declaration that heads a nested statement list rather than the function
      // body is still a dynamic import, and reports nothing (#2103)
      {
        code: `export const submit = async (id: string) => {
  const trimmed = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  return await create(trimmed);
};`,
        filename: 'src/hooks/useSubmit.ts',
      },
      {
        code: `export const submit = async (id: string) => {
  try {
    const { create } = await import('../firebaseCloud/transaction/create');
    return await create(id);
  } catch {
    return undefined;
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
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
  const { setGroupChannel } = await import(
    '../firebaseCloud/messaging/setGroupChannel'
  );
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
  const { create: createTransaction } = await import(
    '../firebaseCloud/transaction/create'
  );
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
  const {
    default: helper,
    a,
    b: B,
  } = await import('../firebaseCloud/utils/helper');
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
  const { setGroupChannel } = await import(
    '../firebaseCloud/messaging/setGroupChannel'
  );
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

      // ---------------------------------------------------------------------
      // A concise body is a consumer too: the arrow gains a block so the
      // declaration has somewhere to land, rather than losing both the fix and
      // the suggestion the rule advertises.
      // ---------------------------------------------------------------------

      // The reported shape: an expression-bodied async arrow
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a();
};`,
      },
      // The parentheses around a concise body's object literal exist only to
      // keep its leading brace from parsing as a block. `return` already
      // supplies an expression position, so they are dead there and a formatter
      // strips them (#2057)
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => ({ value: a() });`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return { value: a() };
};`,
      },
      // A multi-line body moves one nesting level deeper on the way into the
      // block, so its continuation lines are shifted by that delta rather than
      // landing at the column they were written at (#2057)
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => ({
  value: a(),
});`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return {
    value: a(),
  };
};`,
      },
      // An `as const` assertion wrapping the object literal rides along, and the
      // parentheses around it are dead in return position just the same
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => ({ value: a() } as const);`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return { value: a() } as const;
};`,
      },
      // Multiple named specifiers destructure into one declaration
      {
        code: `import { a, b as B } from '../firebaseCloud/utils/helper';

export const run = async () => a(B);`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a, b: B } = await import('../firebaseCloud/utils/helper');
  return a(B);
};`,
      },
      // Default + namespace emits two statements ahead of the return
      {
        code: `import def, * as helper from '../firebaseCloud/utils/helper';

export const run = async () => def(helper);`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const helper = await import('../firebaseCloud/utils/helper');
  const def = helper.default;
  return def(helper);
};`,
      },
      // A type-only specifier alongside a value one stays at module scope
      {
        code: `import { type Params, setGroupChannel } from '../firebaseCloud/messaging/setGroupChannel';

export const handler = async (params: Params) => setGroupChannel(params);`,
        filename: 'src/hooks/useSetGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/setGroupChannel')],
        output: `import type { Params } from '../firebaseCloud/messaging/setGroupChannel';

export const handler = async (params: Params) => {
  const { setGroupChannel } = await import(
    '../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel(params);
};`,
      },
      // The default specifier alone
      {
        code: `import helper from '../firebaseCloud/utils/helper';

export const run = async () => helper();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { default: helper } = await import('../firebaseCloud/utils/helper');
  return helper();
};`,
      },
      // A namespace specifier alone
      {
        code: `import * as helper from '../firebaseCloud/utils/helper';

export const run = async () => helper.run();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const helper = await import('../firebaseCloud/utils/helper');
  return helper.run();
};`,
      },
      // The new block sits at the arrow's own indentation, not the file's
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const outer = () => {
  const inner = async () => a();
  return inner;
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const outer = () => {
  const inner = async () => {
    const { a } = await import('../firebaseCloud/utils/helper');
    return a();
  };
  return inner;
};`,
      },
      // A class property holding an async arrow is a call site too
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export class Runner {
  public run = async () => a();
}`,
        filename: 'src/utils/Runner.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export class Runner {
  public run = async () => {
    const { a } = await import('../firebaseCloud/utils/helper');
    return a();
  };
}`,
      },
      // A comment between `=>` and the expression belongs to neither node, so
      // only splicing the source text preserves it
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => /* lazy */ a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return /* lazy */ a();
};`,
      },
      // A multi-line template literal is spliced, never re-indented: its own
      // line breaks and leading spaces are part of the string's value
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => \`line one
  line two \${a()}\`;`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return \`line one
  line two \${a()}\`;
};`,
      },
      // An arrow in a parameter default owns an earlier `=>`, which must not be
      // mistaken for the consuming arrow's own
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async (cb = (x: number) => x) => a(cb);`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async (cb = (x: number) => x) => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a(cb);
};`,
      },
      // A body starting on the following line collapses onto the return
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () =>
  a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a();
};`,
      },
      // An awaited body keeps its `await`
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => await a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return await a();
};`,
      },
      // A return type annotation stays on the signature
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async (): Promise<number> => a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async (): Promise<number> => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a();
};`,
      },
      // A synchronous callback inside the concise body resolves against the
      // declaration that now heads the block
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async (items: string[]) => items.map((item) => a(item));`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async (items: string[]) => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return items.map((item) => a(item));
};`,
      },
      // The import sharing the arrow's line does not let the removal swallow it
      {
        code: `import { a } from '../firebaseCloud/utils/helper'; export const run = async () => a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  return a();
};`,
      },
      // An enclosing async block is the smaller edit, so it keeps the
      // declaration even when the reference sits in a concise arrow
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async () => {
  const inner = async () => a();
  return inner();
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: `
export const run = async () => {
  const { a } = await import('../firebaseCloud/utils/helper');
  const inner = async () => a();
  return inner();
};`,
      },

      // ---------------------------------------------------------------------
      // #2044 — the emitted statement is measured against the line it lands
      // on. Its specifier list and module path both come from the source, so
      // the one-line form has no width bound; wrapping unconditionally is the
      // mirror failure, since Prettier collapses a short expanded pattern,
      // argument list or assignment straight back onto one line.
      // ---------------------------------------------------------------------

      // Exactly 80 columns once emitted: the inline form is what Prettier
      // prints, and a wrapped one would be collapsed back.
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/message';

export const handler = async () => {
  return sendGroupChannelMsg();
};`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        errors: [error('../firebaseCloud/chat/message')],
        output: `
export const handler = async () => {
  const { sendGroupChannelMsg } = await import('../firebaseCloud/chat/message');
  return sendGroupChannelMsg();
};`,
      },
      // One column wider: the call's argument breaks open, which is the first
      // break point Prettier takes.
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/messages';

export const handler = async () => {
  return sendGroupChannelMsg();
};`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        errors: [error('../firebaseCloud/chat/messages')],
        output: `
export const handler = async () => {
  const { sendGroupChannelMsg } = await import(
    '../firebaseCloud/chat/messages'
  );
  return sendGroupChannelMsg();
};`,
      },
      // The same import at a deeper nesting level: the measurement is against
      // the emitted line's own column, so the statement that fits at one step
      // in wraps at three.
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/message';

export const outer = () => {
  const middle = () => {
    const inner = async () => {
      return sendGroupChannelMsg();
    };
    return inner;
  };
  return middle;
};`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        errors: [error('../firebaseCloud/chat/message')],
        output: `
export const outer = () => {
  const middle = () => {
    const inner = async () => {
      const { sendGroupChannelMsg } = await import(
        '../firebaseCloud/chat/message'
      );
      return sendGroupChannelMsg();
    };
    return inner;
  };
  return middle;
};`,
      },
      // The issue's unboundedness demonstration: three specifiers whose joined
      // length has no bound. The pattern still fits on its own line, so the
      // break lands after the `=` rather than expanding the pattern.
      {
        code: `import { createGroupChannel, deleteGroupChannel, updateGroupChannel } from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  await createGroupChannel();
  await deleteGroupChannel();
  await updateGroupChannel();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  const { createGroupChannel, deleteGroupChannel, updateGroupChannel } =
    await import('../firebaseCloud/messaging/groupChannel');
  await createGroupChannel();
  await deleteGroupChannel();
  await updateGroupChannel();
};`,
      },
      // The multi-line spelling Prettier writes is the only shape where a
      // comment can sit INSIDE the ImportDeclaration the fixer removes. Its
      // subject survives the rewrite — every value specifier reappears in the
      // emitted pattern — so the comment is carried ahead of the relocated
      // declaration rather than consumed with the node it annotated (#2056).
      {
        code: `import {
  createGroupChannel,
  // the channel is deleted by the caller
  deleteGroupChannel,
  updateGroupChannel,
} from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  await createGroupChannel();
  await deleteGroupChannel();
  await updateGroupChannel();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  // the channel is deleted by the caller
  const { createGroupChannel, deleteGroupChannel, updateGroupChannel } =
    await import('../firebaseCloud/messaging/groupChannel');
  await createGroupChannel();
  await deleteGroupChannel();
  await updateGroupChannel();
};`,
      },
      // A block comment inside the import is carried the same way. It shares a
      // line with the specifier it annotates in the pre-image, but the emitted
      // declaration is authored as one unit, so the run breaks ahead of it.
      {
        code: `import {
  /* keep in sync with the callable */ createGroupChannel,
  deleteGroupChannel,
} from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  await createGroupChannel();
  await deleteGroupChannel();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  /* keep in sync with the callable */
  const { createGroupChannel, deleteGroupChannel } = await import(
    '../firebaseCloud/messaging/groupChannel'
  );
  await createGroupChannel();
  await deleteGroupChannel();
};`,
      },
      // More than two properties with one of them renamed is Prettier's
      // "complex destructuring": the pattern expands whatever the alternatives
      // would measure.
      {
        code: `import { createChannel, deleteChannel as removeChannel, updateChannel } from '../firebaseCloud/messaging/channel';

export const handler = async () => {
  await createChannel();
  await removeChannel();
  await updateChannel();
};`,
        filename: 'src/hooks/useChannel.ts',
        errors: [error('../firebaseCloud/messaging/channel')],
        output: `
export const handler = async () => {
  const {
    createChannel,
    deleteChannel: removeChannel,
    updateChannel,
  } = await import('../firebaseCloud/messaging/channel');
  await createChannel();
  await removeChannel();
  await updateChannel();
};`,
      },
      // A renamed property too wide for its own line inside an expanded
      // pattern breaks after its `:`, the last break point the pattern has.
      {
        code: `import { createGroupChannelWithMembersAndMetadata as createGroupChannelWithMembersAndMetadataNow } from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  return createGroupChannelWithMembersAndMetadataNow();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  const {
    createGroupChannelWithMembersAndMetadata:
      createGroupChannelWithMembersAndMetadataNow,
  } = await import('../firebaseCloud/messaging/groupChannel');
  return createGroupChannelWithMembersAndMetadataNow();
};`,
      },
      // The namespace branch is measured too, rather than left as the one
      // emission that still prints an unbounded line.
      {
        code: `import * as groupChannelApi from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  return groupChannelApi.create();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  const groupChannelApi = await import(
    '../firebaseCloud/messaging/groupChannel'
  );
  return groupChannelApi.create();
};`,
      },
      // Both statements the namespace branch emits are measured: the member
      // read has no argument list to break, so it breaks after its `=`.
      {
        code: `import createGroupChannelWithMembersAndExtraMetadataPayloadNow, * as groupChannelApi from '../firebaseCloud/messaging/groupChannel';

export const handler = async () => {
  return createGroupChannelWithMembersAndExtraMetadataPayloadNow();
};`,
        filename: 'src/hooks/useGroupChannel.ts',
        errors: [error('../firebaseCloud/messaging/groupChannel')],
        output: `
export const handler = async () => {
  const groupChannelApi = await import(
    '../firebaseCloud/messaging/groupChannel'
  );
  const createGroupChannelWithMembersAndExtraMetadataPayloadNow =
    groupChannelApi.default;
  return createGroupChannelWithMembersAndExtraMetadataPayloadNow();
};`,
      },
      // A module path wider than the line it lands on is emitted as is: a
      // string literal has no break point, so this is Prettier's output too —
      // the fixer neither declines nor invents a shape.
      {
        code: `import { send } from '../firebaseCloud/messaging/groupChannel/withAVeryDeeplyNestedModulePathThatCannotBeBroken';

export const handler = async () => {
  return send();
};`,
        filename: 'src/hooks/useSend.ts',
        errors: [
          error(
            '../firebaseCloud/messaging/groupChannel/withAVeryDeeplyNestedModulePathThatCannotBeBroken',
          ),
        ],
        output: `
export const handler = async () => {
  const { send } = await import(
    '../firebaseCloud/messaging/groupChannel/withAVeryDeeplyNestedModulePathThatCannotBeBroken'
  );
  return send();
};`,
      },
      // The block a concise body gains is an emission site of its own, and is
      // measured at the indentation the new body sits at.
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/messages';

export const handler = async () => sendGroupChannelMsg();`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        errors: [error('../firebaseCloud/chat/messages')],
        output: `
export const handler = async () => {
  const { sendGroupChannelMsg } = await import(
    '../firebaseCloud/chat/messages'
  );
  return sendGroupChannelMsg();
};`,
      },
      // `printWidth` is live in both directions: a narrower width wraps the
      // statement that fits at 80 ...
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/message';

export const handler = async () => {
  return sendGroupChannelMsg();
};`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        options: [{ printWidth: 60 }],
        errors: [error('../firebaseCloud/chat/message')],
        output: `
export const handler = async () => {
  const { sendGroupChannelMsg } = await import(
    '../firebaseCloud/chat/message'
  );
  return sendGroupChannelMsg();
};`,
      },
      // ... and a wider one keeps the statement that wraps at 80 on one line.
      {
        code: `import { sendGroupChannelMsg } from '../firebaseCloud/chat/messages';

export const handler = async () => {
  return sendGroupChannelMsg();
};`,
        filename: 'src/hooks/useSendGroupChannelMsg.ts',
        options: [{ printWidth: 120 }],
        errors: [error('../firebaseCloud/chat/messages')],
        output: `
export const handler = async () => {
  const { sendGroupChannelMsg } = await import('../firebaseCloud/chat/messages');
  return sendGroupChannelMsg();
};`,
      },

      // Deliberate declines: a concise body earns no more reach than a block
      // one, so the fix is still withheld wherever an `await` cannot go.

      // A synchronous arrow cannot host an `await`
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = () => a();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // A parameter default is evaluated before the body, so a declaration
      // inside the new block would come too late for it
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const run = async (fn = a) => fn();`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // Two concise arrows are two call sites, which is a per-call-site refactor
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const one = async () => a();
export const two = async () => a(1);`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // A concise arrow and an async block are likewise two call sites
      {
        code: `import { a } from '../firebaseCloud/utils/helper';

export const one = async () => a();
export const two = async () => {
  return a(1);
};`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },
      // A side-effect import binds nothing, so a concise consumer changes
      // nothing about it
      {
        code: `import '../firebaseCloud/utils/helper';

export const run = async () => undefined;`,
        filename: 'src/utils/run.ts',
        errors: [error('../firebaseCloud/utils/helper')],
        output: null,
      },

      // ---------------------------------------------------------------------
      // #2103 — the declaration heads the innermost statement list holding
      // every reference, not the function body. Heading the body puts the
      // module-load `await` in front of whatever ran before the first
      // reference, which turns synchronous prelude code into post-await code.
      // ---------------------------------------------------------------------

      // A re-entrancy guard stays synchronous: the await lands after it
      {
        code: `import { mint } from '../firebaseCloud/app/mint';

export const reveal = async (status: string) => {
  if (status === 'minting') {
    return undefined;
  }
  return await mint(status);
};`,
        filename: 'src/hooks/useReveal.ts',
        errors: [error('../firebaseCloud/app/mint')],
        output: `
export const reveal = async (status: string) => {
  if (status === 'minting') {
    return undefined;
  }
  const { mint } = await import('../firebaseCloud/app/mint');
  return await mint(status);
};`,
      },
      // A synchronous statement written before the call site stays before it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  const trimmed = id.trim();
  return await create(trimmed);
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  const trimmed = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  return await create(trimmed);
};`,
      },
      // Every reference inside a `try` puts the declaration inside it too, so a
      // chunk-load rejection stays catchable
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  try {
    return await create(id);
  } catch {
    return undefined;
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  try {
    const { create } = await import('../firebaseCloud/transaction/create');
    return await create(id);
  } catch {
    return undefined;
  }
};`,
      },
      // A `catch` block is a statement list of its own
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string, retryId: string) => {
  try {
    return id.trim();
  } catch {
    return await create(retryId);
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string, retryId: string) => {
  try {
    return id.trim();
  } catch {
    const { create } = await import('../firebaseCloud/transaction/create');
    return await create(retryId);
  }
};`,
      },
      // References straddling a `try` have no position at all: inside the block
      // is out of scope for the reference outside it, and outside it lets the
      // module-load rejection escape the `catch` that was written for the call
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string, retryId: string) => {
  try {
    return await create(id);
  } catch {
    return await create(retryId);
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // References in sibling branches share only the body, so the declaration
      // goes ahead of the branch — after everything written before it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const transact = async (op: string) => {
  const normalized = op.trim();
  if (normalized === 'mint') {
    return await create(normalized);
  }
  return await create(op);
};`,
        filename: 'src/hooks/useTransact.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const transact = async (op: string) => {
  const normalized = op.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  if (normalized === 'mint') {
    return await create(normalized);
  }
  return await create(op);
};`,
      },
      // A loop body is a statement list too. The module map memoizes the load,
      // so evaluating the import per iteration fetches nothing twice — and a
      // zero-iteration call now fetches nothing at all
      {
        code: `import { create as createTransaction } from '../firebaseCloud/transaction/create';

export const submitAll = async (ids: string[]) => {
  for (const id of ids) {
    await createTransaction(id);
  }
};`,
        filename: 'src/hooks/useSubmitAll.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submitAll = async (ids: string[]) => {
  for (const id of ids) {
    const { create: createTransaction } = await import(
      '../firebaseCloud/transaction/create'
    );
    await createTransaction(id);
  }
};`,
      },
      // A braceless guard body holds no statement list, so the declaration goes
      // ahead of the guard — still behind every statement written before it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  const trimmed = id.trim();
  if (trimmed) return await create(trimmed);
  return undefined;
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  const trimmed = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  if (trimmed) return await create(trimmed);
  return undefined;
};`,
      },
      // The same guard as the body's first statement: the declaration heads the
      // body, which is where it always went
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  if (id) return await create(id);
  return undefined;
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  const { create } = await import('../firebaseCloud/transaction/create');
  if (id) return await create(id);
  return undefined;
};`,
      },
      // A `function` declaration is hoisted across its whole container, so a
      // call written above it reaches the body first: the declaration heads the
      // list rather than taking the declaration's own position
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const run = async (ids: string[]) => {
  ids.forEach(load);
  function load(id: string) {
    return create(id);
  }
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const run = async (ids: string[]) => {
  const { create } = await import('../firebaseCloud/transaction/create');
  ids.forEach(load);
  function load(id: string) {
    return create(id);
  }
};`,
      },
      // Comments written above the anchor document it, so the declaration goes
      // ahead of the whole run rather than between a comment and its subject
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  const trimmed = id.trim();
  // the callable is only worth loading once the id is non-empty
  return await create(trimmed);
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  const trimmed = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  // the callable is only worth loading once the id is non-empty
  return await create(trimmed);
};`,
      },
      // A `case` clause holds statements, but a lexical declaration written in
      // one is scoped to the whole `switch` block — in scope, and in the
      // temporal dead zone, for every other clause. The declaration heads the
      // list the `switch` itself sits in
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (op: string) => {
  const normalized = op.trim();
  switch (normalized) {
    case 'mint':
      return await create(normalized);
    default:
      return undefined;
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (op: string) => {
  const normalized = op.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  switch (normalized) {
    case 'mint':
      return await create(normalized);
    default:
      return undefined;
  }
};`,
      },
      // A braced clause is an ordinary block, and hosts the declaration
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (op: string) => {
  switch (op) {
    case 'mint': {
      const normalized = op.trim();
      return await create(normalized);
    }
    default:
      return undefined;
  }
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (op: string) => {
  switch (op) {
    case 'mint': {
      const normalized = op.trim();
      const { create } = await import('../firebaseCloud/transaction/create');
      return await create(normalized);
    }
    default:
      return undefined;
  }
};`,
      },
      // The declaration follows the reference as deep as the statement lists go
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  const trimmed = id.trim();
  if (trimmed) {
    const prefixed = \`tx-\${trimmed}\`;
    return await create(prefixed);
  }
  return undefined;
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  const trimmed = id.trim();
  if (trimmed) {
    const prefixed = \`tx-\${trimmed}\`;
    const { create } = await import('../firebaseCloud/transaction/create');
    return await create(prefixed);
  }
  return undefined;
};`,
      },
      // A class static block holds statements but runs as a function of its
      // own, so an `await` written inside it is not the async function's at
      // all. The declaration is served from outside the class instead
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const run = async (id: string) => {
  const before = id.trim();
  class Holder {
    static {
      create(before);
    }
  }
  return Holder;
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const run = async (id: string) => {
  const before = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  class Holder {
    static {
      create(before);
    }
  }
  return Holder;
};`,
      },
      // A `namespace` body is emitted as an immediately invoked function, so it
      // is the same kind of boundary
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const run = async (id: string) => {
  const before = id.trim();
  namespace Holder {
    export const value = create(before);
  }
  return Holder.value;
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const run = async (id: string) => {
  const before = id.trim();
  const { create } = await import('../firebaseCloud/transaction/create');
  namespace Holder {
    export const value = create(before);
  }
  return Holder.value;
};`,
      },
      // A reference held by a synchronous callback is served from outside that
      // callback, which is where the callback is created — and therefore ahead
      // of every call to it, but behind the statements written before it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const run = async (ids: string[]) => {
  const sorted = [...ids].sort();
  return sorted.map((id) => create(id));
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const run = async (ids: string[]) => {
  const sorted = [...ids].sort();
  const { create } = await import('../firebaseCloud/transaction/create');
  return sorted.map((id) => create(id));
};`,
      },

      // ---------------------------------------------------------------------
      // #2103 — the anchor answers WHERE the `await` goes, not whether going
      // there is safe. A check-then-act on state that outlives the call is
      // defeated by a module load anywhere between its test and its act, and
      // no anchor position avoids that, so those placements are reported
      // without a fixer. A loop that never suspends is handed the position
      // outside itself rather than an `await` per iteration.
      // ---------------------------------------------------------------------

      // A re-entrancy guard whose own branch reads the import has no safe anchor:
      // the earliest referencing statement IS the guard, so the declaration
      // lands ahead of the test and a second call in the same tick passes it
      // before the first flips `busy`. The report stands without a fix
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const reveal = async (status: string) => {
  const trimmed = status.trim();
  if (busy) {
    return await create(trimmed);
  }
  busy = true;
  return await create(status);
};`,
        filename: 'src/hooks/useReveal.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // The same defeat spelled as a React state flip: the guard tests
      // `revealStatus` and the statement behind it calls the setter named after
      // it, which is a write to that state with no assignment written anywhere
      {
        code: `import { mint } from '../firebaseCloud/app/mint';

type Setter = (value: string) => void;

export const useReveal = (revealStatus: string, setRevealStatus: Setter) => {
  return async (id: string) => {
    if (revealStatus === 'minting') {
      return await mint(id);
    }
    setRevealStatus('minting');
    return await mint(revealStatus);
  };
};`,
        filename: 'src/hooks/useReveal.ts',
        errors: [error('../firebaseCloud/app/mint')],
        output: null,
      },
      // A `useRef` guard reads a member path, which names state the call did not
      // create whatever binding roots it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

type Ref = { current: boolean };

export const useSubmit = (busyRef: Ref) => {
  return async (id: string) => {
    if (busyRef.current) {
      return await create(id);
    }
    busyRef.current = true;
    return await create(id);
  };
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // A guard written after the block the anchor sits in is jumped just as
      // squarely as one written beside it
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const run = async (id: string) => {
  if (id) {
    schedule(() => create(id));
  }
  if (busy) {
    return undefined;
  }
  busy = true;
  return undefined;
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // The mirror position: the anchor lands BEHIND the test and ahead of the
      // act, which widens the very window the guard closes
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let started = false;

export const run = async (id: string) => {
  if (!started) {
    create(id);
    started = true;
  }
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // A flag declared inside the async function is created fresh per call, so
      // no second call can observe the one this call flips — and the test and
      // the act keep their order. The fix stands
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const submit = async (id: string) => {
  let attempted = false;
  if (attempted) {
    return await create(id);
  }
  attempted = true;
  return await create(id);
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const submit = async (id: string) => {
  let attempted = false;
  const { create } = await import('../firebaseCloud/transaction/create');
  if (attempted) {
    return await create(id);
  }
  attempted = true;
  return await create(id);
};`,
      },
      // A guard already reached through an `await` runs a task late whatever this
      // fixer does, so the relocation is not what makes it unreliable
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const submit = async (id: string) => {
  const trimmed = await Promise.resolve(id.trim());
  if (busy) {
    return await create(trimmed);
  }
  busy = true;
  return await create(id);
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
let busy = false;

export const submit = async (id: string) => {
  const trimmed = await Promise.resolve(id.trim());
  const { create } = await import('../firebaseCloud/transaction/create');
  if (busy) {
    return await create(trimmed);
  }
  busy = true;
  return await create(id);
};`,
      },
      // A guard and its flip written ahead of the reference keep the caller's
      // task: the declaration lands behind both
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const submit = async (id: string) => {
  if (busy) {
    return undefined;
  }
  busy = true;
  return await create(id);
};`,
        filename: 'src/hooks/useSubmit.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
let busy = false;

export const submit = async (id: string) => {
  if (busy) {
    return undefined;
  }
  busy = true;
  const { create } = await import('../firebaseCloud/transaction/create');
  return await create(id);
};`,
      },
      // A loop with no suspension of its own runs in one task, and anchoring
      // inside it would hand control back on every iteration. The declaration
      // goes ahead of the loop instead — one load rather than one per pass
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const trackAll = async (ids: string[]) => {
  const seen = [...ids].sort();
  for (const id of seen) {
    create(id);
  }
};`,
        filename: 'src/hooks/useTrackAll.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const trackAll = async (ids: string[]) => {
  const seen = [...ids].sort();
  const { create } = await import('../firebaseCloud/transaction/create');
  for (const id of seen) {
    create(id);
  }
};`,
      },
      // Stepping out of an atomic loop stops at the `try`: the declaration stays
      // where a chunk-load rejection is still caught
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

export const trackAll = async (ids: string[]) => {
  try {
    for (const id of ids) {
      create(id);
    }
  } catch {
    return undefined;
  }
};`,
        filename: 'src/hooks/useTrackAll.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
export const trackAll = async (ids: string[]) => {
  try {
    const { create } = await import('../firebaseCloud/transaction/create');
    for (const id of ids) {
      create(id);
    }
  } catch {
    return undefined;
  }
};`,
      },
      // Stepping out launders no guard: the position outside the loop is inside
      // the branch the flip follows, so the report stands without a fix
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const trackAll = async (ids: string[]) => {
  if (busy) {
    for (const id of ids) {
      create(id);
    }
  }
  busy = true;
};`,
        filename: 'src/hooks/useTrackAll.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: null,
      },
      // A trailing guard the anchor's branch returns past never runs behind the
      // `await` at all, so it withholds nothing
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let busy = false;

export const run = async (id: string) => {
  if (id) {
    return await create(id);
  }
  if (busy) {
    return undefined;
  }
  busy = true;
  return undefined;
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
let busy = false;

export const run = async (id: string) => {
  if (id) {
    const { create } = await import('../firebaseCloud/transaction/create');
    return await create(id);
  }
  if (busy) {
    return undefined;
  }
  busy = true;
  return undefined;
};`,
      },
      // The act is already reached through an `await`, so the window predates the
      // relocation
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let started = false;

export const run = async (id: string) => {
  if (!started) {
    await create(id);
    started = true;
  }
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
let started = false;

export const run = async (id: string) => {
  if (!started) {
    const { create } = await import('../firebaseCloud/transaction/create');
    await create(id);
    started = true;
  }
};`,
      },
      // The flip runs before the reference, so the declaration lands behind it and
      // the guard keeps its guarantee
      {
        code: `import { create } from '../firebaseCloud/transaction/create';

let started = false;

export const run = async (id: string) => {
  if (!started) {
    started = true;
    create(id);
  }
};`,
        filename: 'src/hooks/useRun.ts',
        errors: [error('../firebaseCloud/transaction/create')],
        output: `
let started = false;

export const run = async (id: string) => {
  if (!started) {
    started = true;
    const { create } = await import('../firebaseCloud/transaction/create');
    create(id);
  }
};`,
      },
    ],
  },
);
