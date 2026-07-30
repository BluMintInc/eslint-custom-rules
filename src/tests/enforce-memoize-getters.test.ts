import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeGetters } from '../rules/enforce-memoize-getters';

ruleTesterTs.run('enforce-memoize-getters', enforceMemoizeGetters, {
  valid: [
    // Already decorated with preferred import
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Already decorated without parentheses
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize
          private get fetcher() { return {}; }
        }
      `,
    },
    // Aliased import with parentheses
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Namespaced decorator form recognized as valid
    {
      code: `
        import * as M from '@blumintinc/typescript-memoize';
        class Example {
          @M.Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Namespaced decorator form without parentheses recognized as valid
    {
      code: `
        import * as M from '@blumintinc/typescript-memoize';
        class Example {
          @M.Memoize
          private get fetcher() { return {}; }
        }
      `,
    },
    // Different decorator present alongside Memoize
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Other(): any {}
        class Example {
          @Other
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Static getter should be ignored
    {
      code: `
        class Example {
          private static get version() { return 1; }
        }
      `,
    },
    // Public getter should be ignored
    {
      code: `
        class Example {
          get value() { return 1; }
        }
      `,
    },
    // Protected getter should be ignored
    {
      code: `
        class Example {
          protected get value() { return 1; }
        }
      `,
    },
    // JS file should be ignored entirely
    {
      filename: 'file.js',
      code: `
        class Example {
          get value() { return 1; }
        }
      `,
    },
    // TSX file OK with decoration
    {
      filename: 'file.tsx',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get node() { return <div/>; }
        }
      `,
    },
    // Computed property name with decoration
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get ['fetcher']() { return {}; }
        }
      `,
    },
    // With another decorator present and Memoize already applied
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Using legacy module path still valid
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Issue #1409: every violation suppressed inline leaves the file untouched
    {
      name: 'all violations disabled inline report nothing',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-getters
          private get a() { return 1; }
          // eslint-disable-next-line enforce-memoize-getters
          private get b() { return 2; }
        }
      `,
    },
    // Issue #1409: a block disable covering the class suppresses everything
    {
      name: 'block disable naming this rule suppresses the whole class',
      code: `
        /* eslint-disable enforce-memoize-getters */
        class Example {
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
    },
    // Issue #1409: a bare block disable suppresses every rule
    {
      name: 'bare block disable suppresses the whole class',
      code: `
        /* eslint-disable */
        class Example {
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
    },
    // Issue #1409: a bare line disable suppresses this rule too
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line
          private get a() { return 1; }
        }
      `,
    },
  ],
  invalid: [
    // Basic: add import and decorator
    {
      code: `
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Insert import before first import
    {
      code: `
        import { something } from 'lib';
        export class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { something } from 'lib';
        export class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing preferred import
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing legacy import
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing aliased import (legacy path)
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing aliased import (preferred path)
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // With other decorator present; Memoize inserted above
    {
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Namespace import should be reused without adding a new import
    {
      code: `
        import * as Memo from '@blumintinc/typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import * as Memo from '@blumintinc/typescript-memoize';
        class Example {
          @Memo.Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Computed property name
    {
      code: `
        class Example {
          private get ['fetcher']() { return {}; }
        }
      `,
      errors: [
        {
          messageId: 'requireMemoizeGetter',
          data: { name: '[computed]' },
        },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get ['fetcher']() { return {}; }
        }
      `,
    },
    // Real computed property name
    {
      code: `
        class Example {
          private get [Symbol.iterator]() { return {}; }
        }
      `,
      errors: [
        {
          messageId: 'requireMemoizeGetter',
          data: { name: '[computed]' },
        },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get [Symbol.iterator]() { return {}; }
        }
      `,
    },
    // Multiple private getters should each be decorated, single import
    {
      code: `
        class Example {
          private get a() { return 1; }
          private get b() { return 2; }
          protected get c() { return 3; }
        }
      `,
      errors: [
        {
          messageId: 'requireMemoizeGetter',
          data: { name: 'a' },
        },
        {
          messageId: 'requireMemoizeGetter',
          data: { name: 'b' },
        },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
          protected get c() { return 3; }
        }
      `,
    },
    // Preserve JSDoc above the decorator
    {
      code: `
        class Example {
          /** docs */
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          /** docs */
          @Memoize()
          private get a() { return 1; }
        }
      `,
    },
    // Works in TSX files too
    {
      filename: 'component.tsx',
      code: `
        export class Example {
          private get node() { return <span/>; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Example {
          @Memoize()
          private get node() { return <span/>; }
        }
      `,
    },
    // Insert import before first non-import statement when there are no imports
    {
      code: `
        'use strict';
        class Example {
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        'use strict';
        class Example {
          @Memoize()
          private get a() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1409: the import fix must ride on the first *surviving*
    // violation. A suppressed violation used to claim the carrier slot and
    // take the import down with it, emitting @Memoize() with no import.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `
        export class Example {
          // eslint-disable-next-line enforce-memoize-getters
          private get alpha() { return {}; }

          private get beta() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Example {
          // eslint-disable-next-line enforce-memoize-getters
          private get alpha() { return {}; }

          @Memoize()
          private get beta() { return {}; }
        }
      `,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and all other decorators',
      code: `
        class Example {
          private get a() { return 1; }
          // eslint-disable-next-line enforce-memoize-getters
          private get b() { return 2; }
          private get c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get a() { return 1; }
          // eslint-disable-next-line enforce-memoize-getters
          private get b() { return 2; }
          @Memoize()
          private get c() { return 3; }
        }
      `,
    },
    {
      name: 'disable on the LAST violation keeps one import and all other decorators',
      code: `
        class Example {
          private get a() { return 1; }
          private get b() { return 2; }
          // eslint-disable-next-line enforce-memoize-getters
          private get c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
          // eslint-disable-next-line enforce-memoize-getters
          private get c() { return 3; }
        }
      `,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `
        class Example {
          // eslint-disable-next-line
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `
        class Example {
          // eslint-disable-next-line no-console
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line no-console
          @Memoize()
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable with a -- description suffix suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-getters -- must re-read every access
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-getters -- must re-read every access
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      name: 'eslint-disable-line suppresses the violation on its own line',
      code: `
        class Example {
          private get a() { return 1; } // eslint-disable-line enforce-memoize-getters
          private get b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          private get a() { return 1; } // eslint-disable-line enforce-memoize-getters
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      name: 'violations after an eslint-enable are fixed and carry the import',
      code: `
        class Example {
          /* eslint-disable enforce-memoize-getters */
          private get a() { return 1; }
          /* eslint-enable enforce-memoize-getters */
          private get b() { return 2; }
          private get c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          /* eslint-disable enforce-memoize-getters */
          private get a() { return 1; }
          /* eslint-enable enforce-memoize-getters */
          @Memoize()
          private get b() { return 2; }
          @Memoize()
          private get c() { return 3; }
        }
      `,
    },
    {
      name: 'suppressed first violation with Memoize already imported adds no duplicate import',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-getters
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-getters
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      // MethodDefinition.range covers leading decorators, so the reported
      // location is the decorator's line. A disable above the decorator is
      // therefore the one that suppresses the report, matching real ESLint.
      name: 'disable above an existing decorator suppresses the decorated getter',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-getters
          @Log()
          private get a() { return 1; }
          private get b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-getters
          @Log()
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
        }
      `,
    },
    {
      // Mirror of the above: a disable *between* the decorator and the
      // signature targets the signature line, not the reported location, so
      // ESLint does not suppress the report and the fix still applies.
      name: 'disable between a decorator and its getter does not suppress',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          // eslint-disable-next-line enforce-memoize-getters
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          // eslint-disable-next-line enforce-memoize-getters
          private get a() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1424: the fix inserts an import that binds `Memoize`, so an
    // existing binding of that name makes the edit wrong twice over — a
    // module-scope declaration collides with the import (TS2440, or TS2300
    // when the binding is itself an import), and a shadow at the fix site
    // captures the emitted decorator with no compile error at all. The report
    // stands; only the edit is withheld.
    // ------------------------------------------------------------------
    {
      name: 'a module-scope const named Memoize withholds the fix',
      code: `
        const Memoize = 1;
        export class Service {
          private get fetcher() { return Memoize; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a function declaration named Memoize withholds the fix',
      code: `
        function Memoize() { return 1; }
        export class Service {
          private get fetcher() { return Memoize(); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a class declaration named Memoize withholds the fix',
      code: `
        class Memoize {}
        export class Service {
          private get fetcher() { return new Memoize(); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'the enclosing class binding its own name Memoize withholds the fix',
      code: `
        export class Memoize {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a named Memoize import from another module withholds the fix',
      code: `
        import { Memoize } from 'some-other-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a namespace import named Memoize withholds the fix',
      code: `
        import * as Memoize from 'some-other-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a default import named Memoize withholds the fix',
      code: `
        import Memoize from '@blumintinc/typescript-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a type-only Memoize import withholds the fix',
      code: `
        import type { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'an inline type-only Memoize specifier withholds the fix',
      code: `
        import { type Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a shadowing parameter named Memoize withholds the fix at that site',
      code: `
        export function build(Memoize) {
          return class {
            private get fetcher() { return Memoize; }
          };
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a block-scoped Memoize binding withholds the fix at that site',
      code: `
        export function build() {
          const Memoize = 1;
          class Service {
            private get fetcher() { return Memoize; }
          }
          return Service;
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: null,
    },
    {
      name: 'a shadowed site declines while an unshadowed site still carries the import',
      code: `
        export class Outer {
          private get first() { return 1; }
        }
        export function build(Memoize) {
          return class {
            private get second() { return Memoize; }
          };
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Outer {
          @Memoize()
          private get first() { return 1; }
        }
        export function build(Memoize) {
          return class {
            private get second() { return Memoize; }
          };
        }
      `,
    },
    {
      name: 'an existing Memoize import is reused rather than duplicated',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          @Memoize()
          private get fetcher() { return 1; }
        }
      `,
    },
    {
      name: 'a legacy-package Memoize import is reused rather than declined',
      code: `
        import { Memoize } from 'typescript-memoize';
        export class Service {
          private get fetcher() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        export class Service {
          @Memoize()
          private get fetcher() { return 1; }
        }
      `,
    },
    {
      name: 'a Memoize binding elsewhere does not block a fix that emits an alias',
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          private get fetcher() { return Memoize; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          @Cache()
          private get fetcher() { return Memoize; }
        }
      `,
    },
    {
      name: 'a Memoize binding elsewhere does not block a fix that emits a namespace',
      code: `
        import * as Memo from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          private get fetcher() { return Memoize; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import * as Memo from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          @Memo.Memoize()
          private get fetcher() { return Memoize; }
        }
      `,
    },
    {
      // Import state is read off the AST at fix time: an ImportDeclaration
      // that trails the class in source order has not been visited when the
      // fix is computed, so a traversal flag would report it absent and emit
      // a second one.
      name: 'an import that trails the class in source order is still reused',
      code: `
        export class Service {
          private get fetcher() { return 1; }
        }
        import { Memoize } from '@blumintinc/typescript-memoize';
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        export class Service {
          @Memoize()
          private get fetcher() { return 1; }
        }
        import { Memoize } from '@blumintinc/typescript-memoize';
      `,
    },
  ],
});

// Issue #1409: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted @Memoize()
// decorator is never left without its import.
describe('enforce-memoize-getters: inline disables and the import carrier (issue #1409)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-memoize-getters';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceMemoizeGetters as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/enforce-memoize-getters-strict', {
      meta: { schema: [] },
      create: () => ({}),
    } as unknown as Rule.RuleModule);
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, 'Service.ts');
    return output;
  };

  const expectNoUnboundMemoize = (output: string) => {
    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  };

  it('carries the import on the first surviving violation', () => {
    const output = lint(`export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get alpha() {
    return {};
  }

  private get beta() {
    return {};
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get alpha() {
    return {};
  }

  @Memoize()
  private get beta() {
    return {};
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('adds neither import nor decorator when every violation is disabled', () => {
    const code = `export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get alpha() {
    return {};
  }

  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get beta() {
    return {};
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('Memoize }');
  });

  it('adds neither import nor decorator under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-memoize-getters */
export class Example {
  private get alpha() {
    return {};
  }

  private get beta() {
    return {};
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('@Memoize');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters-strict
  private get alpha() {
    return {};
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters-strict
  @Memoize()
  private get alpha() {
    return {};
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`export class Example {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-getters */
  private get alpha() {
    return {};
  }

  private get beta() {
    return {};
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-getters */

  private get gamma() {
    return {};
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Example {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-getters */
  private get alpha() {
    return {};
  }

  private get beta() {
    return {};
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-getters */

  @Memoize()
  private get gamma() {
    return {};
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`export class Example {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-getters
  private get alpha() {
    return {};
  }

  private get beta() {
    return {};
  }

  private get gamma() {
    return {};
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(2);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    expectNoUnboundMemoize(output);
  });
});

// Issue #1424: RuleTester asserts a single fix pass, while `eslint --fix`
// re-lints until the output settles. These cases run the real multi-pass fixer
// against a file that already binds `Memoize` and assert the invariant the bug
// violated: the file never gains a second declaration of that name, and the
// violation is still reported so the author resolves the clash deliberately.
describe('enforce-memoize-getters: an existing Memoize binding (issue #1424)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-memoize-getters';

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceMemoizeGetters as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const LINT_CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const lint = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts').output;

  const lintMessages = (code: string) =>
    createLinter().verify(code, LINT_CONFIG, 'Service.ts');

  const topScopeMemoizeDeclarations = (source: string) =>
    (
      source.match(
        /^(?:export\s+)?(?:const|let|var|function|class)\s+Memoize\b/gm,
      ) ?? []
    ).length + (source.match(/^import\b[^;]*\bMemoize\b[^;]*;/gm) ?? []).length;

  it('leaves a file with a module-scope const Memoize untouched', () => {
    const code = `const Memoize = 1;
export class Service {
  private get fetcher() {
    return Memoize;
  }
}
`;

    expect(lint(code)).toBe(code);
    expect(topScopeMemoizeDeclarations(lint(code))).toBe(1);
  });

  it('still reports the violation it declines to fix', () => {
    const messages = lintMessages(`const Memoize = 1;
export class Service {
  private get fetcher() {
    return Memoize;
  }
}
`);

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
  });

  it('leaves a shadowing binding alone across every pass', () => {
    const code = `export function build(Memoize) {
  return class {
    private get fetcher() {
      return Memoize;
    }
  };
}
`;

    expect(lint(code)).toBe(code);
    expect(lint(code)).not.toContain('@Memoize');
  });

  it('keeps one declaration when an unshadowed sibling carries the import', () => {
    const output = lint(`export class Outer {
  private get first() {
    return 1;
  }
}
export function build(Memoize) {
  return class {
    private get second() {
      return Memoize;
    }
  };
}
`);

    expect(topScopeMemoizeDeclarations(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
  });
});
