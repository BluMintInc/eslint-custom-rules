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
        const unionWithAny = (flag ? 'yes' : (undefined as any));
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
        const anyValue = (undefined as any);
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'boolean value' },
        },
      ],
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
      output: `
        const constant = ('static');
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
        const combined = ('a' + 'b');
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
        const alwaysTrue = (true);
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
        const zero = (0);
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
        const nothing = (null);
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'undefined value' },
        },
      ],
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'string value' },
        },
      ],
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
      errors: [
        {
          messageId: 'uselessUseMemoPrimitive',
          data: { valueKind: 'number value' },
        },
      ],
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
  const label = (
  // eslint-disable-next-line no-restricted-syntax
  isPendingToJoinTeam ? 'Pending Response' : 'Request to Join');
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
        const guarded = (
        /* eslint-disable-next-line no-restricted-syntax */
        flag ? 'yes' : 'no');
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
        const total = (/* documents why the offset applies */ 2 + 1);
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
        const offset = (
        // explains the offset
        2 + 1);
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
        const answer = (/* keep this rationale */ 42);
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
        const rationale = (
        // keep this rationale
        42);
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
        const spaced = (/* inline rationale */ 3 + 4);
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
        const doubled = (2 * 2 /* deliberately empty */);
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
        const tripled = (3 * 3 /* no dependencies */);
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
        const quoted = (/* why memoized */ 'value');
      `,
    },
    // A comment after the return statement stays on the expression's side of
    // it, which pushes the closing parenthesis onto the next line.
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
        const label = (
        // fidelity
        isPendingToJoinTeam ? 'Pending Response' : 'Request to Join');
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
        const zero = (0); // trailing note
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
        const one = (1); /* trailing note */
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
        const two = (2);
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
        const label = (
        // opening note
        /* second */ flag ? 'yes' : 'no' // trailing note
        /* deps note */);
      `,
    },
    // The carried comments are indented from the line the call opens on, which
    // is the only anchor available when the call starts mid-line.
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
        render((
        // nested note
        count > 0));
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
        const label = (flag ? /* fallback */ 'yes' : 'no');
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
        const mixed = (/* outside */ flag ? /* inside */ 'yes' : 'no');
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
  return (1);
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

export const useCount = () => (1);
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

export const useA = () => (1);
export const useB = () => (2);
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

export const useA = () => (1);
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

export const useA = () => (1);
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

export const useA = () => (1);
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

export const useA = () => (1);
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

export const useA = () => (LIMIT > 0);
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

export const useA = () => (1);
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
  return { flag: (true), nested };
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
export const useB = () => (2);
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

export const useA = () => (1);
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
  ],
});
