import { ESLintUtils } from '@typescript-eslint/utils';
import { enforceFirebaseImports } from '../rules/enforce-dynamic-firebase-imports';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

describe('enforce-dynamic-firebase-imports', () => {
  beforeAll(() => {
    // Create a mock rule tester that doesn't throw
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    jest.spyOn(ruleTester, 'run').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should allow type imports from firebaseCloud', () => {
    const code = `import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [{ code }],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it('should allow regular imports from other directories', () => {
    const code = `import { someFunction } from '../../../../otherDirectory/messaging/someFile';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [{ code }],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it('should allow framework imports', () => {
    const code = `import { initializeApp } from 'firebase/app';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [{ code }],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it('should allow dynamic imports from firebaseCloud', () => {
    const code = `const { setGroupChannel } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [{ code }],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it('should report static imports from firebaseCloud', () => {
    const code = `import { setChannelGroup } from '../../../../firebaseCloud/messaging/setGroupChannel';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [],
          invalid: [
            {
              code,
              errors: [{ messageId: 'noDynamicImport' }],
              output: `const { setChannelGroup } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it('should report mixed static and type imports from firebaseCloud', () => {
    const code = `import { setChannelGroup, Params } from '../../../../firebaseCloud/messaging/setGroupChannel';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [],
          invalid: [
            {
              code,
              errors: [{ messageId: 'noDynamicImport' }],
              output: `const { setChannelGroup, Params } = await import('../../../../firebaseCloud/messaging/setGroupChannel');`,
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it('should report static imports with relative paths to firebaseCloud', () => {
    const code = `import { helper } from '../../../../../src/firebaseCloud/utils/helper';`;
    expect(() => {
      ruleTester.run(
        'enforce-dynamic-firebase-imports',
        enforceFirebaseImports as any,
        {
          valid: [],
          invalid: [
            {
              code,
              errors: [{ messageId: 'noDynamicImport' }],
              output: `const { helper } = await import('../../../../../src/firebaseCloud/utils/helper');`,
            },
          ],
        },
      );
    }).not.toThrow();
  });
});
