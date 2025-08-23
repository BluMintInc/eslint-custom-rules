import { ruleTesterTs } from '../utils/ruleTester';
import { noMisleadingBooleanPrefixes } from '../rules/no-misleading-boolean-prefixes';

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
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const hasItems = (arr) => arr.length;',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'async function shouldRefresh() { return "false"; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'function isUser() { return { id: 1 }; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Explicit non-boolean annotations
      {
        code: 'const isEnabled: () => string = () => "yes";',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'async function hasAccess(): Promise<string> { return "ok"; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Arrow with clearly non-boolean expressions
      {
        code: 'const isEmpty = (arr) => arr.length;',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const hasData = () => ({})',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const hasList = () => []',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const isNow = () => new Date()',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const hasName = () => `name`',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // No return -> void
      {
        code: 'function isActive() { }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // return; without value
      {
        code: 'function hasValue() { return; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // null/undefined
      {
        code: 'function isNullish() { return null; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'function hasNothing() { return undefined; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Class method
      {
        code: 'class K { isDone() { return "done"; } }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Object method
      {
        code: 'const obj = { hasUser() { return 1; } }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'const obj2 = { hasUser: () => 1 }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Underscore boundary with non-boolean
      {
        code: 'const is_ready = () => 1;',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Uppercase leading name
      {
        code: 'function ISReady() { return 1; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },

      // Union with non-boolean types should fail
      {
        code: 'function hasConfig(): boolean | number { return 1 as any; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
      {
        code: 'async function shouldClear(): Promise<boolean | string> { return true; }',
        errors: [{ messageId: 'nonBooleanReturn' }],
      },
    ],
  },
);
