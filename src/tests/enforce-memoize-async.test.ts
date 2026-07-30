import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeAsync } from '../rules/enforce-memoize-async';

ruleTesterTs.run('enforce-memoize-async', enforceMemoizeAsync, {
  valid: [
    // Already decorated async method
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Method with multiple parameters (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async getData(param1: string, param2: string) {
            return await fetch(\`data/\${param1}/\${param2}\`);
          }
        }
      `,
    },
    // Non-async method (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          getData() {
            return 'data';
          }
        }
      `,
    },
    // Already decorated with aliased import
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Standalone function (should be ignored)
    {
      code: `
        async function getData() {
          return await fetch('data');
        }
      `,
    },
    // Static async method with no parameters (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Static async method with one parameter (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
    },
    // Static async method with @Memoize (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          static async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Already decorated without parentheses
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Other decorator present and also Memoize()
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          @Memoize()
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
    },
    // Async method with two params should be ignored
    {
      code: `
        class Example {
          async getData(id: string, page = 1) {
            return await fetch('data');
          }
        }
      `,
    },
    // Static async generator method should be ignored
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async *stream() {
            yield 1;
          }
        }
      `,
    },
    // Namespace import with bare @Memoize should be valid (legacy/global support)
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Namespace import with namespaced @memo.Memoize() should be valid
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @memo.Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Namespace import with namespaced @memo.Memoize should be valid
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @memo.Memoize
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Global support: @Memoize() without any imports
    {
      code: `
        class Example {
          @Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Global support: @Memoize without any imports
    {
      code: `
        class Example {
          @Memoize
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Issue #1404: every violation suppressed inline leaves the file untouched
    {
      name: 'all violations disabled inline report nothing',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a block disable covering the class suppresses everything
    {
      name: 'block disable naming this rule suppresses the whole class',
      code: `
        /* eslint-disable enforce-memoize-async */
        class Example {
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a bare block disable suppresses every rule
    {
      name: 'bare block disable suppresses the whole class',
      code: `
        /* eslint-disable */
        class Example {
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a bare line disable suppresses this rule too
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
        }
      `,
    },
  ],
  invalid: [
    // Missing decorator on async method with no parameters
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing decorator on async method with one parameter
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
    },
    // Missing decorator with aliased import
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing import on async method with no parameters
    {
      code: `
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing import with existing other imports; Memoize import should be first
    {
      code: `
        import { something } from 'lib';
        export class Example {
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { something } from 'lib';
        export class Example {
          @Memoize()
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
    },
    // Multiple async methods: add decorator to each eligible method, ignore 2+ param method
    {
      code: `
        class Example {
          async a() { return 1; }
          async b(x: string) { return x; }
          async c(x: string, y: number) { return x + y; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async a() { return 1; }
          @Memoize()
          async b(x: string) { return x; }
          async c(x: string, y: number) { return x + y; }
        }
      `,
    },
    // Parameter with default value still counts as one parameter
    {
      code: `
        class Example {
          async getData(id: string = 'x') {
            return id;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData(id: string = 'x') {
            return id;
          }
        }
      `,
    },
    // Rest parameter still counts as one parameter
    {
      code: `
        class Example {
          async getAll(...ids: string[]) {
            return ids.length;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getAll(...ids: string[]) {
            return ids.length;
          }
        }
      `,
    },
    // With other decorators present; Memoize should be inserted above others
    {
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          async compute() {
            return 1;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          async compute() {
            return 1;
          }
        }
      `,
    },
    // Reproduction: CohortIO with three async methods should all be decorated
    {
      code: `
        export class CohortIO {
          public async execute() {
            const cohorts = await this.fetchCohorts();
            if (cohorts.length === 0) { return; }
            const updates = this.buildUpdates(cohorts);
            if (updates.length === 0) { return; }
            await this.applyUpdates(updates);
          }

          private async fetchCohorts() {
            return [] as any[];
          }

          private async applyUpdates(updates: Partial<any>[]) {
            return;
          }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class CohortIO {
          @Memoize()
          public async execute() {
            const cohorts = await this.fetchCohorts();
            if (cohorts.length === 0) { return; }
            const updates = this.buildUpdates(cohorts);
            if (updates.length === 0) { return; }
            await this.applyUpdates(updates);
          }

          @Memoize()
          private async fetchCohorts() {
            return [] as any[];
          }

          @Memoize()
          private async applyUpdates(updates: Partial<any>[]) {
            return;
          }
        }
      `,
    },
    {
      name: 'repro multiple imports: prefers new package alias over legacy',
      code: `
        import { Memoize as M1 } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as M1 } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          @M2()
          async getData() { return 1; }
        }
      `,
    },
    {
      name: 'repro multiple imports: prefers new package alias over legacy Memoize',
      code: `
        import { Memoize } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          @M2()
          async getData() { return 1; }
        }
      `,
    },
    {
      name: 'repro multiple namespace imports: prefers new package namespace over legacy',
      code: `
        import * as m1 from 'typescript-memoize';
        import * as m2 from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import * as m1 from 'typescript-memoize';
        import * as m2 from '@blumintinc/typescript-memoize';
        class Example {
          @m2.Memoize()
          async getData() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1404: the import fix must ride on the first *surviving*
    // violation. A suppressed violation used to claim the carrier slot and
    // take the import down with it, emitting @Memoize() with no import.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `
        export class Recorder {
          // eslint-disable-next-line enforce-memoize-async
          public async first() { return 'a'; }

          public async second() { return 'b'; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Recorder {
          // eslint-disable-next-line enforce-memoize-async
          public async first() { return 'a'; }

          @Memoize()
          public async second() { return 'b'; }
        }
      `,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and all other decorators',
      code: `
        class Example {
          async a() { return 1; }
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
          async c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async a() { return 1; }
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
          @Memoize()
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'disable on the LAST violation keeps one import and all other decorators',
      code: `
        class Example {
          async a() { return 1; }
          async b() { return 2; }
          // eslint-disable-next-line enforce-memoize-async
          async c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
          // eslint-disable-next-line enforce-memoize-async
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `
        class Example {
          // eslint-disable-next-line no-console
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line no-console
          @Memoize()
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable with a -- description suffix suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-async -- results must not be cached
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async -- results must not be cached
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'eslint-disable-line suppresses the violation on its own line',
      code: `
        class Example {
          async a() { return 1; } // eslint-disable-line enforce-memoize-async
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async a() { return 1; } // eslint-disable-line enforce-memoize-async
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'violations after an eslint-enable are fixed and carry the import',
      code: `
        class Example {
          /* eslint-disable enforce-memoize-async */
          async a() { return 1; }
          /* eslint-enable enforce-memoize-async */
          async b() { return 2; }
          async c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          /* eslint-disable enforce-memoize-async */
          async a() { return 1; }
          /* eslint-enable enforce-memoize-async */
          @Memoize()
          async b() { return 2; }
          @Memoize()
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'suppressed first violation with Memoize already imported adds no duplicate import',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      // MethodDefinition.range covers leading decorators, so the reported
      // location is the decorator's line. A disable above the decorator is
      // therefore the one that suppresses the report, matching real ESLint.
      name: 'disable above an existing decorator suppresses the decorated method',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          @Log()
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          @Log()
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      // Mirror of the above: a disable *between* the decorator and the
      // signature targets the signature line, not the reported location, so
      // ESLint does not suppress the report and the fix still applies.
      name: 'disable between a decorator and its method does not suppress',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
        }
      `,
    },
  ],
});

// Issue #1404: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted @Memoize()
// decorator is never left without its import.
describe('enforce-memoize-async: inline disables and the import carrier (issue #1404)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-memoize-async';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceMemoizeAsync as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/enforce-memoize-async-generator', {
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
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first(): Promise<string> {
    return 'a';
  }

  public async second(): Promise<string> {
    return 'b';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first(): Promise<string> {
    return 'a';
  }

  @Memoize()
  public async second(): Promise<string> {
    return 'b';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('adds neither import nor decorator when every violation is disabled', () => {
    const code = `export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first() {
    return 'a';
  }

  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async second() {
    return 'b';
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('Memoize');
  });

  it('adds neither import nor decorator under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-memoize-async */
export class Recorder {
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('@Memoize');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async-generator
  public async first() {
    return 'a';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async-generator
  @Memoize()
  public async first() {
    return 'a';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`export class Recorder {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-async */
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-async */

  public async third() {
    return 'c';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-async */
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-async */

  @Memoize()
  public async third() {
    return 'c';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }

  public async third() {
    return 'c';
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
