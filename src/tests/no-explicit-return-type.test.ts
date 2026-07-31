import { ruleTesterTs } from '../utils/ruleTester';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';

ruleTesterTs.run('no-explicit-return-type', noExplicitReturnType, {
  valid: [
    // Basic functions without return type
    'function add(a: number, b: number) { return a + b; }',
    'const multiply = (a: number, b: number) => a * b;',
    'const obj = { method(a: number) { return a; } };',

    // Type guard functions with is keyword
    'function isString(value: unknown): value is string { return typeof value === "string"; }',
    'const isNumber = (value: unknown): value is number => typeof value === "number";',
    'function isCustomType<T extends object>(obj: unknown): obj is T { return obj instanceof Object; }',
    'const isLivestream = <TTime = Timestamp>(channelGroup: ChannelGroup<keyof GroupFilterMap, TTime>): channelGroup is ChannelGroup<Capitalize<LivestreamType>, TTime> => { return true; }',
    'function isLivestreamType(type: FilterType): type is FilterType { return true; }',
    'class ChannelGroupUtils { private static isValidIdentifierKey(key: string): key is TemporaryChannelGroupKey { return key in CHANNEL_GROUP_CONFIGS; } }',
    'class TypeGuardClass { isValidKey(key: string): key is TemporaryChannelGroupKey { return key in CHANNEL_GROUP_CONFIGS; } }',
    'declare function isStringDeclared(value: unknown): value is string;',

    // Assertion functions with asserts keyword
    'function assertIsString(value: unknown): asserts value is string { if (typeof value !== "string") throw new Error("Not a string"); }',
    'const assertIsNumber = (value: unknown): asserts value is number => { if (typeof value !== "number") throw new Error("Not a number"); }',
    'function assertNonNull<T>(value: T | null | undefined): asserts value is T { if (value == null) throw new Error("Value is null or undefined"); }',
    'function assert(condition: unknown): asserts condition { if (!condition) throw new Error("Assertion failed"); }',

    // Explicit `never` return type (issue #1216): never inferred (TS infers
    // `void` for all-throwing functions), so it is always significant — removing
    // it would widen to `void` and break caller control-flow narrowing.
    'const wrapApiError = (message: string): never => { throw new Error(message); };',
    'function fail(message: string): never { throw new Error(message); }',
    'const failConditional = (error: unknown, message: string): never => { if (error instanceof TypeError) { throw new Error(`Type error: ${message}`); } throw new Error(message); };',
    'class Thrower { raise(message: string): never { throw new Error(message); } }',

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

    // Overloaded declared functions are allowed by default
    `
      declare function convert(input: string): number;
      declare function convert(input: number): string;
    `,

    // String literal overloads should still be treated as overloads when disabled
    {
      code: `
        interface Logger {
          'log'(message: string): void;
          'log'(message: number): void;
        }
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
    },

    // Declaration files
    {
      code: 'export function helper(): void; export class Example { method(): string; }',
      filename: 'types.d.ts',
      options: [{ allowDtsFiles: true }],
    },

    // Read-only widening return types are never redundant — TypeScript infers
    // the mutable concrete type, so stripping a ReadonlySet/ReadonlyMap/
    // ReadonlyArray/Readonly/readonly-operator annotation changes the public
    // API and allows callers to mutate protected internal state.

    // ReadonlySet — function declaration
    {
      code: `
        const activeChildren = new Set<number>();
        export function retrieveActiveChildren(): ReadonlySet<number> {
          return activeChildren;
        }
      `,
    },

    // readonly T[] (TSTypeOperator) — function declaration
    {
      code: `
        const items: number[] = [];
        export function getItems(): readonly number[] {
          return items;
        }
      `,
    },

    // ReadonlyMap — function declaration
    {
      code: `
        const cache = new Map<string, number>();
        export function getCache(): ReadonlyMap<string, number> {
          return cache;
        }
      `,
    },

    // Readonly<T> — arrow function
    {
      code: `
        const state = { count: 0 };
        export const getState = (): Readonly<{ count: number }> => {
          return state;
        };
      `,
    },

    // ReadonlyArray<T> — function declaration
    {
      code: `
        const items: number[] = [];
        export function getReadonlyArray(): ReadonlyArray<number> {
          return items;
        }
      `,
    },

    // ReadonlySet — arrow function
    {
      code: `
        const s = new Set<string>();
        export const getSet = (): ReadonlySet<string> => s;
      `,
    },

    // ReadonlyMap — arrow function
    {
      code: `
        const m = new Map<string, number>();
        export const getMap = (): ReadonlyMap<string, number> => m;
      `,
    },

    // readonly T[] — arrow function
    {
      code: `
        const arr: string[] = [];
        export const getArr = (): readonly string[] => arr;
      `,
    },

    // ReadonlySet — function expression (object method)
    {
      code: `
        const s = new Set<number>();
        const obj = {
          getSet: function(): ReadonlySet<number> {
            return s;
          },
        };
      `,
    },

    // ReadonlyMap — class instance method
    {
      code: `
        class Cache {
          private data = new Map<string, number>();
          getCache(): ReadonlyMap<string, number> {
            return this.data;
          }
        }
      `,
    },

    // ReadonlySet — class static method
    {
      code: `
        class Registry {
          private static entries = new Set<string>();
          static getEntries(): ReadonlySet<string> {
            return Registry.entries;
          }
        }
      `,
    },

    // readonly tuple — arrow function (TSTypeOperator covers tuples too)
    {
      code: `
        const pair: [number, string] = [1, 'a'];
        export const getPair = (): readonly [number, string] => pair;
      `,
    },

    // Readonly<T> — class method
    {
      code: `
        class Config {
          private cfg = { debug: false };
          getConfig(): Readonly<{ debug: boolean }> {
            return this.cfg;
          }
        }
      `,
    },

    // ReadonlyArray — object method (function expression)
    {
      code: `
        const items: number[] = [];
        const api = {
          list: function(): ReadonlyArray<number> {
            return items;
          },
        };
      `,
    },

    // Recursion (issue #1512): a function referenced from inside its own return
    // expression has no inferable return type — TypeScript reports
    // "TS7023: '<name>' implicitly has return type 'any' because it does not
    // have a return type annotation and is referenced directly or indirectly in
    // one of its return expressions" — so removing the annotation stops the code
    // compiling. Every snippet below was checked against `tsc --noEmit --strict`
    // with and without the annotation.

    // Recursive factory from the issue: the self-reference sits inside a closure
    // in the returned object literal.
    `
    type FakeQuery = { orderBy: () => FakeQuery };
    const buildQuery = (p?: string): FakeQuery => {
      return { orderBy: () => buildQuery(p) };
    };
    `,

    // Same factory with the returned literal contextually checked, which is the
    // form the issue verified as TS7023.
    `
    type FakeQuery = { orderBy: () => FakeQuery };
    const buildQuery = (p?: string): FakeQuery => {
      return { orderBy: () => buildQuery(p) } satisfies FakeQuery;
    };
    `,

    // Arrow function with a block body calling itself directly
    `
    const countdown = (n: number): number => {
      if (n <= 0) {
        return 0;
      }
      return countdown(n - 1);
    };
    `,

    // Concise arrow body calling itself directly
    `
    const depthOf = (node: { parent?: unknown }): number =>
      node.parent ? depthOf(node.parent as { parent?: unknown }) + 1 : 0;
    `,

    // Function declaration returning a self-reference
    `
    type Counter = { value: number; next: () => Counter };
    function createCounter(value: number): Counter {
      return { value, next: () => createCounter(value + 1) } satisfies Counter;
    }
    `,

    // Named function expression referring to itself by its own id
    `
    type Chain = { next: () => Chain };
    const makeChain = function build(depth: number): Chain {
      return { next: () => build(depth + 1) } satisfies Chain;
    };
    `,

    // Object method reaching itself through its owner
    `
    type Query = { orderBy: () => Query };
    const api = {
      build(p?: string): Query {
        return { orderBy: () => api.build(p) } satisfies Query;
      },
    };
    `,

    // Class method reaching itself through \`this\`
    `
    type Query = { orderBy: () => Query };
    class Builder {
      build(p?: string): Query {
        return { orderBy: () => this.build(p) } satisfies Query;
      }
    }
    `,

    // Mutual recursion between module-scope functions: TS7023 names both
    `
    const isEvenNumber = (n: number): boolean =>
      n === 0 ? true : isOddNumber(n - 1);
    const isOddNumber = (n: number): boolean =>
      n === 0 ? false : isEvenNumber(n - 1);
    `,

    // Firestore function files
    {
      code: `
        export type Params = { gameId: string; groupId: string; };
        export type Response = Promise<{ tournamentNew: Tournament }>;
        export const createTemplateTournament = async (
          request: AuthenticatedRequest<Params>,
        ): Response => {
          return { tournamentNew: await generator.generate() };
        };
      `,
      filename: 'createTemplateTournament.f.ts',
      options: [{ allowFirestoreFunctionFiles: true }],
    },
    {
      code: `
        export type Response = Promise<void>;
        export const deleteUser = async (
          request: AuthenticatedRequest<{ userId: string }>,
        ): Response => {
          await deleteUserData(request.data.userId);
        };
      `,
      filename: 'deleteUser.f.ts',
      options: [{ allowFirestoreFunctionFiles: true }],
    },
  ],
  invalid: [
    // Basic function with explicit return type
    {
      code: 'function add(a: number, b: number): number { return a + b; }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "add"' },
        },
      ],
      output: 'function add(a: number, b: number) { return a + b; }',
    },

    // Arrow function with explicit return type
    {
      code: 'const multiply = (a: number, b: number): number => a * b;',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "multiply"' },
        },
      ],
      output: 'const multiply = (a: number, b: number) => a * b;',
    },

    // Method with explicit return type
    {
      code: 'const obj = { method(a: number): number { return a; } };',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'object method "method"' },
        },
      ],
      output: 'const obj = { method(a: number) { return a; } };',
    },

    // Computed class method should not use computed identifier name
    {
      code: `
        const key = 'value';
        class Example {
          [key](): number {
            return 1;
          }
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method' },
        },
      ],
      output: `
        const key = 'value';
        class Example {
          [key]() {
            return 1;
          }
        }
      `,
    },

    // Computed object method should fall back to generic description
    {
      code: `
        const key = 'value';
        const obj = {
          [key]: function (a: number): number {
            return a;
          },
        };
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function expression' },
        },
      ],
      output: `
        const key = 'value';
        const obj = {
          [key]: function (a: number) {
            return a;
          },
        };
      `,
    },

    // Async function with explicit return type
    {
      code: 'async function getData(): Promise<string> { return "data"; }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "getData"' },
        },
      ],
      output: 'async function getData() { return "data"; }',
    },

    // Arrow function in callback with explicit return type
    {
      code: 'const numbers = [1, 2, 3].map((n): number => n * 2);',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function' },
        },
      ],
      output: 'const numbers = [1, 2, 3].map((n) => n * 2);',
    },

    // Function expression with explicit return type
    {
      code: 'const isEven = function(n: number): boolean { return n % 2 === 0; };',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "isEven"' },
        },
      ],
      output: 'const isEven = function(n: number) { return n % 2 === 0; };',
    },

    // Recursive function with explicit return type when not allowed
    {
      code: 'function factorial(n: number): number { if (n <= 1) return 1; return n * factorial(n - 1); }',
      options: [{ allowRecursiveFunctions: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "factorial"' },
        },
      ],
      output:
        'function factorial(n: number) { if (n <= 1) return 1; return n * factorial(n - 1); }',
    },

    // Interface method when not allowed
    {
      code: 'interface Logger { log(message: string): void; }',
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'interface method "log"' },
        },
      ],
      output: null,
    },

    // String literal interface method should be reported when not overloaded
    {
      code: `
        interface Logger {
          'log'(message: string): void;
        }
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'interface method "log"' },
        },
      ],
      output: null,
    },

    // Abstract methods lack bodies, so no autofix
    {
      code: 'abstract class BaseService { abstract fetchData(): Promise<string>; }',
      options: [{ allowAbstractMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'class method "fetchData"' },
        },
      ],
      output: null,
    },

    // Overloaded declared functions should be reported when not allowed
    {
      code: `
        declare function convert(input: string): number;
        declare function convert(input: number): string;
      `,
      options: [{ allowOverloadedFunctions: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'function "convert"' },
        },
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'function "convert"' },
        },
      ],
      output: null,
    },

    // Declared functions have no body to infer from
    {
      code: 'declare function declaredHelper(): number;',
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'function "declaredHelper"' },
        },
      ],
      output: null,
    },

    // Firestore function file when not allowed
    {
      code: `
        export type Response = Promise<void>;
        export const deleteUser = async (
          request: AuthenticatedRequest<{ userId: string }>,
        ): Response => {
          await deleteUserData(request.data.userId);
        };
      `,
      filename: 'deleteUser.f.ts',
      options: [{ allowFirestoreFunctionFiles: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "deleteUser"' },
        },
      ],
      output: `
        export type Response = Promise<void>;
        export const deleteUser = async (
          request: AuthenticatedRequest<{ userId: string }>,
        ) => {
          await deleteUserData(request.data.userId);
        };
      `,
    },

    // Non-readonly redundant annotations must still be flagged (regression
    // guards ensuring the readonly exemption does not over-exempt).
    {
      code: `
        export function getItems(): Set<number> {
          return new Set<number>();
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "getItems"' },
        },
      ],
      output: `
        export function getItems() {
          return new Set<number>();
        }
      `,
    },
    {
      code: 'function getNum(): number { return 1; }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "getNum"' },
        },
      ],
      output: 'function getNum() { return 1; }',
    },
    {
      code: 'const getNum = (): number => 1;',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "getNum"' },
        },
      ],
      output: 'const getNum = () => 1;',
    },
    // The recursion exemption (issue #1512) is pinned to an actual
    // self-reference in the return expression, not to annotated factories in
    // general: each snippet below compiles without its annotation, so TS7023
    // never applies and the report must stand.

    // Same factory as the valid case, with the self-reference removed
    {
      code: `
        type FakeQuery = { orderBy: () => FakeQuery };
        declare const fallback: FakeQuery;
        const buildQuery = (p?: string): FakeQuery => {
          return { orderBy: () => fallback };
        };
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildQuery"' },
        },
      ],
      output: `
        type FakeQuery = { orderBy: () => FakeQuery };
        declare const fallback: FakeQuery;
        const buildQuery = (p?: string) => {
          return { orderBy: () => fallback };
        };
      `,
    },

    // Self-call in a non-returned position (side effects only): the return type
    // is still inferable, so TS7023 does not apply
    {
      code: `
        const walkTree = (nodes: number[][], depth: number): number => {
          nodes.forEach((child) => walkTree([child], depth + 1));
          return depth;
        };
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "walkTree"' },
        },
      ],
      output: `
        const walkTree = (nodes: number[][], depth: number) => {
          nodes.forEach((child) => walkTree([child], depth + 1));
          return depth;
        };
      `,
    },
    {
      code: `
        function walkTree(nodes: number[][], depth: number): number {
          nodes.forEach((child) => walkTree([child], depth + 1));
          return depth;
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "walkTree"' },
        },
      ],
      output: `
        function walkTree(nodes: number[][], depth: number) {
          nodes.forEach((child) => walkTree([child], depth + 1));
          return depth;
        }
      `,
    },

    // Anonymous function: no resolvable name, so it cannot be self-referential
    {
      code: `
        const lengths = ['a', 'bb'].map(function (item): number {
          return item.length;
        });
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function expression' },
        },
      ],
      output: `
        const lengths = ['a', 'bb'].map(function (item) {
          return item.length;
        });
      `,
    },

    // A member named like the function is not a reference to the function
    {
      code: `
        const format = (value: string): string => helpers.format(value);
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "format"' },
        },
      ],
      output: `
        const format = (value: string) => helpers.format(value);
      `,
    },

    // Calling another function from the return expression is not a cycle
    {
      code: `
        const firstStep = (): number => secondStep();
        const secondStep = () => 1;
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "firstStep"' },
        },
      ],
      output: `
        const firstStep = () => secondStep();
        const secondStep = () => 1;
      `,
    },

    {
      code: `
        class Foo {
          getMap(): Map<string, number> {
            return new Map<string, number>();
          }
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "getMap"' },
        },
      ],
      output: `
        class Foo {
          getMap() {
            return new Map<string, number>();
          }
        }
      `,
    },
  ],
});
