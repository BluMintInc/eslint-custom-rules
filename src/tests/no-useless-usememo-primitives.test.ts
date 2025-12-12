import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { noUselessUsememoPrimitives } from '../rules/no-useless-usememo-primitives';

const typedParserOptions = {
  ecmaVersion: 2020 as const,
  sourceType: 'module' as const,
  project: path.join(__dirname, '../../tsconfig.json'),
  tsconfigRootDir: path.join(__dirname, '../..'),
  createDefaultProgram: true as const,
};

ruleTesterTs.run('no-useless-usememo-primitives', noUselessUsememoPrimitives, {
  valid: [
    {
      code: `
        const value = useMemo(() => ({ a, b }), [a, b]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const list = useMemo(() => [a, b], [a, b]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const handler = useMemo(() => () => doThing(a), [a]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const promised = useMemo(async () => 42, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const promisedBlock = useMemo(async () => { return 42; }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const iterator = useMemo(function* () { yield 1; return 1; }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const checksum = useMemo(() => computeChecksum(largeData), [largeData]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const format = (strings: TemplateStringsArray, value: string) => \`Hello \${value}\`;
        const label = useMemo(() => format\`Hello \${name}\`, [name]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/tagged-template-valid.ts',
    },
    {
      code: `
        const now = useMemo(() => Date.now(), []);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const created = useMemo(() => new Date(), []);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const nothing = otherMemo(() => 1, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const sideEffectOnly = useMemo(() => { perform(); }, [perform]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const nowText = useMemo(() => Date(), []);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const randomBytes = useMemo(() => crypto.getRandomValues(new Uint8Array(4)), []);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const seq = useMemo(() => (count++, count), [count]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const optional = useMemo(() => user?.name ?? 'Guest', [user]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const nested = (getMemo())(() => 1, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const deleted = useMemo(() => delete target.key, [target]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const tsOnlySkip = useMemo(() => flag ? 'yes' : 'no', [flag]);
      `,
      options: [{ tsOnly: true }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const typedObject = useMemo((): { a: number } => ({ a: value }), [value]);
      `,
      options: [{ tsOnly: true, ignoreCallExpressions: false }],
      parserOptions: typedParserOptions,
      filename: 'src/typed-object.ts',
    },
    {
      code: `
        const symbolValue = useMemo(() => Symbol('a'), []);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const regex = useMemo(() => /abc/i, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const heavy = useMemo(() => { const interim = compute(); return interim * 2; }, [compute]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const noop = () => {};
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const options = useMemo(() => ({ mode: 'fast' }), []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    {
      code: `
        const payload = { id: 1 };
        const memoized = useMemo(() => payload, [payload]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
  ],
  invalid: [
    {
      code: `
        const label = useMemo(() => {
          return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
        }, [isPendingToJoinTeam]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const label = (isPendingToJoinTeam ? 'Pending Response' : 'Request to Join');
      `,
    },
    {
      code: `
        const countText = useMemo(() => \`Count: \${count}\`, [count]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const countText = (\`Count: \${count}\`);
      `,
    },
    {
      code: `
        const flagA: boolean = true;
        const flagB: boolean = false;
        const isEnabled = useMemo(() => flagA && flagB, [flagA, flagB]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-and-and.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'boolean value' } }],
      output: `
        const flagA: boolean = true;
        const flagB: boolean = false;
        const isEnabled = (flagA && flagB);
      `,
    },
    {
      code: `
        const maybe: string | null = Math.random() > 0.5 ? 'yes' : null;
        const fallback = useMemo(() => maybe ?? null, [maybe]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-nullish.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const maybe: string | null = Math.random() > 0.5 ? 'yes' : null;
        const fallback = (maybe ?? null);
      `,
    },
    {
      code: `
        const price: number = 10;
        const taxRate: number = 0.1;
        const priceLabel = useMemo(() => price * taxRate, [price, taxRate]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-number.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const price: number = 10;
        const taxRate: number = 0.1;
        const priceLabel = (price * taxRate);
      `,
    },
    {
      code: `
        const constant = useMemo(() => 'static');
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'string value' } }],
      output: `
        const constant = ('static');
      `,
    },
    {
      code: `
        const combined = useMemo(() => 'a' + 'b', []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'string value' } }],
      output: `
        const combined = ('a' + 'b');
      `,
    },
    {
      code: `
        const alwaysTrue = useMemo(() => true, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'boolean value' } }],
      output: `
        const alwaysTrue = (true);
      `,
    },
    {
      code: `
        const zero = useMemo(() => 0, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'number value' } }],
      output: `
        const zero = (0);
      `,
    },
    {
      code: `
        const nothing = useMemo(() => null, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'null value' } }],
      output: `
        const nothing = (null);
      `,
    },
    {
      code: `
        const id = useMemo(() => 1n, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'bigint value' } }],
      output: `
        const id = (1n);
      `,
    },
    {
      code: `
        const disabled = useMemo(() => !isReady, [isReady]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const disabled = (!isReady);
      `,
    },
    {
      code: `
        const value = useMemo(() => undefined, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'undefined value' } }],
      output: `
        const value = (undefined);
      `,
    },
    {
      code: `
        const label = useMemo(() => computeLabel(status), [status]);
        function computeLabel(input: string): string {
          return input.toUpperCase();
        }
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: { ...typedParserOptions, ecmaFeatures: { jsx: true } },
      filename: 'src/typed-file.tsx',
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'string value' } }],
      output: `
        const label = (computeLabel(status));
        function computeLabel(input: string): string {
          return input.toUpperCase();
        }
      `,
    },
    {
      code: `
        const format = (strings: TemplateStringsArray, value: string) => \`Hello \${value}\`;
        const label = useMemo(() => format\`Hello \${name}\`, [name]);
      `,
      options: [{ ignoreCallExpressions: false }],
      parserOptions: typedParserOptions,
      filename: 'src/tagged-template-invalid.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'string value' } }],
      output: `
        const format = (strings: TemplateStringsArray, value: string) => \`Hello \${value}\`;
        const label = (format\`Hello \${name}\`);
      `,
    },
    {
      code: `
        const total = useMemo(() => value + 1, [value]);
        const value: number = 2;
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/typed-total.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive', data: { valueKind: 'number value' } }],
      output: `
        const total = (value + 1);
        const value: number = 2;
      `,
    },
    {
      code: `
        const ternary = useMemo(() => condition ? 'yes' : 'no', [condition]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const ternary = (condition ? 'yes' : 'no');
      `,
    },
    {
      code: `
        const left: boolean = true;
        const right: boolean = false;
        const fallback: string = 'fallback';
        const chained = useMemo(() => (left && right) || fallback, [left, right, fallback]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-logical.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const left: boolean = true;
        const right: boolean = false;
        const fallback: string = 'fallback';
        const chained = ((left && right) || fallback);
      `,
    },
    {
      code: `
        const count: number = 1;
        const limit: number = 2;
        const comparison = useMemo(() => count > limit, [count, limit]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-comparison.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const count: number = 1;
        const limit: number = 2;
        const comparison = (count > limit);
      `,
    },
    {
      code: `
        const bitwise = useMemo(() => ~mask, [mask]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const bitwise = (~mask);
      `,
    },
    {
      code: `
        const describe = useMemo(() => typeof value, [value]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const describe = (typeof value);
      `,
    },
    {
      code: `
        const voided = useMemo(() => void value, [value]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const voided = (void value);
      `,
    },
    {
      code: `
        const text: string = 'value';
        const coerced = useMemo(() => (text as string), [text]);
      `,
      parserOptions: typedParserOptions,
      filename: 'src/typed-coerced.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const text: string = 'value';
        const coerced = (text as string);
      `,
    },
    {
      code: `
        const symbolValue = useMemo((): symbol => Symbol('tracked'), []);
      `,
      options: [{ ignoreCallExpressions: false, ignoreSymbol: false }],
      parserOptions: typedParserOptions,
      filename: 'src/typed-symbol.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const symbolValue = (Symbol('tracked'));
      `,
    },
    {
      code: `
        const infinite = useMemo(() => Infinity, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const infinite = (Infinity);
      `,
    },
    {
      code: `
        const choose = useMemo(() => (flag ? 'yes' : 1), [flag]);
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/union-primitive.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const choose = (flag ? 'yes' : 1);
      `,
    },
  ],
});
