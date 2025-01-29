import { ruleTesterTs } from '../utils/ruleTester';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';

ruleTesterTs.run('no-explicit-return-type', noExplicitReturnType, {
  valid: [
    // Basic functions without return type
    'function add(a: number, b: number) { return a + b; }',
    'const multiply = (a: number, b: number) => a * b;',
    'const obj = { method(a: number) { return a; } };',

    // Recursive functions with explicit return type
    {
      code: 'function factorial(n: number): number { if (n <= 1) return 1; return n * factorial(n - 1); }',
      options: [{ allowRecursiveFunctions: true }],
    },

    // Interface method signatures
    {
      code: 'interface Logger { log(message: string): void; error(message: string): void; }',
      options: [{ allowInterfaceMethodSignatures: true }],
    },

    // Abstract class methods
    {
      code: 'abstract class BaseService { abstract fetchData(): Promise<string>; }',
      options: [{ allowAbstractMethodSignatures: true }],
    },

    // Function overloads
    {
      code: 'interface StringNumberConverter { convert(input: string): number; convert(input: number): string; }',
      options: [{ allowOverloadedFunctions: true }],
    },

    // Declaration files
    {
      code: 'export function helper(): void; export class Example { method(): string; }',
      filename: 'types.d.ts',
      options: [{ allowDtsFiles: true }],
    },
  ],
  invalid: [
    // Basic function with explicit return type
    {
      code: 'function add(a: number, b: number): number { return a + b; }',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'function add(a: number, b: number) { return a + b; }',
    },

    // Arrow function with explicit return type
    {
      code: 'const multiply = (a: number, b: number): number => a * b;',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'const multiply = (a: number, b: number) => a * b;',
    },

    // Method with explicit return type
    {
      code: 'const obj = { method(a: number): number { return a; } };',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'const obj = { method(a: number) { return a; } };',
    },

    // Async function with explicit return type
    {
      code: 'async function getData(): Promise<string> { return "data"; }',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'async function getData() { return "data"; }',
    },

    // Arrow function in callback with explicit return type
    {
      code: 'const numbers = [1, 2, 3].map((n): number => n * 2);',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'const numbers = [1, 2, 3].map((n) => n * 2);',
    },

    // Function expression with explicit return type
    {
      code: 'const isEven = function(n: number): boolean { return n % 2 === 0; };',
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'const isEven = function(n: number) { return n % 2 === 0; };',
    },

    // Recursive function with explicit return type when not allowed
    {
      code: 'function factorial(n: number): number { if (n <= 1) return 1; return n * factorial(n - 1); }',
      options: [{ allowRecursiveFunctions: false }],
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'function factorial(n: number) { if (n <= 1) return 1; return n * factorial(n - 1); }',
    },

    // Interface method when not allowed
    {
      code: 'interface Logger { log(message: string): void; }',
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [{ messageId: 'noExplicitReturnType' }],
      output: 'interface Logger { log(message: string); }',
    },
  ],
});
