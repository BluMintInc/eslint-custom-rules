import path from 'path';
import { Linter, Rule } from 'eslint';
import * as prettier from 'prettier';
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
        const uuid = useMemo(() => crypto.randomUUID(), []);
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
    {
      code: `
        const unionWithObject = useMemo(() => (flag ? 'yes' : { a: 1 }), [flag]);
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/union-non-primitive.ts',
    },
    {
      code: `
        const voidValue = useMemo(() => console.log('a'), []);
      `,
      options: [{ tsOnly: true, ignoreCallExpressions: false }],
      parserOptions: typedParserOptions,
      filename: 'src/void-value.ts',
    },
    {
      code: `
        const intersectionValue = useMemo(() => ({} as { a: number } & { b: number }), []);
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/intersection-value.ts',
    },
    {
      code: `
        function MyComponent<T>(props: { value: string | T }) {
          const x = useMemo(() => props.value, [props.value]);
        }
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/union-type-param.ts',
    },
    {
      code: `
        const sym = useMemo(() => Symbol('a'), []);
      `,
      options: [{ tsOnly: true, ignoreCallExpressions: false }],
      parserOptions: typedParserOptions,
      filename: 'src/symbol-ignored.ts',
    },
    // A line comment between `return` and its argument triggers automatic
    // semicolon insertion: the callback returns undefined and the primitive
    // below is an unreachable expression statement, so the block holds two
    // statements. The memoized value is not that primitive, and inlining it
    // would change what the hook produces, so the rule stays silent. The
    // block-comment spelling of the same position (the `spaced` fixture below)
    // suffers no interruption and is reported.
    {
      code: `
        const interrupted = useMemo(() => {
          return // keep this rationale
          42;
        }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
    // A comma sequence is a side effect wearing a value, so the rule never
    // reports it and the emission never has to hold one together.
    {
      code: `
        const last = useMemo(() => (first(), 2), []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },
  ],
  invalid: [
    {
      code: `
        const unionWithAny = useMemo(() => (flag ? 'yes' : (undefined as any)), [flag]);
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/union-any.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const unionWithAny = flag ? 'yes' : (undefined as any);
      `,
    },
    {
      code: `
        const anyValue = useMemo(() => (undefined as any), []);
      `,
      options: [{ tsOnly: true }],
      parserOptions: typedParserOptions,
      filename: 'src/any-value.ts',
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const anyValue = undefined as any;
      `,
    },
    {
      code: `
        const label = useMemo(() => {
          return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
        }, [isPendingToJoinTeam]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const label = isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
      `,
    },
    {
      code: `
        const countText = useMemo(() => \`Count: \${count}\`, [count]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const countText = \`Count: \${count}\`;
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'boolean value' },
        },
      ],
      output: `
        const flagA: boolean = true;
        const flagB: boolean = false;
        const isEnabled = flagA && flagB;
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
        const fallback = maybe ?? null;
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
        const priceLabel = price * taxRate;
      `,
    },
    {
      code: `
        const constant = useMemo(() => 'static');
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
      output: `
        const constant = 'static';
      `,
    },
    {
      code: `
        const combined = useMemo(() => 'a' + 'b', []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
      output: `
        const combined = 'a' + 'b';
      `,
    },
    {
      code: `
        const alwaysTrue = useMemo(() => true, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'boolean value' },
        },
      ],
      output: `
        const alwaysTrue = true;
      `,
    },
    {
      code: `
        const zero = useMemo(() => 0, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'number value' },
        },
      ],
      output: `
        const zero = 0;
      `,
    },
    {
      code: `
        const nothing = useMemo(() => null, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'null value' },
        },
      ],
      output: `
        const nothing = null;
      `,
    },
    {
      code: `
        const id = useMemo(() => 1n, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'bigint value' },
        },
      ],
      output: `
        const id = 1n;
      `,
    },
    {
      code: `
        const disabled = useMemo(() => !isReady, [isReady]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const disabled = !isReady;
      `,
    },
    {
      code: `
        const value = useMemo(() => undefined, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'undefined value' },
        },
      ],
      output: `
        const value = undefined;
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
      output: `
        const label = computeLabel(status);
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
      output: `
        const format = (strings: TemplateStringsArray, value: string) => \`Hello \${value}\`;
        const label = format\`Hello \${name}\`;
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'number value' },
        },
      ],
      output: `
        const total = value + 1;
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
        const ternary = condition ? 'yes' : 'no';
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
        const chained = (left && right) || fallback;
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
        const comparison = count > limit;
      `,
    },
    {
      code: `
        const bitwise = useMemo(() => ~mask, [mask]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const bitwise = ~mask;
      `,
    },
    {
      code: `
        const describe = useMemo(() => typeof value, [value]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const describe = typeof value;
      `,
    },
    {
      code: `
        const voided = useMemo(() => void value, [value]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const voided = void value;
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
        const coerced = text as string;
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
        const symbolValue = Symbol('tracked');
      `,
    },
    {
      code: `
        const infinite = useMemo(() => Infinity, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const infinite = Infinity;
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
        const choose = flag ? 'yes' : 1;
      `,
    },
    // Issue #1591: inlining must not destroy the eslint-disable-next-line
    // directive inside the callback, which would silently re-enable the
    // suppressed rule on the surviving ternary. The directive is carried onto
    // the line above the inlined expression, so it still covers the ternary it
    // was written for.
    {
      code: `
function useJoinLabel(isPendingToJoinTeam: boolean) {
  const label = useMemo(() => {
    // eslint-disable-next-line no-restricted-syntax
    return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
  }, [isPendingToJoinTeam]);
  return label;
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function useJoinLabel(isPendingToJoinTeam: boolean) {
  const label =
    // eslint-disable-next-line no-restricted-syntax
    isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
  return label;
}
`,
    },
    // A block-comment eslint-disable-next-line targets the line after the one
    // it ends on, so it may not share a line with the expression it guards.
    {
      code: `
        const guarded = useMemo(() => {
          /* eslint-disable-next-line no-restricted-syntax */
          return flag ? 'yes' : 'no';
        }, [flag]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const guarded =
          /* eslint-disable-next-line no-restricted-syntax */
          flag ? 'yes' : 'no';
      `,
    },
    // A non-directive block comment before the return carries onto the same
    // line, since nothing about it is bound to the line it occupied.
    {
      code: `
        const total = useMemo(() => {
          /* documents why the offset applies */
          return 2 + 1;
        }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const total = /* documents why the offset applies */ 2 + 1;
      `,
    },
    // A line comment before the return keeps a line of its own, because
    // folding it onto the expression would comment the expression out.
    {
      code: `
        const offset = useMemo(() => {
          // explains the offset
          return 2 + 1;
        }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const offset =
          // explains the offset
          2 + 1;
      `,
    },
    // A comment between the arrow and an expression body sits outside the
    // returned expression's range, so it is carried rather than dropped.
    {
      code: `
        const answer = useMemo(() => /* keep this rationale */ 42, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const answer = /* keep this rationale */ 42;
      `,
    },
    // The same position in line-comment form, which forces the expression onto
    // the following line.
    //
    // The body is parenthesized on purpose. Without the parentheses this
    // fixture is a landmine for any corpus sweep that respells a concise arrow
    // as `{ return <body>; }`: ASI ends the `return` at the line comment, so
    // the respelling returns undefined and evaluates the primitive as dead
    // code. The parentheses keep `return (` on one line, which makes the
    // respelling mean what the original means.
    {
      code: `
        const rationale = useMemo(() => ( // keep this rationale
          42), []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const rationale =
          // keep this rationale
          42;
      `,
    },
    // A comment between `return` and its argument sits inside the return
    // statement but still outside the expression, so it is carried too.
    {
      code: `
        const spaced = useMemo(() => {
          return /* inline rationale */ 3 + 4;
        }, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const spaced = /* inline rationale */ 3 + 4;
      `,
    },
    // A comment inside the dependency array outlives the array it annotated.
    {
      code: `
        const doubled = useMemo(() => 2 * 2, [/* deliberately empty */]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const doubled = 2 * 2 /* deliberately empty */;
      `,
    },
    // A comment sitting immediately before the dependency array.
    {
      code: `
        const tripled = useMemo(() => 3 * 3, /* no dependencies */ []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const tripled = 3 * 3 /* no dependencies */;
      `,
    },
    // A comment ahead of the callback, before any of the machinery it
    // documents.
    {
      code: `
        const quoted = useMemo(/* why memoized */ () => 'value', []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const quoted = /* why memoized */ 'value';
      `,
    },
    // A comment after the return statement stays on the expression's side of
    // it, so the emission ends in a line comment while the source semicolon
    // still stands on that line. The parentheses are what let the break the
    // comment needs fall before the semicolon rather than moving it.
    {
      code: `
        const flagged = useMemo(() => {
          return !value; // trailing note
        }, [value]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const flagged = (!value // trailing note
        );
      `,
    },
    // #1877: a comment appended to the line the report lands on sits inside
    // the call, and the fix must still fire and produce the transform it
    // produces without the comment.
    {
      code: `
        const label = useMemo(() => { // fidelity
          return isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
        }, [isPendingToJoinTeam]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const label =
          // fidelity
          isPendingToJoinTeam ? 'Pending Response' : 'Request to Join';
      `,
    },
    // A trailing line comment after the whole statement is outside the call,
    // so the transform is the one the uncommented source gets.
    {
      code: `
        const zero = useMemo(() => 0, []); // trailing note
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const zero = 0; // trailing note
      `,
    },
    // The same, in block-comment form.
    {
      code: `
        const one = useMemo(() => 1, []); /* trailing note */
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const one = 1; /* trailing note */
      `,
    },
    // A leading comment on the statement is likewise untouched.
    {
      code: `
        // why this value matters
        const two = useMemo(() => 2, []);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        // why this value matters
        const two = 2;
      `,
    },
    // Every stranded position at once: each comment keeps the side of the
    // expression it was written on, and the line breaks fall only where a
    // comment demands one.
    {
      code: `
        const label = useMemo(() => { // opening note
          /* second */
          return flag ? 'yes' : 'no'; // trailing note
        }, [flag] /* deps note */);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const label =
          // opening note
          /* second */ flag ? 'yes' : 'no' // trailing note
          /* deps note */;
      `,
    },
    // The carried comments are anchored to the line the call opens on, and sit
    // one level in from it because the line is already open: what follows is a
    // continuation, which is the depth prettier gives such a line.
    {
      code: `
        render(useMemo(() => {
          // nested note
          return count > 0;
        }, [count]));
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        render(
          // nested note
          count > 0);
      `,
    },
    // Comments inside the returned expression itself survive verbatim in the
    // replacement text, so the autofix still applies.
    {
      code: `
        const label = useMemo(() => (flag ? /* fallback */ 'yes' : 'no'), [flag]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const label = flag ? /* fallback */ 'yes' : 'no';
      `,
    },
    // A comment inside the expression and one outside it in the same call:
    // the first rides along in the expression's own text, the second is
    // carried.
    {
      code: `
        const mixed = useMemo(() => {
          /* outside */
          return flag ? /* inside */ 'yes' : 'no';
        }, [flag]);
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
        const mixed = /* outside */ flag ? /* inside */ 'yes' : 'no';
      `,
    },
    // #1894: unwrapping the file's last useMemo call strands the import that
    // bound it, so the same fix drops the specifier it just orphaned.
    {
      code: `
import { useMemo } from 'react';

export const useThing = () => {
  return useMemo(() => 1, [{ a: 1 }, 2]);
};
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `

export const useThing = () => {
  return 1;
};
`,
    },
    // A surviving useMemo call keeps the import: over-eager removal breaks the
    // file outright, where a stranded import only fails a lint rule.
    {
      code: `
import { useMemo } from 'react';

export const useCount = () => useMemo(() => 1, []);
export const useConfig = () => useMemo(() => ({ a: 1 }), []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import { useMemo } from 'react';

export const useCount = () => 1;
export const useConfig = () => useMemo(() => ({ a: 1 }), []);
`,
    },
    // Two unwraps in one file: judged one at a time neither is the binding's
    // last use, so the rewrites ship as ONE fix and the import goes with them.
    {
      code: `
import { useMemo } from 'react';

export const useA = () => useMemo(() => 1, []);
export const useB = () => useMemo(() => 2, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        { messageId: 'uselessUseMemoPrimitive' },
        { messageId: 'uselessUseMemoPrimitive' },
      ],
      output: `

export const useA = () => 1;
export const useB = () => 2;
`,
    },
    // A call whose useMemo binding is imported under an alias: the specifier
    // that goes is the one the call resolves to, alias clause included.
    {
      code: `
import { useMemoized as useMemo } from './hooks';

export const useA = () => useMemo(() => 1, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `

export const useA = () => 1;
`,
    },
    // Losing the only named specifier next to a surviving default takes the
    // braces with it rather than leaving `import React, {} from 'react'`.
    {
      code: `
import React, { useMemo } from 'react';

export const useA = () => useMemo(() => 1, []);
export const Wrapper = React.Fragment;
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import React from 'react';

export const useA = () => 1;
export const Wrapper = React.Fragment;
`,
    },
    // A namespace call unbinds the namespace, since the member expression is
    // the only reference the deleted span carried.
    {
      code: `
import * as React from 'react';

export const useA = () => React.useMemo(() => 1, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `

export const useA = () => 1;
`,
    },
    // The namespace survives when anything else reads it.
    {
      code: `
import * as React from 'react';

export const useA = () => React.useMemo(() => 1, []);
export const Wrapper = React.Fragment;
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import * as React from 'react';

export const useA = () => 1;
export const Wrapper = React.Fragment;
`,
    },
    // The initializer is MOVED, not deleted, so an import it reads survives.
    {
      code: `
import { useMemo } from 'react';
import { LIMIT } from './constants';

export const useA = () => useMemo(() => LIMIT > 0, [LIMIT]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import { LIMIT } from './constants';

export const useA = () => LIMIT > 0;
`,
    },
    // The dependency array IS deleted, so an import read only from there is
    // unbound by the same edit.
    {
      code: `
import { useMemo } from 'react';
import { LIMIT } from './constants';

export const useA = () => useMemo(() => 1, [LIMIT]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `

export const useA = () => 1;
`,
    },
    // A useMemo call inside a nested function keeps the import alive, even
    // though the reported call is the outer one.
    {
      code: `
import { useMemo } from 'react';

export const useThing = () => {
  const nested = () => useMemo(() => ({ a: 1 }), []);
  return { flag: useMemo(() => true, []), nested };
};
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import { useMemo } from 'react';

export const useThing = () => {
  const nested = () => useMemo(() => ({ a: 1 }), []);
  return { flag: true, nested };
};
`,
    },
    // A suppressed sibling never rewrites, so its reference still counts and
    // the import stays: the batch may only be judged against edits that land.
    {
      code: `
import { useMemo } from 'react';

// eslint-disable-next-line no-useless-usememo-primitives
export const useA = () => useMemo(() => 1, []);
export const useB = () => useMemo(() => 2, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import { useMemo } from 'react';

// eslint-disable-next-line no-useless-usememo-primitives
export const useA = () => useMemo(() => 1, []);
export const useB = () => 2;
`,
    },
    // The unwrap would leave a local const unreferenced, and a local is not
    // something the import planner may rewrite, so the whole fix declines —
    // a report without a fix beats a file that fails `noUnusedLocals`.
    {
      code: `
import { useMemo } from 'react';

const threshold = 3;
export const useA = () => useMemo(() => 'fixed', [threshold]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: null,
    },
    // A comment among the specifiers makes the removal unsafe to compute, and
    // half a fix is worse than none.
    {
      code: `
import { /* keep */ useMemo } from 'react';

export const useA = () => useMemo(() => 1, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: null,
    },
    // Nested reports whose edits enclose one another cannot both ship in one
    // fix, so the enclosing rewrite wins and the inner one is left for the
    // next pass — the import is judged against the edits that actually land.
    {
      code: `
import { useMemo } from 'react';

export const useA = () => useMemo(() => 1, [useMemo(() => 2, [])]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [
        { messageId: 'uselessUseMemoPrimitive' },
        { messageId: 'uselessUseMemoPrimitive' },
      ],
      output: `

export const useA = () => 1;
`,
    },
    // A require-bound useMemo is not an import specifier, so the unwrap that
    // strands it declines rather than guessing at the declaration.
    {
      code: `
const { useMemo } = require('react');

export const useA = () => useMemo(() => 1, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: null,
    },
    // The emission carries no parentheses the position it lands in does not
    // ask for: prettier deletes a redundant pair, so a file this fixer touches
    // would fail `prettier --check` on parentheses that changed nothing
    // (#2071).
    {
      code: `
import { useMemo } from 'react';

export const useThing = () => useMemo(() => 1, []);
export const useOther = () => useMemo(() => ({ a: 1 }), []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
import { useMemo } from 'react';

export const useThing = () => 1;
export const useOther = () => useMemo(() => ({ a: 1 }), []);
`,
    },
    {
      code: `
export const useGreeting = () => useMemo(() => 'hello', []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
export const useGreeting = () => 'hello';
`,
    },
    {
      code: `
export const useKind = () => useMemo(() => typeof value, [value]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
export const useKind = () => typeof value;
`,
    },
    // A conditional as a concise arrow body keeps its parentheses: prettier
    // writes them back there, so dropping them is as unformatted as an
    // unnecessary pair anywhere else.
    {
      code: `
export const useLabel = (isPending: boolean) =>
  useMemo(() => (isPending ? 'a' : 'b'), [isPending]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
export const useLabel = (isPending: boolean) =>
  (isPending ? 'a' : 'b');
`,
    },
    // The call is the object of a member access, which binds tighter than the
    // conditional replacing it.
    {
      code: `
const width = useMemo(() => (isWide ? 'wide' : 'narrow'), [isWide]).length;
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const width = (isWide ? 'wide' : 'narrow').length;
`,
    },
    // `1.toFixed(2)` does not parse: the dot a member access needs is the one
    // the number would take for its fraction.
    {
      code: `
const rounded = useMemo(() => 1, []).toFixed(2);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const rounded = (1).toFixed(2);
`,
    },
    // `??` beside `||` is a SyntaxError, whatever the precedences suggest.
    {
      code: `
const chosen = useMemo(() => 1 ?? 2, []) || fallback;
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const chosen = (1 ?? 2) || fallback;
`,
    },
    // Two minus signs meeting at the seam lex as a decrement operator.
    {
      code: `
const negated = -useMemo(() => -1, []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const negated = -(-1);
`,
    },
    // `**` refuses a unary base outright: `-1 ** 2` is a SyntaxError.
    {
      code: `
const scaled = useMemo(() => -1, []) ** 2;
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const scaled = (-1) ** 2;
`,
    },
    // An `in` operator inside a `for` header is read as the loop's own.
    {
      code: `
for (let present = useMemo(() => 'k' in obj, []); present; present = false) {
  step();
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
for (let present = ('k' in obj); present; present = false) {
  step();
}
`,
    },
    // A string in statement position is a directive rather than an expression.
    {
      code: `
useMemo(() => 'hello', []);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
('hello');
`,
    },
    // A carried comment that folds onto the expression's line adds no line
    // terminator, so it leaves the parenthesisation to the landing position.
    {
      code: `
function useAnswer() {
  return useMemo(() => /* the API caps the page size */ 42, []);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function useAnswer() {
  return /* the API caps the page size */ 42;
}
`,
    },
    // The shape #2071 reports, and the dominant real-world one: with nothing
    // stranded inside the call the emission carries no line terminator, so a
    // restricted production has nothing to catch and the `return` takes the
    // expression bare.
    //
    // It is also the ANCHOR for the `no-useless-usememo-primitives ::
    // TRANSFORM_DIVERGED` entry in `src/tests/commentFidelityBaseline.ts`. The
    // comment-fidelity probe appends a marker to the reported line, which here
    // is the line the call opens on, so the perturbed variant strands an
    // own-line comment in a restricted production and IS parenthesised while
    // this one is not. Both guards read that entry, and the own-corpus one
    // fails any entry its corpus stops reproducing — this pair is what keeps
    // the entry honest.
    {
      code: `
export function useNullValue() {
  return useMemo(() => {
    return null;
  }, []);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
export function useNullValue() {
  return null;
}
`,
    },
    // A carried comment that owns its line keeps the parentheses: after
    // `return`, the line terminator it introduces is a restricted production,
    // and bare the function would return `undefined` instead (#1963).
    {
      code: `
function useLabel(flag: boolean) {
  return useMemo(() => {
    // eslint-disable-next-line no-restricted-syntax
    return flag ? 'a' : 'b';
  }, [flag]);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function useLabel(flag: boolean) {
  return (
  // eslint-disable-next-line no-restricted-syntax
  flag ? 'a' : 'b');
}
`,
    },
    // The same in a plain line comment, so the parentheses are pinned to the
    // POSITION rather than to the directive that first exposed it. A `return`
    // reads a line terminator ahead of its argument as the end of the
    // statement, so bare, the function hands back `undefined` and the ternary
    // stands as dead code (#1963).
    {
      code: `
function pickLabel(flag: boolean) {
  return useMemo(() => {
    // documents the fallback
    return flag ? 'a' : 'b';
  }, [flag]);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function pickLabel(flag: boolean) {
  return (
  // documents the fallback
  flag ? 'a' : 'b');
}
`,
    },
    // `throw` reads its argument under the same restriction.
    {
      code: `
function reject(flag: boolean) {
  throw useMemo(() => {
    // documents the message
    return flag ? 'a' : 'b';
  }, [flag]);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function reject(flag: boolean) {
  throw (
  // documents the message
  flag ? 'a' : 'b');
}
`,
    },
    // `yield` is restricted the same way, and keeps its parentheses twice
    // over: the landing position is one `requiredPrecedenceAt` does not model,
    // and an unmodelled position parenthesises by default. Measured — dropping
    // the restricted-production arm leaves this case passing while the two
    // above fail — so it pins the outcome rather than the reason.
    {
      code: `
function* labels(flag: boolean) {
  yield useMemo(() => {
    // documents the fallback
    return flag ? 'a' : 'b';
  }, [flag]);
}
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
function* labels(flag: boolean) {
  yield (
  // documents the fallback
  flag ? 'a' : 'b');
}
`,
    },
    // A declarator reads the same terminator as whitespace, so the pair the
    // restricted positions above depend on is formatting here — and prettier
    // deletes formatting it did not ask for, which is what fails
    // `prettier --check` on every fixed file (#2071).
    {
      code: `
const message = useMemo(() => {
  // documents the fallback
  return flag ? 'a' : 'b';
}, [flag]);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const message =
  // documents the fallback
  flag ? 'a' : 'b';
`,
    },
    // A comment ending the emission keeps the parentheses only where source
    // shares the line it would otherwise swallow. Given the line to itself it
    // swallows nothing, so the position decides as it does anywhere else.
    {
      code: `
const value = call(
  useMemo(() => {
    return 1; // documents the cap
  }, [])
);
`,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      errors: [{ messageId: 'uselessUseMemoPrimitive' }],
      output: `
const value = call(
  1 // documents the cap
);
`,
    },
  ],
});

/**
 * The fixtures above pin the TEXT the fixer emits. Two of its claims are not
 * claims about text, and each needs an oracle of its own.
 *
 * The parentheses a restricted production keeps are load-bearing: bare, ASI
 * ends the `return` at the carried comment and the function hands back
 * `undefined` while the expression stands as dead code (#1963). That is a claim
 * about what the fixed code EVALUATES to, so both spellings are evaluated.
 *
 * The parentheses a declarator drops are the defect #2071 reports: prettier
 * deletes a pair the position never asked for, so a fixed file fails
 * `prettier --check` over parentheses that changed nothing. That is a claim
 * about a FORMATTER, so it is measured against this repo's own prettier rather
 * than eyeballed.
 */
describe('no-useless-usememo-primitives emitted parentheses', () => {
  const RULE_ID = '@blumintinc/blumint/no-useless-usememo-primitives';

  const fix = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noUselessUsememoPrimitives as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(code, {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: { [RULE_ID]: 'error' },
    } as Linter.Config);
  };

  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const isFixedPoint = (text: string) =>
    prettier.format(text, PRETTIER_OPTIONS) === text;

  /**
   * Both inputs are plain JavaScript so the fixer's own output can be run, and
   * both are prettier fixed points so the oracles below read the emission
   * rather than residue prettier would have reformatted anyway.
   */
  const RESTRICTED = `function pickLabel(flag) {
  return useMemo(() => {
    // documents the fallback
    return flag ? 'a' : 'b';
  }, [flag]);
}
`;

  const DECLARATOR = `const message = useMemo(() => {
  // documents the fallback
  return flag ? 'a' : 'b';
}, [flag]);
`;

  const evaluate = (source: string, call: string) =>
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function(`${source}\nreturn ${call};`)();

  it('rewrites both inputs, and neither input is what prettier objects to', () => {
    expect(fix(RESTRICTED).fixed).toBe(true);
    expect(fix(DECLARATOR).fixed).toBe(true);
    expect(isFixedPoint(RESTRICTED)).toBe(true);
    expect(isFixedPoint(DECLARATOR)).toBe(true);
  });

  it('keeps the returned value where a line terminator would end the statement', () => {
    const { output } = fix(RESTRICTED);
    expect(output).toContain('return (');
    expect(evaluate(output, 'pickLabel(true)')).toBe('a');
  });

  it('is not vacuous: the same emission unparenthesised yields undefined', () => {
    const unparenthesized = `function pickLabel(flag) {
  return
  // documents the fallback
  flag ? 'a' : 'b';
}
`;
    expect(evaluate(unparenthesized, 'pickLabel(true)')).toBeUndefined();
  });

  it('emits text prettier leaves alone where the position needs no pair', () => {
    const { output } = fix(DECLARATOR);
    expect(output).toBe(
      `const message =\n  // documents the fallback\n  flag ? 'a' : 'b';\n`,
    );
    expect(isFixedPoint(output)).toBe(true);
  });

  it('is not vacuous: the parenthesised spelling is the one prettier rewrites', () => {
    const parenthesized = `const message = (
// documents the fallback
flag ? 'a' : 'b');
`;
    expect(isFixedPoint(parenthesized)).toBe(false);
  });

  /**
   * The shape the cross-paired sweep reaches, and the one
   * `commentFidelityBaseline.ts` excuses. The entry claims the two spellings
   * differ by a pair of parentheses that carries meaning; the claim is settled
   * by running them, since a fixture can only pin the text.
   *
   * The unperturbed source is the anchoring fixture above, spelled without
   * `export` so the emitted function can be evaluated.
   */
  const ANCHOR = `function useNullValue() {
  return useMemo(() => {
    return null;
  }, []);
}
`;

  const ANCHOR_PERTURBED = `function useNullValue() {
  return useMemo(() => { // fidelityProbe
    return null;
  }, []);
}
`;

  it('takes no parentheses where the emission carries no line terminator', () => {
    expect(fix(ANCHOR).output).toBe(`function useNullValue() {
  return null;
}
`);
  });

  it('parenthesises the same call once a carried comment owns a line', () => {
    const { output } = fix(ANCHOR_PERTURBED);
    expect(output).toBe(`function useNullValue() {
  return (
  // fidelityProbe
  null);
}
`);
    // The comment is CARRIED, not consumed: the divergence the baseline entry
    // excuses is the pair of parentheses and nothing else.
    expect(output).toContain('// fidelityProbe');
    expect(evaluate(output, 'useNullValue()')).toBeNull();
  });

  it('is not vacuous: the anchored emission unparenthesised yields undefined', () => {
    const unparenthesized = `function useNullValue() {
  return
  // fidelityProbe
  null;
}
`;
    expect(evaluate(unparenthesized, 'useNullValue()')).toBeUndefined();
  });
});
