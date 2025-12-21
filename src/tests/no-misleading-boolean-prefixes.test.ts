import { ruleTesterTs } from '../utils/ruleTester';
import { noMisleadingBooleanPrefixes } from '../rules/no-misleading-boolean-prefixes';

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
    ],
  },
);
