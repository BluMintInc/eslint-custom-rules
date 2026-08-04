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
      // The centralized module defines the mock every other file is sent to
      // import, so its own definition is the remedy, not a violation of it.
      // Reporting there has no available fix — the message would tell the
      // module to import itself (#1703, same class as #1671).
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: '__test-utils__/mockFirestore.ts',
      },
      {
        code: `export const mockFirestore = jest.fn();
export const mockAuth = jest.fn();`,
        filename: 'src/__test-utils__/mockFirestore.ts',
      },
      {
        code: `const mockFirestore = jest.fn();
export { mockFirestore };`,
        filename: '/repo/src/__test-utils__/mockFirestore.ts',
      },
      // The module is exempt under every source extension it can ship as
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: 'src/__test-utils__/mockFirestore.tsx',
      },
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: '/repo/__test-utils__/mockFirestore.js',
      },
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: 'src/__test-utils__/mockFirestore.jsx',
      },
      // An extensionless path still identifies the module
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: '/repo/src/__test-utils__/mockFirestore',
      },
      // Windows separators name the same module as POSIX ones
      {
        code: `export const mockFirestore = jest.fn();`,
        filename: 'C:\\repo\\src\\__test-utils__\\mockFirestore.ts',
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
      // An exported mockFirestore is reported without a fix: retiring it would
      // take the name off the module's export surface, and the importers that
      // spell it out live in files this single-file fixer cannot reach (#1703)
      {
        code: `export const mockFirestore = jest.fn(); export const keepMe = 1;
beforeEach(() => { mockFirestore({}); use(keepMe); });`,
        errors: [ERROR],
        output: null,
      },
      {
        code: `export const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: null,
      },
      // An exported declaration with no in-file use site is the most exposed
      // shape, not the safest: every reference to it is in another file (#1703)
      {
        code: `export const mockFirestore = jest.fn();`,
        errors: [ERROR],
        output: null,
      },
      // The export survives a multi-declarator `const` too, where the fixer
      // excises the declarator rather than the whole statement (#1703)
      {
        code: `export const before = 1, mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); use(before); });`,
        errors: [ERROR],
        output: null,
      },
      // One exported declaration withholds the fix for the whole file, since
      // the file is reported once and fixed as a unit (#1703)
      {
        code: `const localMock = 1;
export const mockFirestore = jest.fn();
class T { mockFirestore = 1; run() { this.mockFirestore({}); } }
beforeEach(() => { mockFirestore({}); use(localMock); });`,
        errors: [ERROR],
        output: null,
      },
      // An exported destructured require is on the export surface as well
      {
        code: `export const { mockFirestore } = require('./localMocks');
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: null,
      },
      // A class property belongs to its class, not to the module, so an
      // exported class can still give up its local mock (#1703)
      {
        code: `export default class T {
  mockFirestore = jest.fn();
  run() { this.mockFirestore({}); }
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
export default class T {
  run() { mockFirestore({}); }
}`,
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
      // A declaration inside a namespace export: `Mocks.mockFirestore` is a
      // contract for every reader of the namespace, so it is reported without
      // a fix rather than excised (#1703)
      {
        code: `namespace Mocks {
  export const mockFirestore = jest.fn();
}`,
        errors: [ERROR],
        output: null,
      },
      // A namespace-local declaration carries no export and is still fixed
      {
        code: `namespace Mocks {
  const mockFirestore = jest.fn();
  use(mockFirestore);
}`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
namespace Mocks {
  use(mockFirestore);
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

      // ---------------------------------------------------------------------
      // The import lands below whatever opens the file, and the text above it
      // is emitted exactly once. A duplicated header, a demoted directive or a
      // displaced shebang all change what the file means.
      // ---------------------------------------------------------------------

      // A leading line comment survives once, with the import below it
      {
        code: `// header comment
const mockFirestore = jest.fn();
beforeEach(() => {
  mockFirestore({ 'some/path': [{ id: 'test' }] });
});`,
        errors: [ERROR],
        output: `// header comment
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => {
  mockFirestore({ 'some/path': [{ id: 'test' }] });
});`,
      },
      // A license header block comment is emitted once
      {
        code: `/**
 * Copyright (c) BluMint.
 */
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `/**
 * Copyright (c) BluMint.
 */
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // A leading @ts-nocheck keeps governing the file: it only does so while
      // it leads, so the injected import goes below it
      {
        code: `// @ts-nocheck
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `// @ts-nocheck
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // A 'use client' directive stays the first statement, or the file stops
      // being a client component
      {
        code: `'use client';
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({ 'some/path': [{ id: 'test' }] }); });`,
        errors: [ERROR],
        output: `'use client';
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({ 'some/path': [{ id: 'test' }] }); });`,
      },
      // ...and so does 'use server'
      {
        code: `'use server';
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `'use server';
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // A directive above the file's only statement
      {
        code: `'use client';
const mockFirestore = jest.fn();`,
        errors: [ERROR],
        output: `'use client';
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
`,
      },
      // A shebang must stay at character 0 or the file stops parsing
      {
        code: `#!/usr/bin/env node
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `#!/usr/bin/env node
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // An existing import block is where the new import joins
      {
        code: `import { buildFixture } from './fixtures';

const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore(buildFixture()); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
import { buildFixture } from './fixtures';

beforeEach(() => { mockFirestore(buildFixture()); });`,
      },
      // ...below the trivia that leads the file, not above it
      {
        code: `// tooling header
import { buildFixture } from './fixtures';
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore(buildFixture()); });`,
        errors: [ERROR],
        output: `// tooling header
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
import { buildFixture } from './fixtures';
beforeEach(() => { mockFirestore(buildFixture()); });`,
      },
      // A directive sharing the retired declaration's line: the import cannot
      // take that line's start without displacing the directive, so it lands
      // straight after it
      {
        code: `'use client'; const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `'use client';
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

beforeEach(() => { mockFirestore({}); });`,
      },
      // An indented file whose anchor is the retired declaration: the import
      // takes over the indentation the declaration held
      {
        code: `
        const mockFirestore = jest.fn(); const keepMe = 1;
        beforeEach(() => { mockFirestore({}); use(keepMe); });
      `,
        errors: [ERROR],
        output: `
        import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
        const keepMe = 1;
        beforeEach(() => { mockFirestore({}); use(keepMe); });
      `,
      },
      // A suppression bound to the retired declaration's line: the import goes
      // above it rather than between the directive and the line it covers,
      // which would silently retarget the suppression at the import
      {
        code: `// eslint-disable-next-line no-undef
const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
// eslint-disable-next-line no-undef
beforeEach(() => { mockFirestore({}); });`,
      },
      // An exported local definition outside the centralized module is
      // reported but not rewritten -- the export is a cross-file contract
      // (#1703)
      {
        code: "export const mockFirestore = jest.fn();\nbeforeEach(() => { mockFirestore({ 'a/b': [] }); });",
        filename: 'src/foo.test.ts',
        errors: [ERROR],
        output: null,
      },

      // ---------------------------------------------------------------------
      // The centralized module's exemption is keyed on the module's identity,
      // so files that merely resemble it stay reportable and fixable (#1703).
      // ---------------------------------------------------------------------

      // An ordinary test file defining a local mock is fixed, which is what
      // keeps the exemption above from being a blanket disable
      {
        code: `const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({ 'a/b': [] }); });`,
        filename: 'src/foo.test.ts',
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({ 'a/b': [] }); });`,
      },
      // The centralized module's own test file is a consumer, not the module
      {
        code: `const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        filename: 'src/__test-utils__/mockFirestore.test.ts',
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // The suffix must land on a path-segment boundary: an unrelated
      // directory whose name merely ends in the module's is not the module
      {
        code: `const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        filename: 'src/not__test-utils__/mockFirestore.ts',
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
      // A sibling of the centralized module is not the centralized module
      {
        code: `const mockFirestore = jest.fn();
beforeEach(() => { mockFirestore({}); });`,
        filename: 'src/__test-utils__/mockAuth.ts',
        errors: [ERROR],
        output: `import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => { mockFirestore({}); });`,
      },
    ],
  },
);
