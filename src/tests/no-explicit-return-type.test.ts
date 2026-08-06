import { Linter, Rule } from 'eslint';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs } from '../utils/ruleTester';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';
import { preferTypeOverInterface } from '../rules/prefer-type-over-interface';

/**
 * Type names the source references but no longer binds.
 *
 * This is the failure a fix that deletes an import too eagerly produces, and it
 * is invisible to the rule's own reports — the fix resolves them, so nothing
 * re-reports the damage. It is also strictly worse than the unused import issue
 * #1649 reports: an unused import is a lint warning, a type reference bound to
 * nothing is a compile error.
 */
function danglingTypeReferences(code: string): string[] {
  const ast = tsParser.parse(code, {
    ecmaVersion: 2022,
    sourceType: 'module',
    range: true,
    loc: true,
  });

  const bound = new Set<string>();
  const used = new Set<string>();

  const visit = (node: TSESTree.Node): void => {
    if (node.type === AST_NODE_TYPES.ImportDeclaration) {
      for (const specifier of node.specifiers) {
        bound.add(specifier.local.name);
      }
      return;
    }
    if (
      node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      node.type === AST_NODE_TYPES.TSInterfaceDeclaration
    ) {
      bound.add(node.id.name);
    }
    if (
      node.type === AST_NODE_TYPES.TSTypeReference &&
      node.typeName.type === AST_NODE_TYPES.Identifier
    ) {
      used.add(node.typeName.name);
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child === 'object' && 'type' in child) {
          visit(child as TSESTree.Node);
        }
      }
    }
  };

  visit(ast as TSESTree.Node);
  return [...used].filter((name) => !bound.has(name));
}

/**
 * Bindings the source declares and never reads — the debt issue #1654 is about.
 * Read from `no-unused-vars` itself rather than re-derived, since that rule is
 * what turns the leftover into a failing build downstream.
 */
function unusedBindings(code: string): string[] {
  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  return (
    linter
      .verify(
        code,
        {
          parser: '@typescript-eslint/parser',
          parserOptions: {
            ecmaVersion: 2022 as const,
            sourceType: 'module' as const,
          },
          rules: { 'no-unused-vars': 'error' },
        },
        'x.ts',
      )
      // A source carrying a disable directive for the rule under test also draws
      // "Definition for rule ... was not found" from a linter that does not
      // define it, which says nothing about unused bindings.
      .filter((message) => message.ruleId === 'no-unused-vars')
      .map((message) => message.message)
  );
}

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

    // A type literal declares exactly the same members as an interface body —
    // `prefer-type-over-interface` rewrites one into the other — so overload
    // detection must read both containers (issue #1598).
    {
      code: `
        type Logger = {
          'log'(message: string): void;
          'log'(message: number): void;
        };
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
    },
    {
      code: 'type StringNumberConverter = { convert(input: string): number; convert(input: number): string; };',
      options: [
        {
          allowInterfaceMethodSignatures: false,
          allowOverloadedFunctions: true,
        },
      ],
    },
    // A type literal nested inside an interface is the same container kind
    {
      code: `
        interface Outer {
          inner: {
            log(message: string): void;
            log(message: number): void;
          };
        }
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
    },
    // A type literal nested inside another type literal
    {
      code: `
        type Outer = {
          inner: {
            log(message: string): void;
            log(message: number): void;
          };
        };
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
    },
    // A type literal in a parameter position
    {
      code: `
        function register(handlers: {
          run(input: string): void;
          run(input: number): void;
        }) {
          return handlers;
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

    // Issue #1562: `void` / `Promise<void>` declares the absence of a result
    // rather than restating one, so it cannot drift from the implementation —
    // TypeScript rejects a `return <expr>` added under it. Stripping it also
    // destroys the declaration of intent `enforce-memoize-async` reads, and
    // `eslint --fix` re-lints until output settles, so the strip and the
    // resulting memoization of a side-effecting method land in one run.

    // Promise<void> — class method (the shape from the issue)
    `
    export class Authorizer {
      public async present(url: string): Promise<void> {
        await this.open(url);
      }
    }
    `,

    // void — class method
    `
    class Pinger {
      ping(): void {
        this.socket.send('ping');
      }
    }
    `,

    // Promise<void> — function declaration
    'async function flush(): Promise<void> { await commit(); }',

    // void — function declaration
    'function log(message: string): void { console.log(message); }',

    // Promise<void> — arrow function
    'const flush = async (): Promise<void> => { await commit(); };',

    // void — arrow function
    'const log = (message: string): void => { console.log(message); };',

    // Promise<void> — function expression (object method)
    'const api = { flush: async function (): Promise<void> { await commit(); } };',

    // void — static class method
    `
    class Registry {
      static reset(): void {
        Registry.entries.clear();
      }
    }
    `,

    // The exemption is explicitly opt-outable, and turning it off restores the
    // report — see the matching invalid cases below.
    {
      code: 'async function flush(): Promise<void> { await commit(); }',
      options: [{ allowVoidReturnTypes: true }],
    },

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

    // A lone type-literal method signature is not an overload, so widening the
    // overload allowance to type literals must not silence it (issue #1598).
    {
      code: 'type Logger = { log(message: string): void; };',
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'type literal method "log"' },
        },
      ],
      output: null,
    },
    // Distinct names in one type literal are not overloads of each other
    {
      code: `
        type Logger = {
          log(message: string): void;
          warn(message: number): void;
        };
      `,
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'type literal method "log"' },
        },
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'type literal method "warn"' },
        },
      ],
      output: null,
    },
    // Type-literal overloads still report once the overload allowance is off,
    // exactly as the interface form does
    {
      code: `
        type Logger = {
          'log'(message: string): void;
          'log'(message: number): void;
        };
      `,
      options: [
        {
          allowInterfaceMethodSignatures: false,
          allowOverloadedFunctions: false,
        },
      ],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'type literal method "log"' },
        },
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'type literal method "log"' },
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

    // Issue #1562: `allowVoidReturnTypes: false` restores the report and the
    // fix, so the exemption genuinely gates behaviour rather than being inert.
    {
      code: `
        export class Authorizer {
          public async present(url: string): Promise<void> {
            await this.open(url);
          }
        }
      `,
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "present"' },
        },
      ],
      output: `
        export class Authorizer {
          public async present(url: string) {
            await this.open(url);
          }
        }
      `,
    },
    {
      code: 'async function flush(): Promise<void> { await commit(); }',
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "flush"' },
        },
      ],
      output: 'async function flush() { await commit(); }',
    },
    {
      code: 'const log = (message: string): void => { console.log(message); };',
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "log"' },
        },
      ],
      output: 'const log = (message: string) => { console.log(message); };',
    },
    {
      code: `
        class Pinger {
          ping(): void {
            this.socket.send('ping');
          }
        }
      `,
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "ping"' },
        },
      ],
      output: `
        class Pinger {
          ping() {
            this.socket.send('ping');
          }
        }
      `,
    },

    // A value-carrying annotation next to the exempt ones is still redundant
    // under BOTH settings, which is what keeps the carve-out narrow.
    {
      code: `
        export class Authorizer {
          public async token(): Promise<string> {
            return 'tok';
          }
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "token"' },
        },
      ],
      output: `
        export class Authorizer {
          public async token() {
            return 'tok';
          }
        }
      `,
    },
    {
      code: `
        export class Authorizer {
          public async token(): Promise<string> {
            return 'tok';
          }
        }
      `,
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "token"' },
        },
      ],
      output: `
        export class Authorizer {
          public async token() {
            return 'tok';
          }
        }
      `,
    },
    {
      code: 'const label = (value: number): string => String(value);',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "label"' },
        },
      ],
      output: 'const label = (value: number) => String(value);',
    },
    {
      code: 'const label = (value: number): string => String(value);',
      options: [{ allowVoidReturnTypes: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "label"' },
        },
      ],
      output: 'const label = (value: number) => String(value);',
    },

    // Shape edge cases: only a bare `void` and a single-argument `Promise<void>`
    // declare the absence of a result. Anything else can carry a value, so it
    // stays a redundant restatement even with the exemption at its default.
    {
      code: 'async function maybe(): Promise<void | string> { return undefined; }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "maybe"' },
        },
      ],
      output: 'async function maybe() { return undefined; }',
    },
    {
      code: 'async function wrapped(): Promise<Awaited<void>> { await commit(); }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "wrapped"' },
        },
      ],
      output: 'async function wrapped() { await commit(); }',
    },
    {
      code: 'async function nested(): Promise<Promise<void>> { await commit(); }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "nested"' },
        },
      ],
      output: 'async function nested() { await commit(); }',
    },
    {
      code: 'async function arity(): Promise<void, never> { await commit(); }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "arity"' },
        },
      ],
      output: 'async function arity() { await commit(); }',
    },
    {
      code: 'function raw(): Promise { return commit(); }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "raw"' },
        },
      ],
      output: 'function raw() { return commit(); }',
    },
    // `void[]` is an array of values, not the absence of one
    {
      code: 'function empties(): void[] { return []; }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "empties"' },
        },
      ],
      output: 'function empties() { return []; }',
    },
    // A signature-only declaration keeps reporting when its own allowance is
    // off: it has no body to infer from, so its annotation is mandatory rather
    // than redundant, and no fixer ever strips it.
    {
      code: 'interface Logger { debug(message: string): void; }',
      options: [{ allowInterfaceMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'interface method "debug"' },
        },
      ],
      output: null,
    },
    {
      code: 'abstract class BaseTask { abstract run(): Promise<void>; }',
      options: [{ allowAbstractMethodSignatures: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'class method "run"' },
        },
      ],
      output: null,
    },

    // Issue #1649: an annotation can be the only consumer of the type it names.
    // Stripping it on its own leaves the import bound to nothing, so a file that
    // linted clean fails `no-unused-vars` afterwards — and since the rule's own
    // report is resolved by the fix, nothing re-reports the debt. The import
    // therefore goes with the annotation, as one atomic fix.

    // The issue's exact reproduction
    {
      code: `import type { User } from './User';

export const buildUser = (id: string): User => {
  return { id };
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `
export const buildUser = (id: string) => {
  return { id };
};
`,
    },

    // Control: the type is used elsewhere too, so only the annotation goes.
    // Without this the fix could have been "disabled" rather than corrected.
    {
      code: `import type { User } from './User';

const SEED: User = { id: 'seed' };

export const buildUser = (id: string): User => {
  return { id, seed: SEED };
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

const SEED: User = { id: 'seed' };

export const buildUser = (id: string) => {
  return { id, seed: SEED };
};
`,
    },

    // Issue #1654: two annotations sharing the type. Neither is the last
    // consumer on its own, and waiting for a later pass never pays off — once
    // both are stripped the rule has nothing left to report, so no fix remains
    // to carry the cleanup. One fix therefore removes both annotations and the
    // import together. Both reports carry that same fix, so whichever ESLint
    // applies does the whole job; the other conflicts and is dropped.
    {
      code: `import type { User } from './User';

export const buildUser = (id: string): User => ({ id });
export const cloneUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `
export const buildUser = (id: string) => ({ id });
export const cloneUser = (id: string) => ({ id });
`,
    },

    // Three annotations sharing one specifier of a multi-specifier import: the
    // issue's own reproduction, reduced. Only the orphaned specifier goes.
    {
      code: `import type { Tournament, PrizePoolTarget } from './Tournament';

export const selfFund = (id: string): PrizePoolTarget => ({ id });
export const crowdfund = (id: string): PrizePoolTarget => ({ id });
export const sponsor = (id: string): PrizePoolTarget => ({ id });

export const NAME: Tournament = { id: 'x' };
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "selfFund"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "crowdfund"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "sponsor"' },
        },
      ],
      output: `import type { Tournament } from './Tournament';

export const selfFund = (id: string) => ({ id });
export const crowdfund = (id: string) => ({ id });
export const sponsor = (id: string) => ({ id });

export const NAME: Tournament = { id: 'x' };
`,
    },

    // Two types, each shared by a different pair of annotations: the batches are
    // independent, so ESLint applies one and the next pass applies the other.
    // A single pass leaves the second import bound to its own annotations.
    {
      code: `import type { User } from './User';
import type { Team } from './Team';

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
export const buildTeam = (): Team => ({});
export const cloneTeam = (): Team => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildTeam"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneTeam"' },
        },
      ],
      output: `import type { Team } from './Team';

export const buildUser = () => ({});
export const cloneUser = () => ({});
export const buildTeam = (): Team => ({});
export const cloneTeam = (): Team => ({});
`,
    },

    // A type two annotations share, one of which also names a second import:
    // both imports are unbound by the batch that removes both annotations.
    {
      code: `import type { User } from './User';
import type { Role } from './Role';

export const buildUser = (): User => ({});
export const cloneUser = (): Record<Role, User> => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // Only import bindings are unbindable, so only they group annotations. Two
    // annotations sharing a local type alias are stripped one at a time as
    // before, and the alias — which no import surgery can remove — keeps the
    // import that it, not the annotations, references.
    {
      code: `import type { User } from './User';

type Wrapper = { user: User };

export const buildUser = (): Wrapper => ({ user: { id: '1' } });
export const cloneUser = (): Wrapper => ({ user: { id: '2' } });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import type { User } from './User';

type Wrapper = { user: User };

export const buildUser = () => ({ user: { id: '1' } });
export const cloneUser = () => ({ user: { id: '2' } });
`,
    },

    // An aliased specifier is shared by its local name
    {
      code: `import type { User as UserModel } from './User';

export const buildUser = (): UserModel => ({});
export const cloneUser = (): UserModel => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // An inline `type` specifier shared by two annotations, next to a default
    // import that survives
    {
      code: `import Client, { type User } from './client';

export const buildUser = (): User => Client.build();
export const cloneUser = (): User => Client.clone();
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import Client from './client';

export const buildUser = () => Client.build();
export const cloneUser = () => Client.clone();
`,
    },

    // A default import shared by two annotations
    {
      code: `import User from './User';

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A namespace import reached through a qualified name in two annotations
    {
      code: `import * as Api from './api';

export const load = (): Api.User => ({ id: 1 });
export const reload = (): Api.User => ({ id: 2 });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "load"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "reload"' },
        },
      ],
      output: `
export const load = () => ({ id: 1 });
export const reload = () => ({ id: 2 });
`,
    },

    // A namespace still used for a value survives both strips
    {
      code: `import * as Api from './api';

export const load = (): Api.User => Api.fetchUser();
export const reload = (): Api.User => ({ id: 2 });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "load"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "reload"' },
        },
      ],
      output: `import * as Api from './api';

export const load = () => Api.fetchUser();
export const reload = () => ({ id: 2 });
`,
    },

    // Class methods sharing a type are batched like any other annotation
    {
      code: `import type { User } from './User';

export class Repository {
  find(): User {
    return {} as never;
  }
  load(): User {
    return {} as never;
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "find"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
export class Repository {
  find() {
    return {} as never;
  }
  load() {
    return {} as never;
  }
}
`,
    },

    // An annotation nested inside another function counts the same as a
    // top-level one
    {
      code: `import type { User } from './User';

export const outer = (): User => {
  const inner = (): User => ({});
  return inner();
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "outer"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "inner"' },
        },
      ],
      output: `
export const outer = () => {
  const inner = () => ({});
  return inner();
};
`,
    },

    // A value use of the shared type keeps the import: the reference is outside
    // every annotation the batch deletes
    {
      code: `import { User } from './User';

export const SEED = new User();

export const buildUser = (): User => SEED;
export const cloneUser = (): User => SEED;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import { User } from './User';

export const SEED = new User();

export const buildUser = () => SEED;
export const cloneUser = () => SEED;
`,
    },

    // An annotation the rule cannot strip holds the import up for the batch too
    {
      code: `import type { User } from './User';

declare function findUser(id: string): User;

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'function "findUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import type { User } from './User';

declare function findUser(id: string): User;

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A re-export is a consumer no batch can delete
    {
      code: `import type { User } from './User';

export type { User };

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import type { User } from './User';

export type { User };

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A shadowing binding of the same name makes the deletion unprovable, so
    // the batch declines and each annotation falls back to its own judgement
    {
      code: `import type { User } from './User';

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
export const nameOf = (User: string) => User;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import type { User } from './User';

export const buildUser = () => ({});
export const cloneUser = () => ({});
export const nameOf = (User: string) => User;
`,
    },

    // A comment among the specifiers would be swallowed by the separator
    // surgery, so the import stays and only the annotations go
    {
      code: `import type { /* keep */ User, Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `import type { /* keep */ User, Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A directive bound to the import's line would outlive its subject, so the
    // whole batch is declined — annotations included
    {
      code: `// eslint-disable-next-line no-unused-vars
import { User } from './User';

export const buildUser = (): User => ({});
export const cloneUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `// eslint-disable-next-line no-unused-vars
import { User } from './User';

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // The issue's own layout: a multi-line specifier list keeps its shape when
    // one of its specifiers is unbound by a batch
    {
      code: `import type {
  PrizePoolTarget,
  Tournament,
} from './Tournament';

const selfFund = (id: string): PrizePoolTarget => ({ id });
const crowdfund = (id: string): PrizePoolTarget => ({ id });

export const of = (t: Tournament) => [selfFund, crowdfund, t];
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "selfFund"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "crowdfund"' },
        },
      ],
      output: `import type {
  Tournament,
} from './Tournament';

const selfFund = (id: string) => ({ id });
const crowdfund = (id: string) => ({ id });

export const of = (t: Tournament) => [selfFund, crowdfund, t];
`,
    },

    // Function kinds mix freely inside one batch
    {
      code: `import type { User } from './User';

export function buildUser(): User {
  return {} as never;
}

export const cloneUser = function (): User {
  return {} as never;
};

export class Repository {
  find(): User {
    return {} as never;
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "cloneUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "find"' },
        },
      ],
      output: `
export function buildUser() {
  return {} as never;
}

export const cloneUser = function () {
  return {} as never;
};

export class Repository {
  find() {
    return {} as never;
  }
}
`,
    },

    // Empty bodies and comments between the annotations change nothing about
    // which removals belong together
    {
      code: `import type { User } from './User';

// builds nothing
export const buildUser = (): User => {};

/* clones nothing */
export const cloneUser = (): User => {};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `
// builds nothing
export const buildUser = () => {};

/* clones nothing */
export const cloneUser = () => {};
`,
    },

    // No imports at all: two annotations naming built-ins are stripped with no
    // import surgery to consider
    {
      code: `export const buildUser = (): Record<string, string> => ({});
export const cloneUser = (): Record<string, string> => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "cloneUser"' },
        },
      ],
      output: `export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A second reference inside the same function body keeps the import
    {
      code: `import type { User } from './User';

export const buildUser = (id: string): User => {
  return { id } as User;
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

export const buildUser = (id: string) => {
  return { id } as User;
};
`,
    },

    // Multiple specifiers: only the orphaned one goes, siblings stay
    {
      code: `import type { Role, User } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string) => ({ id });
`,
    },

    // The orphan first in the list takes the comma that follows it
    {
      code: `import type { User, Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string) => ({ id });
`,
    },

    // A multi-line specifier list keeps its layout
    {
      code: `import type {
  Role,
  User,
} from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type {
  Role,
} from './types';

export const ROLE: Role = 'admin';

export const buildUser = (id: string) => ({ id });
`,
    },

    // Three specifiers, two of them orphaned by one annotation
    {
      code: `import type { Role, User, Team } from './types';

export const TEAM: Team = 'blue';

export const buildUser = (): Record<Role, User> => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { Team } from './types';

export const TEAM: Team = 'blue';

export const buildUser = () => ({});
`,
    },

    // Every specifier orphaned: the declaration goes rather than becoming
    // \`import type {} from './types';\`
    {
      code: `import type { Role, User } from './types';

export const buildUser = (): Record<Role, User> => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
`,
    },

    // Losing the last named specifier takes the braces with it
    {
      code: `import Client, { type User } from './client';

export const buildUser = (): User => Client.build();
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import Client from './client';

export const buildUser = () => Client.build();
`,
    },

    // A value import — not just \`import type\` — used only as an annotation
    {
      code: `import { User } from './User';

export function buildUser(id: string): User {
  return { id };
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "buildUser"' },
        },
      ],
      output: `
export function buildUser(id: string) {
  return { id };
}
`,
    },

    // An aliased specifier is bound by its local name
    {
      code: `import type { User as UserModel } from './User';

export const buildUser = (): UserModel => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
`,
    },

    // A default import used only as an annotation
    {
      code: `import User from './User';

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
`,
    },

    // A default import whose sibling named specifier survives
    {
      code: `import User, { build } from './User';

export const buildUser = (): User => build();
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import { build } from './User';

export const buildUser = () => build();
`,
    },

    // A namespace import reached through a qualified name
    {
      code: `import * as Api from './api';

export const load = (): Api.User => ({ id: 1 });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "load"' },
        },
      ],
      output: `
export const load = () => ({ id: 1 });
`,
    },

    // A namespace import still used for a value stays put
    {
      code: `import * as Api from './api';

export const load = (): Api.User => Api.fetchUser();
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "load"' },
        },
      ],
      output: `import * as Api from './api';

export const load = () => Api.fetchUser();
`,
    },

    // A reference from an inner scope is still a reference
    {
      code: `import type { User } from './User';

export const buildUser = (): User => {
  const inner = () => {
    const user: User = { id: '1' };
    return user;
  };
  return inner();
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

export const buildUser = () => {
  const inner = () => {
    const user: User = { id: '1' };
    return user;
  };
  return inner();
};
`,
    },

    // An exported binding keeps its import: the re-export is a consumer the
    // deleted annotation says nothing about
    {
      code: `import type { User } from './User';

export type { User };

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

export type { User };

export const buildUser = () => ({});
`,
    },
    {
      code: `import { User } from './User';

export { User };

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import { User } from './User';

export { User };

export const buildUser = () => ({});
`,
    },

    // An annotation the rule cannot strip keeps the import alive for the one it
    // can: a signature-only declaration has no body to infer from
    {
      code: `import type { User } from './User';

declare function findUser(id: string): User;

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'function "findUser"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

declare function findUser(id: string): User;

export const buildUser = () => ({});
`,
    },

    // An exempt annotation is likewise a surviving consumer
    {
      code: `import type { User } from './User';

interface Repository {
  find(id: string): User;
}

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `import type { User } from './User';

interface Repository {
  find(id: string): User;
}

export const buildUser = () => ({});
`,
    },

    // A comment trailing the import on its own line describes the import, so it
    // goes with it rather than being stranded
    {
      code: `import type { User } from './User'; // the stored shape

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `
export const buildUser = () => ({});
`,
    },

    // Deleting the whole fix beats emitting half of it. Each case below would
    // orphan a binding that cannot be unbound cleanly, so the annotation stays
    // too and the report carries no fixer.

    // A directive bound to the import's line would outlive its subject
    {
      code: `// eslint-disable-next-line no-unused-vars
import { User } from './User';

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },
    {
      code: `// @ts-expect-error the module has no types
import { User } from './User';

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // A comment among the specifiers would be swallowed by the separator surgery
    {
      code: `import type { /* keep */ User, Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = (): User => ({});
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // A shadowing binding of the same name means the two views of "is it still
    // used" disagree, and an unprovable deletion is not attempted
    {
      code: `import type { User } from './User';

export const buildUser = (): User => ({});
export const nameOf = (User: string) => User;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // A local type alias cannot be unbound by dropping an import specifier, so
    // an annotation that is its only consumer keeps it company
    {
      code: `type User = { id: string };

export const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },
    // A type parameter is likewise stranded by the strip
    {
      code: `export function firstOf<T>(items: unknown[]): T {
  return items[0] as T;
}

export function emptyOf<T>(): T[] {
  return [];
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "firstOf"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "emptyOf"' },
        },
      ],
      output: `export function firstOf<T>(items: unknown[]) {
  return items[0] as T;
}

export function emptyOf<T>(): T[] {
  return [];
}
`,
    },
    // An exported local type has a consumer outside the file, so the annotation
    // still goes
    {
      code: `export type User = { id: string };

export const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `export type User = { id: string };

export const buildUser = (id: string) => ({ id });
`,
    },
    // A local type used elsewhere too is not orphaned by the strip
    {
      code: `type User = { id: string };

const SEED: User = { id: 'seed' };

export const buildUser = (id: string): User => ({ id, seed: SEED });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `type User = { id: string };

const SEED: User = { id: 'seed' };

export const buildUser = (id: string) => ({ id, seed: SEED });
`,
    },
  ],
});

// Both rules ship in the recommended config and `prefer-type-over-interface` is
// fixable, so a single `eslint --fix` pass rewrites every interface into a type
// alias. The members it carries over are unchanged and just as non-inferable, so
// a declaration this rule was silent on must stay silent afterwards — the remedy
// would otherwise be unavailable, since restoring the `interface` keyword is
// undone by the next fix pass and a method signature cannot drop its return type
// without becoming a different declaration.
describe('no-explicit-return-type after prefer-type-over-interface --fix', () => {
  const VICTIM_ID = '@blumintinc/blumint/no-explicit-return-type';
  const CULPRIT_ID = '@blumintinc/blumint/prefer-type-over-interface';
  const FILENAME = 'x.ts';

  const OVERLOAD_SOURCE = [
    'interface Logger {',
    "  'log'(message: string): void;",
    "  'log'(message: number): void;",
    '}',
    '',
  ].join('\n');

  const STRIPPABLE_SOURCE = [
    'interface Logger {',
    "  'log'(message: string): void;",
    "  'log'(message: number): void;",
    '}',
    '',
    'export function countLoggers(): number {',
    '  return 1;',
    '}',
    '',
  ].join('\n');

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      VICTIM_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      CULPRIT_ID,
      preferTypeOverInterface as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  // The option is only meaningful when turned off: with the default `true` every
  // method signature is exempt and the fence would pass vacuously.
  const VICTIM_RULES: Linter.RulesRecord = {
    [VICTIM_ID]: ['error', { allowInterfaceMethodSignatures: false }],
  };

  it('reports nothing before or after the interface becomes a type alias', () => {
    const linter = makeLinter();
    expect(
      linter.verify(OVERLOAD_SOURCE, configFor(VICTIM_RULES), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(
      OVERLOAD_SOURCE,
      configFor({ [CULPRIT_ID]: 'error' }),
      FILENAME,
    );
    // Without this assertion the test passes vacuously whenever the culprit
    // stops rewriting the interface.
    expect(fixed.output).toContain('type Logger = {');
    expect(fixed.output).not.toContain('interface Logger');
    expect(
      linter.verify(fixed.output, configFor(VICTIM_RULES), FILENAME),
    ).toHaveLength(0);
  });

  it('still reports a strippable function annotation through the same pipeline', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      STRIPPABLE_SOURCE,
      configFor({ [CULPRIT_ID]: 'error' }),
      FILENAME,
    );
    expect(fixed.output).toContain('type Logger = {');

    const messages = linter.verify(
      fixed.output,
      configFor(VICTIM_RULES),
      FILENAME,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].messageId).toBe('noExplicitReturnTypeInferable');
  });
});

// RuleTester applies one fix pass and never re-lints, so it cannot observe the
// consequence this fix exists to prevent (issue #1649): an import left bound to
// nothing after its only consumer — the return type annotation — is deleted.
// These drive the real `Linter` to a fixed point and re-lint the output with
// `no-unused-vars`.
describe('no-explicit-return-type --fix leaves no import bound to nothing', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'x.ts';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  const FIX_RULES: Linter.RulesRecord = { [RULE_ID]: 'error' };
  const UNUSED_RULES: Linter.RulesRecord = { 'no-unused-vars': 'error' };

  const REPRO = [
    "import type { User } from './User';",
    '',
    'export const buildUser = (id: string): User => {',
    '  return { id };',
    '};',
    '',
  ].join('\n');

  // Without this the assertions below would hold for a rule that simply stopped
  // fixing, or for a `no-unused-vars` that never noticed a type-only import.
  it('reports an unused binding for the shape a bare annotation strip produces', () => {
    const stripped = REPRO.replace('(id: string): User =>', '(id: string) =>');
    const messages = makeLinter().verify(
      stripped,
      configFor(UNUSED_RULES),
      FILENAME,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("'User' is defined but never used");
  });

  it('removes the annotation and the import it was the sole consumer of', () => {
    const linter = makeLinter();
    expect(
      linter.verify(REPRO, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(REPRO, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).not.toContain(': User');
    expect(fixed.output).not.toContain('import');
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
  });

  // Issue #1654: a type several strippable annotations share. No annotation is
  // the last consumer while the others stand, and once they are all stripped
  // the rule has nothing left to report — there is no later pass, because there
  // is no later report. The annotations that hold the import up are therefore
  // removed by one fix, together with the import.
  it('unbinds an import two annotations share, in one fix', () => {
    const linter = makeLinter();
    const source = [
      "import type { User } from './User';",
      '',
      'export const buildUser = (id: string): User => ({ id });',
      'export const cloneUser = (user: unknown): User => ({ id: String(user) });',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).not.toContain(': User =>');
    expect(fixed.output).not.toContain('import');
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
    // The property that actually matters: nothing is left naming a type the
    // file no longer binds.
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });

  // The issue's own shape: three annotations, one of several specifiers. Driven
  // to a fixed point rather than a single pass, so a cleanup that needed a
  // second pass would still count — the assertion is about where the fixer
  // settles, not how many passes it takes.
  it('unbinds one specifier of an import three annotations share', () => {
    const linter = makeLinter();
    const source = [
      "import type { Tournament, PrizePoolTarget } from './Tournament';",
      '',
      'const selfFund = (id: string): PrizePoolTarget => ({ id });',
      'const crowdfund = (id: string): PrizePoolTarget => ({ id });',
      'const sponsor = (id: string): PrizePoolTarget => ({ id });',
      '',
      'export const of = (t: Tournament) => [selfFund, crowdfund, sponsor, t];',
      '',
    ].join('\n');

    expect(
      linter.verify(source, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).not.toContain('PrizePoolTarget');
    expect(fixed.output).toContain(
      "import type { Tournament } from './Tournament';",
    );
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });

  // A batch deletes a wider span than a lone strip, so ESLint drops any fix
  // overlapping it — including this rule's own fix for an unrelated annotation
  // sitting between the batched ones. Those land on the next pass, which is
  // what the fix loop is for; what matters is where it settles.
  it('finishes the annotations a batch crowds out of its own pass', () => {
    const linter = makeLinter();
    const source = [
      "import type { User } from './User';",
      '',
      'export const buildUser = (): User => ({});',
      'export const countUsers = (): number => 1;',
      'export const cloneUser = (): User => ({});',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).not.toContain(':');
    expect(linter.verify(fixed.output, configFor(FIX_RULES), FILENAME)).toEqual(
      [],
    );
    expect(danglingTypeReferences(fixed.output)).toEqual([]);
  });

  // Re-invoking the fixer must not turn up work the first invocation left
  // behind: the orphan this issue is about survived precisely because nothing
  // re-reported it, so "no reports left" is not by itself evidence of a clean
  // file.
  it('settles with nothing left to clean up', () => {
    const linter = makeLinter();
    const source = [
      "import type { User } from './User';",
      '',
      'export const buildUser = (id: string): User => ({ id });',
      'export const cloneUser = (user: unknown): User => ({ id: String(user) });',
      '',
    ].join('\n');

    let code = source;
    for (let invocation = 0; invocation < 3; invocation++) {
      const fixed = linter.verifyAndFix(code, configFor(FIX_RULES), FILENAME);
      code = fixed.output;
    }

    expect(linter.verify(code, configFor(FIX_RULES), FILENAME)).toHaveLength(0);
    expect(linter.verify(code, configFor(UNUSED_RULES), FILENAME)).toHaveLength(
      0,
    );
    expect(danglingTypeReferences(code)).toEqual([]);
  });

  // The mirror image: a binding with a consumer the fix does not touch keeps
  // its import, so the fix is corrected rather than switched off.
  it('keeps an import that survives the annotation', () => {
    const linter = makeLinter();
    const source = [
      "import type { User } from './User';",
      '',
      "const SEED: User = { id: 'seed' };",
      '',
      'export const buildUser = (id: string): User => ({ id, seed: SEED });',
      '',
    ].join('\n');

    const fixed = linter.verifyAndFix(source, configFor(FIX_RULES), FILENAME);
    expect(fixed.output).toContain("import type { User } from './User';");
    expect(fixed.output).not.toContain('(id: string): User =>');
    expect(
      linter.verify(fixed.output, configFor(UNUSED_RULES), FILENAME),
    ).toHaveLength(0);
  });
});

// A rule cannot see `eslint-disable`: suppression is applied to reports after
// they are emitted. So a fix may never assume that another report's fix also
// lands — a disabled sibling annotation keeps referencing the type forever, and
// deleting "its" import strands that reference. These pin every suppression
// shape against the real `Linter`, which is the only place the interaction
// exists: RuleTester bypasses directive processing entirely.
describe('no-explicit-return-type --fix under eslint-disable', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'x.ts';

  const fixWith = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' },
      },
      FILENAME,
    );
  };

  const IMPORT = "import type { User } from './User';";
  const annotated = (name: string) =>
    `export const ${name} = (id: string): User => {\n  return { id };\n};`;

  const expectNoDanglingType = (source: string, output: string) => {
    expect(danglingTypeReferences(source)).toEqual([]);
    expect(danglingTypeReferences(output)).toEqual([]);
  };

  it('strips both annotations and strands nothing when neither is disabled', () => {
    const source = `${IMPORT}\n\n${annotated('a')}\n\n${annotated('b')}\n`;
    const { output } = fixWith(source);

    // Vacuity guard: a rule that stopped fixing would pass every assertion
    // about what the output does not contain.
    expect(output).not.toContain(': User =>');
    expectNoDanglingType(source, output);
  });

  it('keeps the import when a sibling annotation is disabled next-line', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      `// eslint-disable-next-line ${RULE_ID}`,
      annotated('b'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain(IMPORT);
    expect(output).toContain('(id: string): User =>');
    expectNoDanglingType(source, output);
  });

  it('keeps the import when a sibling annotation is disabled by a block', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      `/* eslint-disable ${RULE_ID} */`,
      annotated('b'),
      `/* eslint-enable ${RULE_ID} */`,
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain(IMPORT);
    expect(output).toContain('(id: string): User =>');
    expectNoDanglingType(source, output);
  });

  it('changes nothing when the sole consumer is itself disabled', () => {
    const source = [
      IMPORT,
      '',
      `// eslint-disable-next-line ${RULE_ID}`,
      annotated('b'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toBe(source);
    expectNoDanglingType(source, output);
  });

  // Issue #1654 batches the annotations that jointly hold an import up. A
  // disabled member of that set is the case the batch must not assume away: its
  // annotation stays, so the import it names has to stay too.
  it('keeps the import when one of three sharing annotations is disabled', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      `// eslint-disable-next-line ${RULE_ID}`,
      annotated('b'),
      '',
      annotated('c'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain(IMPORT);
    // Exactly the disabled annotation survives.
    expect(output.match(/: User =>/g)).toHaveLength(1);
    expectNoDanglingType(source, output);
    expect(unusedBindings(output)).toEqual([]);
  });

  it('keeps the import when a sibling is disabled on its own line', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      `export const b = (id: string): User => { // eslint-disable-line ${RULE_ID}`,
      '  return { id };',
      '};',
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain(IMPORT);
    expect(output).toContain('(id: string): User =>');
    expectNoDanglingType(source, output);
    expect(unusedBindings(output)).toEqual([]);
  });

  it('keeps the import when a sibling is disabled by a bare block directive', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      '/* eslint-disable */',
      annotated('b'),
      '/* eslint-enable */',
      '',
      annotated('c'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).toContain(IMPORT);
    expect(output.match(/: User =>/g)).toHaveLength(1);
    expectNoDanglingType(source, output);
    expect(unusedBindings(output)).toEqual([]);
  });

  // The control for the three above: a directive that cannot silence this rule
  // must not cost the cleanup, or "suppression-safe" would just mean "switched
  // off by any nearby comment".
  it('still unbinds the import when the directive names another rule', () => {
    const source = [
      IMPORT,
      '',
      annotated('a'),
      '',
      '// eslint-disable-next-line no-unused-vars',
      annotated('b'),
      '',
    ].join('\n');
    const { output } = fixWith(source);

    expect(output).not.toContain(IMPORT);
    expect(output).not.toContain(': User =>');
    expectNoDanglingType(source, output);
    expect(unusedBindings(output)).toEqual([]);
  });
});

// The mutual-recursion carve-out resolves its candidate pair through the scope
// chain of the declaration that carries the annotation, not through
// `Program.body`. `tsc` raises the same TS7023 for a pair in a function body, an
// arrow body, a `namespace`, a bare block or a method body as it does for a
// top-level pair, so nesting cannot decide whether an annotation is removable —
// and because this rule's fixer DELETES the annotation, getting that wrong ships
// code that does not compile (#1771).
ruleTesterTs.run('no-explicit-return-type', noExplicitReturnType, {
  valid: [
    // The issue's own reproduction: mutually recursive local arrows in a
    // function body. Stripping either annotation yields TS7023 on both.
    `
export function makeParity() {
  const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
  return { isEven, isOdd };
}
`,
    // The control the issue pairs it with, which was already silent. It stays
    // silent, so the fix equalises the two rather than moving both.
    `
const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
export const parity = { isEven, isOdd };
`,
    // The same pair inside an arrow-bodied factory.
    `
export const makeParity = () => {
  const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
  return { isEven, isOdd };
};
`,
    // A `namespace` body is a TSModuleBlock, a statement container the module
    // scope walk reaches through the `export` wrapper on each declaration.
    `
export namespace Parity {
  export function isEven(n: number): boolean {
    return n === 0 ? true : isOdd(n - 1);
  }
  export function isOdd(n: number): boolean {
    return n === 0 ? false : isEven(n - 1);
  }
}
`,
    // A bare block binds its function declarations exactly as a function body
    // does.
    `
{
  function isEven(n: number): boolean {
    return n === 0 ? true : isOdd(n - 1);
  }
  function isOdd(n: number): boolean {
    return n === 0 ? false : isEven(n - 1);
  }
  console.log(isEven(4));
}
`,
    // A class method body.
    `
export class Parity {
  public check(n: number) {
    const isEven = (m: number): boolean => (m === 0 ? true : isOdd(m - 1));
    const isOdd = (m: number): boolean => (m === 0 ? false : isEven(m - 1));
    return isEven(n);
  }
}
`,
    // A `switch` case's consequent is a statement list of its own.
    `
export function parityOf(kind: string, n: number) {
  switch (kind) {
    case 'parity': {
      const isEven = (m: number): boolean => (m === 0 ? true : isOdd(m - 1));
      const isOdd = (m: number): boolean => (m === 0 ? false : isEven(m - 1));
      return isEven(n);
    }
    default:
      return false;
  }
}
`,
    // A class static block.
    `
export class Parity {
  static readonly seed: boolean;
  static {
    const isEven = (m: number): boolean => (m === 0 ? true : isOdd(m - 1));
    const isOdd = (m: number): boolean => (m === 0 ? false : isEven(m - 1));
    Parity.seed = isEven(4);
  }
}
`,
    // The cycle crossing a scope boundary outward: the inner function returns a
    // call to the outer one, which returns a call to the inner. `tsc` reports
    // TS7023 on both, so the outward walk must keep reaching enclosing
    // containers rather than stopping at the innermost one.
    `
export function outer(): number {
  function inner(): number {
    return outer();
  }
  return inner();
}
`,
    // A cycle longer than a pair: the walk follows edges transitively, so three
    // nested arrows closing a ring keep their annotations. `tsc` reports TS7023
    // on all three without them.
    `
export function factory() {
  const a = (n: number): number => b(n);
  const b = (n: number): number => c(n);
  const c = (n: number): number => a(n);
  return { a, b, c };
}
`,
    // Direct recursion nested in a function body never consulted the
    // module-scope graph and stayed silent throughout; pinned so the rewrite
    // cannot regress the path it did not touch.
    `
export function outer() {
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
  return fact;
}
`,
  ],
  invalid: [
    // The isolating control for the whole carve-out: a nested annotation whose
    // function is not recursive at all is still redundant, and is still
    // reported and stripped.
    {
      code: `
export function outer() {
  const double = (n: number): number => n * 2;
  return double;
}
`,
      output: `
export function outer() {
  const double = (n: number) => n * 2;
  return double;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // Sibling scopes: two same-named helpers that cannot see each other are not
    // a mutually recursive pair, however suggestive the names are. Reading the
    // whole file instead of the scope chain would exempt both.
    {
      code: `
export function first() {
  const isEven = (n: number): boolean => n === 0;
  return isEven;
}
export function second() {
  const isOdd = (n: number): boolean => n !== 0;
  return isOdd;
}
`,
      output: `
export function first() {
  const isEven = (n: number) => n === 0;
  return isEven;
}
export function second() {
  const isOdd = (n: number) => n !== 0;
  return isOdd;
}
`,
      errors: [
        { messageId: 'noExplicitReturnTypeInferable' },
        { messageId: 'noExplicitReturnTypeInferable' },
      ],
    },
    // The cycle broken: `isOdd` no longer references `isEven`, so neither
    // annotation is load-bearing and both are stripped even though the pair is
    // nested and the names are unchanged.
    {
      code: `
export function makeParity() {
  const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number): boolean => n % 2 === 1;
  return { isEven, isOdd };
}
`,
      output: `
export function makeParity() {
  const isEven = (n: number) => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number) => n % 2 === 1;
  return { isEven, isOdd };
}
`,
      errors: [
        { messageId: 'noExplicitReturnTypeInferable' },
        { messageId: 'noExplicitReturnTypeInferable' },
      ],
    },
    // A nested helper whose name matches a mutually recursive module-scope pair
    // shadows it. The module-scope pair keeps its exemption; the shadowing
    // helper, which references nothing, does not inherit one.
    {
      code: `
const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
export function outer() {
  const isOdd = (n: number): boolean => n === 1;
  return isOdd;
}
export const parity = { isEven, isOdd };
`,
      output: `
const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
export function outer() {
  const isOdd = (n: number) => n === 1;
  return isOdd;
}
export const parity = { isEven, isOdd };
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // The shadow need not be a function. A `const other = 3` binds the name too,
    // so the reference reaches a number rather than the cyclic module-scope
    // `other`, and `tsc` accepts the strip.
    {
      code: `
const helper = (n: number): number => other(n);
const other = (n: number): number => helper(n);
export function outer() {
  const other = 3;
  const helper = (n: number): number => n + other;
  return helper;
}
export const pair = { helper, other };
`,
      output: `
const helper = (n: number): number => other(n);
const other = (n: number): number => helper(n);
export function outer() {
  const other = 3;
  const helper = (n: number) => n + other;
  return helper;
}
export const pair = { helper, other };
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // An import binds its local name in module scope, so a nested helper naming
    // it reaches the import rather than a same-named local function.
    {
      code: `
import { other } from './other';
export function outer() {
  const helper = (n: number): number => other(n);
  return helper;
}
`,
      output: `
import { other } from './other';
export function outer() {
  const helper = (n: number) => other(n);
  return helper;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // A chain of three closes no cycle when its last link returns a value, so
    // every annotation in it is redundant even though the first two do
    // reference a sibling.
    {
      code: `
export function factory() {
  const a = (n: number): number => b(n);
  const b = (n: number): number => c(n);
  const c = (n: number): number => n;
  return { a, b, c };
}
`,
      output: `
export function factory() {
  const a = (n: number) => b(n);
  const b = (n: number) => c(n);
  const c = (n: number) => n;
  return { a, b, c };
}
`,
      errors: [
        { messageId: 'noExplicitReturnTypeInferable' },
        { messageId: 'noExplicitReturnTypeInferable' },
        { messageId: 'noExplicitReturnTypeInferable' },
      ],
    },
  ],
});

/**
 * A valid case proves only that no report was emitted. This rule's fix DELETES
 * the annotation, so what a carve-out is actually protecting is the file's
 * bytes: an exempt shape must come back byte-identical from a real `--fix` run,
 * and a reported one must converge in a single pass rather than oscillating.
 *
 * Each exempt fixture here is a shape `tsc --noEmit --strict` accepts as written
 * and rejects with TS7023 once the annotations are removed, so "no fix emitted"
 * is the difference between a compiling file and a broken build.
 */
describe('no-explicit-return-type mutual recursion across scopes', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';

  const fixWith = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' },
      },
      'x.ts',
    );
  };

  const NESTED_PAIR = `export function makeParity() {
  const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
  const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
  return { isEven, isOdd };
}
`;

  const TOP_LEVEL_PAIR = `const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
export const parity = { isEven, isOdd };
`;

  const NAMESPACE_PAIR = `export namespace Parity {
  export function isEven(n: number): boolean {
    return n === 0 ? true : isOdd(n - 1);
  }
  export function isOdd(n: number): boolean {
    return n === 0 ? false : isEven(n - 1);
  }
}
`;

  const METHOD_BODY_PAIR = `export class Parity {
  public check(n: number) {
    const isEven = (m: number): boolean => (m === 0 ? true : isOdd(m - 1));
    const isOdd = (m: number): boolean => (m === 0 ? false : isEven(m - 1));
    return isEven(n);
  }
}
`;

  it.each([
    ['a function body', NESTED_PAIR],
    ['module scope', TOP_LEVEL_PAIR],
    ['a namespace body', NAMESPACE_PAIR],
    ['a class method body', METHOD_BODY_PAIR],
  ])('emits no fix for a mutually recursive pair in %s', (_label, source) => {
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(false);
    expect(output).toBe(source);
    // The annotations are what `tsc` needs to break the inference cycle, so
    // their survival is the property under test, not a side effect of it.
    expect(output).toContain('isEven');
    expect(output).toContain(': boolean');
  });

  // Non-vacuity: the same harness, on a shape with no cycle, must still rewrite.
  // Without this, a rule that stopped reporting entirely would pass every
  // assertion above.
  it('still strips a nested annotation that no cycle requires', () => {
    const source = `export function outer() {
  const double = (n: number): number => n * 2;
  return double;
}
`;
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(true);
    expect(output).toBe(`export function outer() {
  const double = (n: number) => n * 2;
  return double;
}
`);
    // Converged: re-running the fixer finds nothing left to change.
    expect(fixWith(output).output).toBe(output);
  });

  // The one direction of this change that ADDS a report, and the one a
  // downstream consumer feels: a nested helper shadowing a cyclic module-scope
  // name used to inherit that name's exemption. `tsc --noEmit --strict` accepts
  // the stripped form, so the addition is correct — and the pair it shadows must
  // keep both of its own annotations through the same pass.
  it('strips a nested shadow while the module-scope cycle it shadows survives', () => {
    const source = `const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));
export function outer() {
  const isOdd = (n: number): boolean => n === 1;
  return isOdd;
}
export const parity = { isEven, isOdd };
`;
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(true);
    expect(output).toContain(
      'const isEven = (n: number): boolean => (n === 0 ? true : isOdd(n - 1));',
    );
    expect(output).toContain(
      'const isOdd = (n: number): boolean => (n === 0 ? false : isEven(n - 1));',
    );
    expect(output).toContain('const isOdd = (n: number) => n === 1;');
    expect(fixWith(output).output).toBe(output);
  });

  it('still strips both annotations of a nested same-named sibling pair', () => {
    const source = `export function first() {
  const isEven = (n: number): boolean => n === 0;
  return isEven;
}
export function second() {
  const isOdd = (n: number): boolean => n !== 0;
  return isOdd;
}
`;
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(true);
    expect(output).not.toContain(': boolean');
    expect(fixWith(output).output).toBe(output);
  });
});
