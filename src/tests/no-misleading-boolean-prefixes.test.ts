import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { noMisleadingBooleanPrefixes } from '../rules/no-misleading-boolean-prefixes';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';

const defaultPrefixes = 'is, has, should';
const error = (name: string) => ({
  messageId: 'nonBooleanReturn' as const,
  data: { name, prefixes: defaultPrefixes },
});

ruleTesterTs.run(
  'no-misleading-boolean-prefixes',
  noMisleadingBooleanPrefixes,
  {
    valid: [
      // Simple boolean returns
      'function isAvailable() { return true; }',
      'const hasItems = (arr: any[]) => arr.length > 0;',
      'async function shouldRefresh() { return Math.random() > 0.5; }',

      // Type predicate
      'function isUser(u: unknown): u is { id: number } { return !!(u as any)?.id; }',

      // Explicit boolean annotations
      'const isEnabled = (): boolean => false;',
      'async function hasAccess(): Promise<boolean> { return true; }',

      // Class method with boolean return
      'class C { isReady(): boolean { return false; } }',

      // Object method
      'const o = { isOk(): boolean { return true; } }',
      'const o2 = { isOk: (): boolean => true }',

      // Boolean-likely expressions
      'const isEmpty = (arr: any[]) => !arr.length;',
      'const isZero = (n: number) => n === 0;',
      'const isPositive = (n: number) => n > 0;',
      'const isTruthy = (x: any) => Boolean(x);',
      'const isFlag = (x: any) => true ? true : false;',

      // Async arrow returns boolean (Promise<boolean>)
      'const shouldRun = async () => true;',

      // Boundary checks to avoid false positives
      'function issueTracker() { return "ok"; }',
      'function isometricScale() { return 123; }',
      'function hashtagCount() { return 1; }',
      'function shoulderedWeight() { return "lbs"; }',

      // Allow underscore boundary if returns boolean
      'const is_ready = () => true;',

      // Promise<boolean | undefined>
      'async function hasToken(): Promise<boolean | undefined> { return true; }',

      // `prefixes` option — a prefix outside the default list is not checked.
      // Pairs with the `prefixes: ['can']` invalid case on identical code: the
      // option is the only difference, so this pair fails if it is ignored.
      'function canRetry() { return "yes"; }',

      // `prefixes` option narrowed away from the defaults: `is` is no longer a
      // boolean-style prefix, so the same code the default config reports is
      // now clean.
      {
        code: 'function isAvailable() { return "yes"; }',
        options: [{ prefixes: ['can'] }],
      },

      // A custom prefix on a genuinely boolean-returning function stays clean —
      // the option widens the checked names, it does not report unconditionally.
      {
        code: 'function canRetry(): boolean { return true; }',
        options: [{ prefixes: ['can'] }],
      },

      // Assertion wrappers are transparent, so seeing through them must not turn
      // a boolean return into a report. An assertion that declares a
      // boolean-like type states the same contract an explicit return
      // annotation does, which the rule already trusts.
      'function isReady(x: unknown) { return x as boolean; }',
      'function isReady(x: unknown) { return x satisfies boolean; }',
      'function isReady(x: unknown) { return <boolean>x; }',
      'function isReady(x: unknown) { return x as boolean | undefined; }',
      'function hasAccess(x: unknown) { return x as Promise<boolean>; }',
      'function isUser(u: unknown) { return { id: 1 } as unknown as boolean; }',

      // Unwrapping reaches a boolean value underneath the wrapper.
      'function isEnabled() { return true as const; }',
      'const isPositive = (n: number) => (n > 0)!;',
      'const isTruthy = (x: any) => Boolean(x)!;',
      'const isEmpty = (arr: any[]) => (!arr.length)!;',

      // Unwrapping must not convert an undeterminable value into a report.
      'function isCached(x: unknown) { return x!; }',
      'function isCached(x: unknown) { return x as any; }',
      'function isLoaded(load: () => unknown) { return load()!; }',

      // The name gate still runs first: an unprefixed function returning an
      // asserted object stays clean.
      'function getUser() { return { id: 1 } as const; }',

      // An explicit boolean return annotation still short-circuits the check.
      'function isReady(): boolean { return {} as unknown as boolean; }',

      // Seeing through a ChainExpression must not report anything the same
      // expression without the `?.` keeps silent (#1829). Under a chain the
      // inner node is only ever a call, a member access or a non-null
      // assertion, so these cover every shape the new arm can reach.
      'const isChecked = (o: any) => o?.check();',
      'const isTruthy = (o: any) => Boolean(o?.x);',
      'const isFlagged = (o: any): boolean => o?.flag;',
      'const isNamed = (o: any) => o?.name === "x";',
      'const isMissing = (o: any) => !o?.x;',
      'const isReady = (o: any) => o?.ready;',
      'const isDone = (o: any) => o?.state.done;',
      'function isOpen(o: any) { return o?.open; }',
      'class C { isOpen(o: any) { return o?.open; } }',
      'const o = { isOpen: (x: any) => x?.open };',
      // A chained `.length` still answers to the checks that run before the
      // expression is classified at all.
      'function isEmpty(arr?: any[]): boolean { return !arr?.length; }',
      'const hasItems = (arr?: any[]) => (arr?.length ?? 0) > 0;',
      'const hasItems = (arr?: any[]) => Boolean(arr?.length);',
      'function getItems(arr?: any[]) { return arr?.length; }',
    ],
    invalid: [
      // Examples from spec
      {
        code: 'function isAvailable() { return "yes"; }',
        errors: [error('isAvailable')],
      },
      {
        code: 'const hasItems = (arr) => arr.length;',
        errors: [error('hasItems')],
      },
      {
        code: 'async function shouldRefresh() { return "false"; }',
        errors: [error('shouldRefresh')],
      },
      {
        code: 'function isUser() { return { id: 1 }; }',
        errors: [error('isUser')],
      },

      // Explicit non-boolean annotations
      {
        code: 'const isEnabled: () => string = () => "yes";',
        errors: [error('isEnabled')],
      },
      {
        code: 'async function hasAccess(): Promise<string> { return "ok"; }',
        errors: [error('hasAccess')],
      },

      // Arrow with clearly non-boolean expressions
      {
        code: 'const isEmpty = (arr) => arr.length;',
        errors: [error('isEmpty')],
      },
      {
        code: 'const hasData = () => ({})',
        errors: [error('hasData')],
      },
      {
        code: 'const hasList = () => []',
        errors: [error('hasList')],
      },
      {
        code: 'const isNow = () => new Date()',
        errors: [error('isNow')],
      },
      {
        code: 'const hasName = () => `name`',
        errors: [error('hasName')],
      },

      // No return -> void
      {
        code: 'function isActive() { }',
        errors: [error('isActive')],
      },

      // return; without value
      {
        code: 'function hasValue() { return; }',
        errors: [error('hasValue')],
      },

      // null/undefined
      {
        code: 'function isNullish() { return null; }',
        errors: [error('isNullish')],
      },
      {
        code: 'function hasNothing() { return undefined; }',
        errors: [error('hasNothing')],
      },

      // Class method
      {
        code: 'class K { isDone() { return "done"; } }',
        errors: [error('isDone')],
      },

      // Object method
      {
        code: 'const obj = { hasUser() { return 1; } }',
        errors: [error('hasUser')],
      },
      {
        code: 'const obj2 = { hasUser: () => 1 }',
        errors: [error('hasUser')],
      },

      // Underscore boundary with non-boolean
      {
        code: 'const is_ready = () => 1;',
        errors: [error('is_ready')],
      },

      // Uppercase leading name
      {
        code: 'function ISReady() { return 1; }',
        errors: [error('ISReady')],
      },

      // Union with non-boolean types should fail
      {
        code: 'function hasConfig(): boolean | number { return 1 as any; }',
        errors: [error('hasConfig')],
      },
      {
        code: 'async function shouldClear(): Promise<boolean | string> { return true; }',
        errors: [error('shouldClear')],
      },

      // `prefixes` option widened to a non-default prefix. Identical code to the
      // corresponding valid case; only the option differs, and the reported
      // prefix list echoes the configured value rather than the defaults.
      {
        code: 'function canRetry() { return "yes"; }',
        options: [{ prefixes: ['can'] }],
        errors: [
          {
            messageId: 'nonBooleanReturn' as const,
            data: { name: 'canRetry', prefixes: 'can' },
          },
        ],
      },

      // An assertion wrapper changes no runtime value, so every form of it
      // leaves the object return — and the misleading prefix — intact (#1606).
      // `enforce-object-literal-as-const` ships in the same recommended config
      // and appends `as const` to exactly these literals by `--fix`, so the
      // first case is reachable from the plain object return above it.
      {
        code: 'function isUser() { return { id: 1 } as const; }',
        errors: [error('isUser')],
      },
      {
        code: 'function isUser() { return { id: 1 } satisfies Record<string, number>; }',
        errors: [error('isUser')],
      },
      {
        code: 'function hasProfile() { return ({ id: 1 })!; }',
        errors: [error('hasProfile')],
      },
      {
        code: 'function isConfig() { return <Config>{ id: 1 }; }',
        errors: [error('isConfig')],
      },
      {
        code: 'function isUser() { return { id: 1 } as any; }',
        errors: [error('isUser')],
      },

      // Wrappers nest, so one unwrap is not enough.
      {
        code: 'function shouldCache() { return ({ ttl: 1 } as const)!; }',
        errors: [error('shouldCache')],
      },
      {
        code: 'function isUser() { return { id: 1 } as unknown as Record<string, number>; }',
        errors: [error('isUser')],
      },
      {
        code: 'function isUser() { return { id: 1 } as const satisfies Record<string, number>; }',
        errors: [error('isUser')],
      },

      // Non-object values keep their classification through a wrapper too.
      {
        code: 'function isAvailable() { return "yes" as const; }',
        errors: [error('isAvailable')],
      },
      {
        code: 'function hasItems() { return [] as const; }',
        errors: [error('hasItems')],
      },
      {
        code: 'function hasName() { return (`name`)!; }',
        errors: [error('hasName')],
      },
      {
        code: 'function isNow() { return new Date()!; }',
        errors: [error('isNow')],
      },

      // The wrapper does not depend on the declaration form.
      {
        code: 'const hasData = () => ({ a: 1 } as const);',
        errors: [error('hasData')],
      },
      {
        code: 'class K { isDone() { return { done: true } as const; } }',
        errors: [error('isDone')],
      },
      {
        code: 'const obj = { hasUser() { return { id: 1 } as const; } }',
        errors: [error('hasUser')],
      },
      {
        code: 'const obj2 = { hasUser: () => ({ id: 1 } as const) }',
        errors: [error('hasUser')],
      },

      // `a?.b` parses as a ChainExpression wrapping the member access, so the
      // wrapper — not any policy about nullish receivers — is what used to hide
      // the `.length` return (#1829). `arr?.length` is `number | undefined`, so
      // a `hasItems` that returns it is a worse misleading prefix than the
      // `arr.length` case above, not an exempt one. The loss reached every
      // visitor arm, so each is pinned here.
      {
        code: 'function hasItems(arr) { return arr?.length; }',
        errors: [error('hasItems')],
      },
      {
        code: 'const hasItems = (arr) => arr?.length;',
        errors: [error('hasItems')],
      },
      {
        code: 'const isEmpty = (arr) => arr?.length;',
        errors: [error('isEmpty')],
      },
      {
        code: 'const hasItems = function (arr) { return arr?.length; };',
        errors: [error('hasItems')],
      },
      {
        code: 'class C { hasItems(arr) { return arr?.length; } }',
        errors: [error('hasItems')],
      },
      {
        code: 'const o = { hasItems: (arr) => arr?.length };',
        errors: [error('hasItems')],
      },
      {
        code: 'const o = { hasItems(arr) { return arr?.length; } };',
        errors: [error('hasItems')],
      },

      // The chain wrapper sits at the outermost access, so an inner plain dot
      // is still reached by one unwrap.
      {
        code: 'const hasItems = (o) => o?.arr.length;',
        errors: [error('hasItems')],
      },

      // Recursion into the branches of a conditional was blinded too.
      {
        code: 'const hasItems = (a, b) => a ? b?.length : true;',
        errors: [error('hasItems')],
      },

      // Chain and assertion wrappers nest in either order.
      {
        code: 'const hasItems = (arr) => arr?.length!;',
        errors: [error('hasItems')],
      },
      {
        code: 'const hasItems = (arr) => (arr?.length) as number;',
        errors: [error('hasItems')],
      },
      {
        code: 'const hasItems = (o) => (o?.a)?.length;',
        errors: [error('hasItems')],
      },
    ],
  },
);

// `enforce-object-literal-as-const` is also 'error' in the recommended config
// and is fixable, so `eslint --fix` rewrites a reported object return into the
// asserted form on its own. If this rule cannot see through that assertion, the
// config silences its own finding without the violation going away (issue
// #1606).
describe('no-misleading-boolean-prefixes vs enforce-object-literal-as-const --fix', () => {
  const fixThenLint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/no-misleading-boolean-prefixes',
      noMisleadingBooleanPrefixes as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/enforce-object-literal-as-const',
      enforceObjectLiteralAsConst as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: {
        'test/no-misleading-boolean-prefixes': 'error' as const,
        'test/enforce-object-literal-as-const': 'error' as const,
      },
    };
    const { output } = linter.verifyAndFix(code, config, 'user.ts');
    return {
      output,
      messages: linter.verify(
        output,
        {
          ...config,
          rules: { 'test/no-misleading-boolean-prefixes': 'error' as const },
        },
        'user.ts',
      ),
    };
  };

  it('still reports an object return the sibling fixer has asserted', () => {
    const { output, messages } = fixThenLint(
      'function isUser() {\n  return { id: 1 };\n}\n',
    );

    // The fixer must actually have produced the assertion, or this proves nothing.
    expect(output).toContain('as const');
    expect(messages.map((message) => message.ruleId)).toEqual([
      'test/no-misleading-boolean-prefixes',
    ]);
  });
});
