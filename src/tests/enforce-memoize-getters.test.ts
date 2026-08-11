import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
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
    // ------------------------------------------------------------------
    // Issue #1561: a getter that samples live external state must not be
    // reported — @Memoize() would pin the first observation for the life of
    // the instance, and the fix lands unattended under `eslint --fix`.
    // ------------------------------------------------------------------
    {
      name: 'a getter calling a Node I/O import directly is exempt',
      code: `
        import { execFileSync } from 'node:child_process';
        class PageProbe {
          private get snapshot() {
            return execFileSync('agent-browser', ['snapshot'], { encoding: 'utf8' });
          }
        }
      `,
    },
    {
      name: 'I/O one hop away behind a sibling private method is exempt',
      code: `
        import { execFileSync } from 'node:child_process';
        class PageProbe {
          private run(args: readonly string[]) {
            return execFileSync('agent-browser', [...args], { encoding: 'utf8' });
          }
          private get organizationOptions() {
            const snapshot = this.run(['snapshot', '-i']);
            return [...snapshot.matchAll(/button "([^"]+)"[^\\n]*\\[ref=(e\\d+)]/g)].flatMap((entry) => {
              const [, label, ref] = entry;
              return label !== undefined && ref !== undefined ? [{ label, ref }] : [];
            });
          }
        }
      `,
    },
    {
      name: 'a non-deterministic builtin makes the getter exempt',
      code: `
        class Example {
          private get startedAt() { return Date.now(); }
        }
      `,
    },
    {
      name: 'a multi-hop this-chain propagates impurity to the getter',
      code: `
        import { readFileSync } from 'node:fs';
        class Example {
          private readRaw() { return readFileSync('/etc/hostname', 'utf8'); }
          private normalize() { return this.readRaw().trim(); }
          private get hostname() { return this.normalize(); }
        }
      `,
    },
    {
      name: 'a chain that reaches I/O only at its far end is exempt',
      code: `
        import { execFileSync } from 'node:child_process';
        class Example {
          private get screen() { return this.a(); }
          private a() { return this.b(); }
          private b() { return this.c(); }
          private c() { return execFileSync('agent-browser', ['snapshot']); }
        }
      `,
    },
    {
      name: 'reading an impure sibling getter propagates impurity',
      code: `
        class Example {
          private get now() { return Date.now(); }
          private get elapsed() { return this.now - this.started; }
        }
      `,
    },
    {
      name: 'a process.env read makes the getter exempt',
      code: `
        class Example {
          private get endpoint() { return process.env.API_URL; }
        }
      `,
    },
    {
      name: 'a computed process.env read makes the getter exempt',
      code: `
        class Example {
          private get endpoint() { return process.env['API_URL']; }
        }
      `,
    },
    {
      name: 'Math.random makes the getter exempt',
      code: `
        class Example {
          private get jitter() { return Math.random() * 1000; }
        }
      `,
    },
    {
      name: 'a bare new Date() makes the getter exempt',
      code: `
        class Example {
          private get clock() { return new Date(); }
        }
      `,
    },
    {
      name: 'performance.now makes the getter exempt',
      code: `
        class Example {
          private get mark() { return performance.now(); }
        }
      `,
    },
    {
      name: 'crypto.randomUUID makes the getter exempt',
      code: `
        class Example {
          private get id() { return crypto.randomUUID(); }
        }
      `,
    },
    {
      name: 'process.hrtime.bigint makes the getter exempt',
      code: `
        class Example {
          private get tick() { return process.hrtime.bigint(); }
        }
      `,
    },
    {
      name: 'a namespace import of a Node I/O module is exempt',
      code: `
        import * as fs from 'node:fs';
        class Example {
          private get config() { return fs.readFileSync('config.json', 'utf8'); }
        }
      `,
    },
    {
      name: 'an unprefixed Node I/O module specifier is exempt',
      code: `
        import { execFileSync } from 'child_process';
        class Example {
          private get snapshot() { return execFileSync('agent-browser', ['snapshot']); }
        }
      `,
    },
    {
      name: 'a field-held arrow method carrying the I/O propagates impurity',
      code: `
        import { execFileSync } from 'node:child_process';
        class Example {
          private run = (args: readonly string[]) => execFileSync('agent-browser', [...args]);
          private get snapshot() { return this.run(['snapshot']); }
        }
      `,
    },
    {
      name: 'a private-name sibling method propagates impurity',
      code: `
        import { execFileSync } from 'node:child_process';
        class Example {
          #run() { return execFileSync('agent-browser', ['snapshot']); }
          private get snapshot() { return this.#run(); }
        }
      `,
    },
    {
      name: 'I/O inside a nested callback in the getter is exempt',
      code: `
        import { readFileSync } from 'node:fs';
        class Example {
          private get contents() {
            return ['a', 'b'].map((name) => readFileSync(name, 'utf8'));
          }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1945: `experimentalDecorators` — the mode the memoize package
    // requires — rejects a decorator on a `#private` member with TS1206, so
    // the rule's remedy cannot be written there. The shape is a compile error
    // on its own (TS18010: an accessibility modifier beside a private name),
    // and the fix used to deepen that into TS1206 as well.
    // ------------------------------------------------------------------
    {
      name: 'an ECMA-private getter without an accessibility modifier is ignored',
      code: `
        class Example {
          get #fetcher() { return {}; }
          public read() { return this.#fetcher; }
        }
      `,
    },
    {
      name: 'a private-name getter admits no decorator, so it is not reported',
      code: `
        class Example {
          private get #fetcher() { return {}; }
          public read() { return this.#fetcher; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1947: the same mode rejects a decorator on EVERY member of a
    // class EXPRESSION — TS1206 again, whatever the member is named and
    // wherever the decorator is written. Measured against a real `ts.Program`
    // with `experimentalDecorators: true`: each shape below compiles as
    // written and gained `TS1206: Decorators are not valid here.` the moment
    // `--fix` inserted `@Memoize()`. The remedy the message prescribes cannot
    // be written in place, so the report is withheld along with its fix.
    // ------------------------------------------------------------------
    {
      name: 'a getter in an anonymous class expression is not reported',
      code: `
        export const Service = class {
          private get fetcher() { return {}; }
        };
      `,
    },
    {
      name: 'a getter in a named class expression is not reported',
      code: `
        export const Service = class Inner {
          private get fetcher() { return {}; }
        };
      `,
    },
    {
      name: 'a getter in a class expression returned from a factory is not reported',
      code: `
        export function build() {
          return class {
            private get fetcher() { return {}; }
          };
        }
      `,
    },
    {
      name: 'a getter in a class expression passed as an argument is not reported',
      code: `
        declare function register(constructor: unknown): void;
        register(class {
          private get fetcher() { return {}; }
        });
      `,
    },
    {
      name: 'a getter in a class expression held in an object property is not reported',
      code: `
        export const registry = {
          Service: class {
            private get fetcher() { return {}; }
          },
        };
      `,
    },
    {
      name: 'a getter in a class expression held in a class property is not reported',
      code: `
        export class Outer {
          static Inner = class {
            private get fetcher() { return {}; }
          };
        }
      `,
    },
    {
      name: 'a getter in a class expression sharing its line is not reported',
      code: `
        export const Service = class { private get fetcher() { return {}; } };
      `,
    },
    {
      name: 'a class expression is silent even where the import already exists',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export const Service = class {
          private get fetcher() { return {}; }
        };
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
    // Insert import before the first non-import statement when there are no
    // imports, which lands below a directive prologue: a statement pushed under
    // an inserted import stops being a directive at all.
    {
      code: `
        'use strict';
        class Example {
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        'use strict';
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get a() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1648: a file with no import to anchor to must still keep its
    // prologue. Each case is written flush-left because the prologue's
    // meaning depends on its position in the file, which indentation of the
    // surrounding template literal would obscure.
    // ------------------------------------------------------------------
    {
      name: "the injected import lands below a 'use client' directive",
      code: `'use client';
class Example {
  private get fetcher() { return {}; }
}
`,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  private get fetcher() { return {}; }
}
`,
    },
    {
      name: 'the injected import leaves a shebang at character 0',
      code: `#!/usr/bin/env node
class Example {
  private get fetcher() { return {}; }
}
`,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `#!/usr/bin/env node
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  private get fetcher() { return {}; }
}
`,
    },
    {
      name: 'the injected import stays below a // @ts-nocheck header',
      code: `// @ts-nocheck
class Example {
  private get fetcher() { return {}; }
}
`,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `// @ts-nocheck
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  private get fetcher() { return {}; }
}
`,
    },
    {
      // The control: an anchor disabled outright would also "preserve" every
      // prologue above, so the import must still reach the top of the import
      // block when one exists.
      name: "a 'use client' file with an existing import anchors on that import",
      code: `'use client';
import { something } from 'lib';
class Example {
  private get fetcher() { return {}; }
}
`,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
import { something } from 'lib';
class Example {
  @Memoize()
  private get fetcher() { return {}; }
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
      // Written as a class DECLARATION: the shadowing decline is what this
      // case pins, and a class expression would withhold the report for the
      // unrelated reason of issue #1947, leaving the shadowing path untested.
      name: 'a shadowing parameter named Memoize withholds the fix at that site',
      code: `
        export function build(Memoize) {
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
          class Service {
            private get second() { return Memoize; }
          }
          return Service;
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
          class Service {
            private get second() { return Memoize; }
          }
          return Service;
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
    // ------------------------------------------------------------------
    // Issue #1561: the impurity exemption must stay narrow. A lazy factory,
    // a plain options object, and a pure sibling call are the shapes the rule
    // exists for, and they remain reported and fixed.
    // ------------------------------------------------------------------
    {
      name: 'a lazy factory getter is still reported',
      code: `
        class Example {
          private get fetcher() { return new FirestoreFetcher(this.ref); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return new FirestoreFetcher(this.ref); }
        }
      `,
    },
    {
      name: 'an options object built from fields is still reported',
      code: `
        class Example {
          private get options() { return { retries: this.retries, timeout: this.timeout }; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get options() { return { retries: this.retries, timeout: this.timeout }; }
        }
      `,
    },
    {
      name: 'a getter calling a pure sibling method is still reported',
      code: `
        class Example {
          private helper() { return this.base * 2; }
          private get scaled() { return this.helper(); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          private helper() { return this.base * 2; }
          @Memoize()
          private get scaled() { return this.helper(); }
        }
      `,
    },
    {
      name: 'new Date with an argument is a pure conversion and is still reported',
      code: `
        class Example {
          private get createdAt() { return new Date(this.timestamp); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get createdAt() { return new Date(this.timestamp); }
        }
      `,
    },
    {
      name: 'a call into a non-I/O import is still reported',
      code: `
        import { cloneDeep } from 'lodash';
        class Example {
          private get snapshot() { return cloneDeep(this.state); }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { cloneDeep } from 'lodash';
        class Example {
          @Memoize()
          private get snapshot() { return cloneDeep(this.state); }
        }
      `,
    },
    {
      name: 'a pure getter beside an impure one is reported and carries the import',
      code: `
        import { execFileSync } from 'node:child_process';
        class Example {
          private get snapshot() { return execFileSync('agent-browser', ['snapshot']); }
          private get fetcher() { return new FirestoreFetcher(this.ref); }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter', data: { name: 'fetcher' } },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { execFileSync } from 'node:child_process';
        class Example {
          private get snapshot() { return execFileSync('agent-browser', ['snapshot']); }
          @Memoize()
          private get fetcher() { return new FirestoreFetcher(this.ref); }
        }
      `,
    },
    {
      name: 'an impure getter in a sibling class does not exempt another class',
      code: `
        import { execFileSync } from 'node:child_process';
        class Probe {
          private get snapshot() { return execFileSync('agent-browser', ['snapshot']); }
        }
        class Service {
          private get snapshot() { return new FirestoreFetcher(this.ref); }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter', data: { name: 'snapshot' } },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { execFileSync } from 'node:child_process';
        class Probe {
          private get snapshot() { return execFileSync('agent-browser', ['snapshot']); }
        }
        class Service {
          @Memoize()
          private get snapshot() { return new FirestoreFetcher(this.ref); }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1945: the decorator attaches to the MEMBER, not to the start of
    // the line the member happens to sit on. Anchoring on the line emitted the
    // decorator before `class ...` whenever the getter was not first on its
    // line, decorating the CLASS: the getter stayed bare, the rule reported
    // again on the next pass, and `eslint --fix` stacked ten `@Memoize()`
    // before hitting its pass cap. Every case below carries an explicit
    // `output`, and the convergence describe block re-lints each output.
    // ------------------------------------------------------------------
    {
      name: 'a single-line class body decorates the getter, not the class',
      code: `class UserAccount { private get isLocked() { return true; } }`,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class UserAccount { @Memoize() private get isLocked() { return true; } }`,
    },
    {
      name: 'a single-line class body with two getters decorates both',
      code: `class UserAccount { private get a() { return 1; } private get b() { return 2; } }`,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class UserAccount { @Memoize() private get a() { return 1; } @Memoize() private get b() { return 2; } }`,
    },
    {
      name: 'a getter sharing its line with an earlier getter is decorated in place',
      code: `
        class UserAccount {
          private get a() { return 1; } private get b() { return 2; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class UserAccount {
          @Memoize()
          private get a() { return 1; } @Memoize() private get b() { return 2; }
        }
      `,
    },
    {
      name: 'a getter sharing its line with an earlier property is decorated in place',
      code: `
        class UserAccount {
          private locked = 1; private get isLocked() { return this.locked; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class UserAccount {
          private locked = 1; @Memoize() private get isLocked() { return this.locked; }
        }
      `,
    },
    {
      name: 'a getter whose own line starts with a comment keeps the comment in place',
      code: `
        class UserAccount {
          /* lazy */ private get isLocked() { return true; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class UserAccount {
          /* lazy */ @Memoize() private get isLocked() { return true; }
        }
      `,
    },
    {
      name: 'an existing decorator sharing the getter line still owns the line',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class UserAccount {
          @Log() private get isLocked() { return true; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class UserAccount {
          @Memoize()
          @Log() private get isLocked() { return true; }
        }
      `,
    },
    {
      name: 'a getter whose modifiers span lines keeps the indentation of its first line',
      code: `
        class UserAccount {
          private get
          isLocked() { return true; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class UserAccount {
          @Memoize()
          private get
          isLocked() { return true; }
        }
      `,
    },
    {
      name: 'a getter indented with tabs keeps its own indentation',
      code: 'class UserAccount {\n\t\tprivate get isLocked() { return true; }\n}',
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output:
        "import { Memoize } from '@blumintinc/typescript-memoize';\nclass UserAccount {\n\t\t@Memoize()\n\t\tprivate get isLocked() { return true; }\n}",
    },
    // ------------------------------------------------------------------
    // Issue #1947: the class-EXPRESSION decline must not spread to class
    // DECLARATIONS, which take decorators in every position TypeScript
    // accepts a class in. Each of these compiled clean before and after
    // `--fix` under a real `ts.Program` with `experimentalDecorators: true`.
    // ------------------------------------------------------------------
    {
      name: 'a class declaration nested in a function is still reported and fixed',
      code: `
        export function build() {
          class Service {
            private get fetcher() { return {}; }
          }
          return Service;
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export function build() {
          class Service {
            @Memoize()
            private get fetcher() { return {}; }
          }
          return Service;
        }
      `,
    },
    {
      name: 'a class declaration inside a class expression method is still reported and fixed',
      code: `
        export const Outer = class {
          public build() {
            class Service {
              private get fetcher() { return {}; }
            }
            return Service;
          }
        };
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export const Outer = class {
          public build() {
            class Service {
              @Memoize()
              private get fetcher() { return {}; }
            }
            return Service;
          }
        };
      `,
    },
    {
      name: 'an anonymous default-exported class is a declaration, so it is still fixed',
      code: `
        export default class {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export default class {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    {
      name: 'a class declaration inside a block is still reported and fixed',
      code: `
        {
          class Service {
            private get fetcher() { return {}; }
          }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        {
          class Service {
            @Memoize()
            private get fetcher() { return {}; }
          }
        }
      `,
    },
    {
      name: 'a declaration is still fixed while a sibling class expression stays silent',
      code: `
        export class Outer {
          private get first() { return 1; }
        }
        export const Inner = class {
          private get second() { return 2; }
        };
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Outer {
          @Memoize()
          private get first() { return 1; }
        }
        export const Inner = class {
          private get second() { return 2; }
        };
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
  class Service {
    private get fetcher() {
      return Memoize;
    }
  }
  return Service;
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
  class Service {
    private get second() {
      return Memoize;
    }
  }
  return Service;
}
`);

    expect(topScopeMemoizeDeclarations(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
  });
});

// Issue #1945: RuleTester applies a single fix pass, so it cannot see whether
// `eslint --fix` settles. These cases run the real multi-pass fixer and assert
// the invariant the bug violated: re-linting the fixed output reports nothing,
// which is the only spelling that catches an even-length cycle as well as the
// pass-cap runaway the bug produced (ten `@Memoize()` stacked on the CLASS).
describe('enforce-memoize-getters: the fix converges wherever the getter sits (issue #1945)', () => {
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
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts');

  const expectConverges = (code: string) => {
    const first = fix(code);
    // Re-running the fixer on its own output is the detector: comparing the two
    // strings would call an even-length cycle converged.
    const refixed = fix(first.output);
    expect(refixed.fixed).toBe(false);
    return first.output;
  };

  it('decorates the getter inside a single-line class body exactly once', () => {
    const output = expectConverges(
      'class UserAccount { private get isLocked() { return true; } }\n',
    );

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
class UserAccount { @Memoize() private get isLocked() { return true; } }
`);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    // The decorator belongs to the getter: nothing sits between the two, and
    // the class keeps none of its own.
    expect(output).not.toMatch(/@Memoize\(\)\s*(?:export\s+)?class\b/);
  });

  it('decorates each getter of a shared line exactly once', () => {
    const output = expectConverges(
      'class UserAccount { private get a() { return 1; } private get b() { return 2; } }\n',
    );

    expect(output.match(/@Memoize\(\) private get/g)).toHaveLength(2);
    expect(output).not.toMatch(/@Memoize\(\)\s*(?:export\s+)?class\b/);
  });

  it('converges on a getter that shares its line with a property', () => {
    const output = expectConverges(`class UserAccount {
  private locked = 1; private get isLocked() { return this.locked; }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(
      'private locked = 1; @Memoize() private get isLocked()',
    );
  });

  it('converges on the multi-line spelling without changing its layout', () => {
    const output = expectConverges(`class UserAccount {
  private get isLocked() {
    return true;
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
class UserAccount {
  @Memoize()
  private get isLocked() {
    return true;
  }
}
`);
  });

  it('leaves a private-name getter untouched, since no decorator may apply', () => {
    const code = `class UserAccount {
  private get #isLocked() {
    return true;
  }
  public read() {
    return this.#isLocked;
  }
}
`;

    const first = fix(code);

    expect(first.fixed).toBe(false);
    expect(first.output).toBe(code);
    expect(createLinter().verify(code, LINT_CONFIG, 'Service.ts')).toHaveLength(
      0,
    );
  });

  it('still reaches a fixpoint that carries a decorator (positive control)', () => {
    // A run that fixed nothing would satisfy `refixed.fixed === false`
    // vacuously, so the corpus above must be shown to rewrite its input.
    const first = fix(
      'class UserAccount { private get isLocked() { return true; } }\n',
    );

    expect(first.fixed).toBe(true);
    expect(first.output).toContain('@Memoize()');
  });
});

// Issue #1947: the class-expression carve-out is a claim about the COMPILER,
// and no ESLint-level assertion can check it. `RuleTester` never type-checks,
// and the class-expression cases above are `valid`, so they produce no fix
// pair for `fixer-type-safety` to compile — the whole suite would stay green
// with the carve-out removed and `--fix` emitting TS1206 again. These cases
// compile each shape under a real `ts.Program` with `experimentalDecorators:
// true` and assert differentially: the fixed text must carry no diagnostic its
// input did not already carry. An absolute count would only measure how many
// identifiers a fragment leaves undefined.
describe('enforce-memoize-getters: `--fix` leaves every class shape compiling (issue #1947)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-memoize-getters';
  const FILENAME = '/memoize/Service.ts';
  const MEMOIZE_STUB = '/memoize/typescript-memoize.d.ts';
  const MEMOIZE_STUB_TEXT =
    'export declare function Memoize(...args: unknown[]): MethodDecorator;\n';

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
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

  /**
   * `noLib` keeps each program to two source files, which is what makes a
   * per-shape compile affordable here; the lib types are absent from the input
   * and the output alike, so their diagnostics cancel in the differential. The
   * memoize package resolves to an in-memory stub so that the import the fixer
   * injects cannot manufacture a TS2307 the input lacked and mask the
   * diagnostic actually under test.
   */
  const compilerOptions: ts.CompilerOptions = {
    experimentalDecorators: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    noLib: true,
    types: [],
  };

  const diagnosticsOf = (source: string): string[] => {
    const files = new Map<string, string>([
      [FILENAME, source],
      [MEMOIZE_STUB, MEMOIZE_STUB_TEXT],
    ]);
    const sourceFiles = new Map(
      [...files].map(([name, text]) => [
        name,
        ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true),
      ]),
    );
    const host: ts.CompilerHost = {
      getSourceFile: (name) => sourceFiles.get(name),
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => undefined,
      getCurrentDirectory: () => '/memoize',
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (name) => files.has(name),
      readFile: (name) => files.get(name),
      resolveModuleNames: (moduleNames) =>
        moduleNames.map((name) =>
          name === '@blumintinc/typescript-memoize' ||
          name === 'typescript-memoize'
            ? {
                resolvedFileName: MEMOIZE_STUB,
                extension: ts.Extension.Dts,
                isExternalLibraryImport: true,
              }
            : undefined,
        ),
    };
    const program = ts.createProgram([FILENAME], compilerOptions, host);
    const file = program.getSourceFile(FILENAME);
    if (!file) {
      throw new Error('the source under test is missing from the program');
    }
    // TS1206 is a grammar check the CHECKER runs, so it reaches neither
    // `getSyntacticDiagnostics` nor a `transpileModule` round trip; reading
    // both buckets is what makes it visible.
    return [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ].map((diagnostic) => `TS${diagnostic.code}`);
  };

  const introducedBy = (before: string, after: string): string[] => {
    const carried = diagnosticsOf(before);
    return diagnosticsOf(after).filter((code, index, all) => {
      const seenBefore = carried.filter((entry) => entry === code).length;
      const seenHere = all.slice(0, index + 1).filter((e) => e === code).length;
      return seenHere > seenBefore;
    });
  };

  it('proves the premise: a decorator inside a class expression is TS1206', () => {
    // The harness itself needs a control, or a compile step that silently saw
    // nothing would certify every shape below as clean. Written by hand, the
    // very edit the fixer used to make is rejected — and the same decorator on
    // the same member of a class DECLARATION is accepted.
    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export const Service = class {
  @Memoize()
  private get fetcher() { return 1; }
};
`),
    ).toContain('TS1206');

    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Service {
  @Memoize()
  private get fetcher() { return 1; }
}
`),
    ).not.toContain('TS1206');
  });

  // Spelled out rather than composed from a shared body: a mismatched brace
  // would make the fixture a parse error, and an unparseable fixture reports
  // nothing — which is indistinguishable from the silence under test. The
  // `verify` assertion below counts the parse error too, so this cannot pass
  // vacuously.
  const CLASS_EXPRESSIONS: [string, string][] = [
    [
      'anonymous, bound to a const',
      'export const Service = class {\n  private get fetcher() { return 1; }\n};\n',
    ],
    [
      'named',
      'export const Service = class Inner {\n  private get fetcher() { return 1; }\n};\n',
    ],
    [
      'returned from a factory',
      'export function build() {\n  return class {\n    private get fetcher() { return 1; }\n  };\n}\n',
    ],
    [
      'passed as an argument',
      'declare function use(c: unknown): void;\nuse(class {\n  private get fetcher() { return 1; }\n});\n',
    ],
    [
      'held in an object property',
      'export const registry = {\n  Service: class {\n    private get fetcher() { return 1; }\n  },\n};\n',
    ],
    [
      'held in a class property',
      'export class Outer {\n  static Inner = class {\n    private get fetcher() { return 1; }\n  };\n}\n',
    ],
    [
      'written on a single line',
      'export const Service = class { private get fetcher() { return 1; } };\n',
    ],
  ];

  it.each(CLASS_EXPRESSIONS)(
    'a class expression %s is silent and left byte-for-byte alone',
    (_name, code) => {
      expect(createLinter().verify(code, LINT_CONFIG, FILENAME)).toHaveLength(
        0,
      );

      const first = fix(code);

      expect(first.fixed).toBe(false);
      expect(first.output).toBe(code);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  const CLASS_DECLARATIONS: [string, string][] = [
    [
      'at the top level',
      'export class Service {\n  private get fetcher() { return 1; }\n}\n',
    ],
    [
      'nested in a function',
      'export function build() {\n  class Service {\n    private get fetcher() { return 1; }\n  }\n  return Service;\n}\n',
    ],
    [
      'nested in a class expression method',
      'export const Outer = class {\n  public build() {\n    class Service {\n      private get fetcher() { return 1; }\n    }\n    return Service;\n  }\n};\n',
    ],
    [
      'anonymous and default-exported',
      'export default class {\n  private get fetcher() { return 1; }\n}\n',
    ],
    [
      'on a single line',
      'export class Service { private get fetcher() { return 1; } }\n',
    ],
  ];

  it.each(CLASS_DECLARATIONS)(
    'a class declaration %s is still decorated, converges, and still compiles',
    (_name, code) => {
      const first = fix(code);

      expect(first.fixed).toBe(true);
      expect(first.output).toContain('@Memoize()');
      // Re-running the fixer on its own output is the convergence detector:
      // comparing the two strings would call an even-length cycle converged.
      expect(fix(first.output).fixed).toBe(false);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  it('would have caught the bug: the pre-fix edit introduces TS1206', () => {
    // The mutation this guard exists to detect, applied by hand: had the rule
    // kept decorating a class expression, `introducedBy` would have returned
    // exactly this, so the assertions above are not vacuous.
    const before = `export const Service = class {
  private get fetcher() { return 1; }
};
`;
    const after = `import { Memoize } from '@blumintinc/typescript-memoize';
export const Service = class {
  @Memoize()
  private get fetcher() { return 1; }
};
`;

    expect(introducedBy(before, after)).toEqual(['TS1206']);
  });
});
