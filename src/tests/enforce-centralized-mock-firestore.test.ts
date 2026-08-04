import { ruleTesterTs } from '../utils/ruleTester';
import { enforceCentralizedMockFirestore } from '../rules/enforce-centralized-mock-firestore';

const ERROR = {
  messageId: 'useCentralizedMockFirestore' as const,
  data: {
    requiredPath: '../../../../../__test-utils__/mockFirestore',
  },
};

ruleTesterTs.run(
  'enforce-centralized-mock-firestore',
  enforceCentralizedMockFirestore,
  {
    valid: [
      // Valid case: Using the centralized mockFirestore
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: No mockFirestore usage
      {
        code: `
        import { someOtherMock } from './mocks';

        beforeEach(() => {
          someOtherMock();
        });
      `,
      },
      // Valid case: Using renamed import
      {
        code: `
        import { mockFirestore as centralMockFirestore } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          centralMockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: Using destructured import with comments
      {
        code: `
        // Import the centralized mockFirestore
        import {
          // This is the mock we need
          mockFirestore,
          // Other imports
          otherMock,
        } from '../../../../../__test-utils__/mockFirestore';

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Valid case: Using in async test
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        it('should work with async', async () => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
          await someAsyncOperation();
        });
      `,
      },
      // Valid case: Using with multiple test blocks
      {
        code: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        describe('test suite', () => {
          beforeAll(() => {
            mockFirestore({
              'global/path': [{ id: 'global' }],
            });
          });

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });

          afterEach(() => {
            mockFirestore({});
          });
        });
      `,
      },
      // Valid case: a similarly named local that is not mockFirestore, sharing
      // a line with another declaration
      {
        code: `const notMockFirestore = jest.fn(); const keepMe = 1;
beforeEach(() => { notMockFirestore({}); use(keepMe); });`,
      },
      // Valid case: mockFirestore as an object literal key rather than a
      // binding
      {
        code: `const mocks = { mockFirestore: jest.fn() };
beforeEach(() => { mocks.mockFirestore({}); });`,
      },
    ],
    invalid: [
      // Invalid case: Local mockFirestore declaration
      {
        code: `
        const mockFirestore = jest.fn();

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Conditional mockFirestore declaration
      {
        code: `
        const mockFirestore = process.env.TEST_ENV === 'ci' ? jest.fn() : require('mockModule');

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Different name but same functionality
      {
        code: `
        const myMockFirestore = jest.fn();
        const mockFirestore = myMockFirestore;

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        const myMockFirestore = jest.fn();

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Using require syntax
      {
        code: `
        const { mockFirestore } = require('./localMocks');

        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        beforeEach(() => {
          mockFirestore({
            'some/path': [{ id: 'test' }],
          });
        });
      `,
      },
      // Invalid case: Using with class property
      {
        code: `
        class TestClass {
          private mockFirestore = jest.fn();

          beforeEach() {
            this.mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          }
        }
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        class TestClass {

          beforeEach() {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          }
        }
      `,
      },
      // Invalid case: Using with destructuring and renaming
      {
        code: `
        const { mockFirestore: customMockFirestore } = require('./customMocks');

        describe('test suite', () => {
          beforeEach(() => {
            customMockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },
      // Invalid case: Using with dynamic import
      {
        code: `
        async function setupTests() {
          const { mockFirestore } = await import('./localMocks');

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        }
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        async function setupTests() {

          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        }
      `,
      },
      // Invalid case: Using with multiple declarations
      {
        code: `
        const mockFirestore1 = jest.fn();
        const mockFirestore2 = jest.fn();
        const mockFirestore = process.env.CI ? mockFirestore1 : mockFirestore2;

        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

        const mockFirestore1 = jest.fn();
        const mockFirestore2 = jest.fn();

        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },
      // Invalid case: Using with complex object destructuring
      {
        code: `
        const {
          mocks: {
            firestore: {
              mockFirestore
            }
          }
        } = require('./complexMocks');

        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';


        describe('test suite', () => {
          beforeEach(() => {
            mockFirestore({
              'some/path': [{ id: 'test' }],
            });
          });
        });
      `,
      },

      // ---------------------------------------------------------------------
      // Retirement is bounded by the declaration's own range. Everything else
      // that happens to share a line with it must come through untouched.
      // ---------------------------------------------------------------------

      // A live statement AFTER the retired declaration on the same line
      {
        code: `const mockFirestore = jest.fn(); const keepMe = buildFixture();
beforeEach(() => {
  mockFirestore({ 'some/path': [{ id: 'test' }] });
  use(keepMe);
});`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const keepMe = buildFixture();
beforeEach(() => {
  mockFirestore({ 'some/path': [{ id: 'test' }] });
  use(keepMe);
});`,
      },
      // A live statement BEFORE the retired declaration on the same line
      {
        code: `setup(); const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
setup();
beforeEach(() => { mockFirestore({}); });`,
      },
      // Live statements on BOTH sides of the retired declaration
      {
        code: `setup(); const mockFirestore = jest.fn(); teardown();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
setup(); teardown();
beforeEach(() => { mockFirestore({}); });`,
      },
      // A trailing line comment is not part of the declaration, so it survives
      // the retirement. An orphaned comment is visible and recoverable; a
      // deleted one is neither.
      {
        code: `const mockFirestore = jest.fn(); // the local mock we are retiring
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
// the local mock we are retiring
beforeEach(() => { mockFirestore({}); });`,
      },
      // A trailing eslint-disable-line directive survives too: silently
      // dropping it changes which rules report on the file.
      {
        code: `const mockFirestore = jest.fn(); // eslint-disable-line no-undef
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
// eslint-disable-line no-undef
beforeEach(() => { mockFirestore({}); });`,
      },
      // A block comment between the retired declaration and a live statement
      {
        code: `const mockFirestore = jest.fn(); /* keep */ const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
/* keep */ const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
      },
      // The successor inherits the indentation the retired declaration held
      {
        code: `describe('suite', () => {
  const mockFirestore = jest.fn(); const keepMe = fixture();
  beforeEach(() => { mockFirestore({}); use(keepMe); });
});`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
describe('suite', () => {
  const keepMe = fixture();
  beforeEach(() => { mockFirestore({}); use(keepMe); });
});`,
      },
      // Tab indentation is preserved just the same
      {
        code: "describe('suite', () => {\n\tconst mockFirestore = jest.fn();\tconst keepMe = 1;\n\tbeforeEach(() => { mockFirestore({}); use(keepMe); });\n});",
        errors: [ERROR],
        output:
          "import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';\ndescribe('suite', () => {\n\tconst keepMe = 1;\n\tbeforeEach(() => { mockFirestore({}); use(keepMe); });\n});",
      },
      // The common case: the declaration owns its line, so the whole line goes
      {
        code: `const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // CRLF line endings still yield a whole-line retirement
      {
        code: 'const mockFirestore = jest.fn();\r\nbeforeEach(() => { mockFirestore({}); });',
        errors: [ERROR],
        output:
          "import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';\nbeforeEach(() => { mockFirestore({}); });",
      },
      // No semicolon on the retired declaration
      {
        code: `const mockFirestore = jest.fn()
beforeEach(() => { mockFirestore({}) })`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}) })`,
      },
      // The retired declaration is the only statement in the file
      {
        code: `const mockFirestore = jest.fn();
`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
`,
      },
      // ...and the same file without a trailing newline
      {
        code: `const mockFirestore = jest.fn();`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
`,
      },
      // Sibling declarators keep the `const` and its separating comma intact
      {
        code: `const mockFirestore = jest.fn(), after = 2;
beforeEach(() => { mockFirestore({}); use(after); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const after = 2;
beforeEach(() => { mockFirestore({}); use(after); });`,
      },
      {
        code: `const before = 1, mockFirestore = jest.fn(), after = 2;
beforeEach(() => { mockFirestore({}); use(before, after); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const before = 1, after = 2;
beforeEach(() => { mockFirestore({}); use(before, after); });`,
      },
      {
        code: `const before = 1, mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); use(before); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const before = 1;
beforeEach(() => { mockFirestore({}); use(before); });`,
      },
      {
        code: `const before = 1,
  mockFirestore = jest.fn(),
  after = 2;
beforeEach(() => { mockFirestore({}); use(before, after); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const before = 1,
  after = 2;
beforeEach(() => { mockFirestore({}); use(before, after); });`,
      },
      // A declarator in a for-loop head is safe to drop
      {
        code: `for (let i = 0, mockFirestore = jest.fn(); i < 1; i++) { mockFirestore({}); }`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
for (let i = 0; i < 1; i++) { mockFirestore({}); }`,
      },
      // A for-of head cannot be excised without breaking the loop, so the
      // violation is reported without an autofix rather than fixed wrongly.
      {
        code: `for (const mockFirestore of mocks) { mockFirestore({}); }`,
        errors: [ERROR],
        output: null,
      },
      // The `export` keyword lives outside the declaration's range and must go
      // with it instead of being stranded
      {
        code: `export const mockFirestore = jest.fn(); export const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
export const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
      },
      {
        code: `export const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // A declaration inside a switch case block
      {
        code: `switch (kind) {
  case 1: {
    const mockFirestore = jest.fn(); const keepMe = 1;
    use(mockFirestore, keepMe);
  }
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
switch (kind) {
  case 1: {
    const keepMe = 1;
    use(mockFirestore, keepMe);
  }
}`,
      },
      // A class property sharing its line with a live property
      {
        code: `class TestClass {
  private mockFirestore = jest.fn(); private keepMe = 1;
  run() { this.mockFirestore({}); }
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
class TestClass {
  private keepMe = 1;
  run() { mockFirestore({}); }
}`,
      },
      // A class property whose line carries a trailing comment
      {
        code: `class TestClass {
  private mockFirestore = jest.fn(); // keep this note
  run() { this.mockFirestore({}); }
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
class TestClass {
  // keep this note
  run() { mockFirestore({}); }
}`,
      },
      // Two retired declarations on one line collapse into a single removal
      {
        code: `const mockFirestore = jest.fn(); class T { mockFirestore = 1; run() { this.mockFirestore({}); } }
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
class T { run() { mockFirestore({}); } }
beforeEach(() => { mockFirestore({}); });`,
      },
      // A renamed destructured require sharing its line: the rename is still
      // rewritten and the neighbour survives
      {
        code: `const { mockFirestore: customMock } = require('./localMocks'); const keepMe = 1;
beforeEach(() => { customMock({}); use(keepMe); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
      },
      // A declaration spanning several lines whose LAST line is shared
      {
        code: `const {
  mockFirestore,
} = require('./localMocks'); const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
      },
      // A declaration inside a namespace export
      {
        code: `namespace Mocks {
  export const mockFirestore = jest.fn();
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
namespace Mocks {
}`,
      },
      // An ambient declaration
      {
        code: `declare const mockFirestore: jest.Mock;
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
    ],
  },
);
