import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as tsParser from '@typescript-eslint/parser';
import * as prettier from 'prettier';
import { ruleTesterTs } from '../utils/ruleTester';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';
import { preferTypeOverInterface } from '../rules/prefer-type-over-interface';
import { enforceMemoizeAsync } from '../rules/enforce-memoize-async';

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

    // The IMPLEMENTATION signature of an overload set carries the type every
    // overload above it is checked against, so it is not a restatement of the
    // body. Stripping it infers `void` here and makes the `: string` overload
    // TS2394 (issue #2019).
    `
      function get(): void;
      function get(param: string): string;
      function get(param?: string): void | string {}
    `,
    `
      function processData(_isStrict: true): string;
      function processData(_isStrict: false): number;
      function processData(_isStrict: boolean): string | number {
        return _isStrict ? 'strict' : 42;
      }
    `,
    // An overload set may export every member
    `
      export function convert(input: string): number;
      export function convert(input: number): string;
      export function convert(input: string | number): number | string {
        return input as never;
      }
    `,
    // A single signature plus its implementation is already an overload set:
    // the signature's annotation is mandatory and the implementation's is what
    // that signature is checked against.
    `
      function convert(input: string): number;
      function convert(input: unknown): number {
        return Number(input);
      }
    `,
    // An overload set inside a function body, a bare block or a `switch` case
    // binds its name exactly as a top-level one does, so depth cannot decide
    // whether the set exists.
    `
      function createConverter() {
        function convert(value: string): number;
        function convert(value: number): string;
        function convert(value: string | number): number | string {
          return value as never;
        }
        return convert;
      }
    `,
    `
      {
        function convert(value: string): number;
        function convert(value: number): string;
        function convert(value: string | number): number | string {
          return value as never;
        }
      }
    `,
    `
      switch (kind) {
        case 'a': {
          function convert(value: string): number;
          function convert(value: number): string;
          function convert(value: string | number): number | string {
            return value as never;
          }
          break;
        }
      }
    `,
    // A namespace body is a statement container too
    `
      namespace Conversions {
        export function convert(input: string): number;
        export function convert(input: number): string;
        export function convert(input: string | number): number | string {
          return input as never;
        }
      }
    `,
    // Class methods overload the same way, and their body-less members are the
    // signatures.
    `
      class Converter {
        convert(input: string): number;
        convert(input: number): string;
        convert(input: string | number): number | string {
          return input as never;
        }
      }
    `,
    `
      class Converter {
        static convert(input: string): number;
        static convert(input: number): string;
        static convert(input: string | number): number | string {
          return input as never;
        }
      }
    `,
    `
      class Converter {
        #convert(input: string): number;
        #convert(input: number): string;
        #convert(input: string | number): number | string {
          return input as never;
        }
      }
    `,
    `
      class Converter {
        'convert'(input: string): number;
        'convert'(input: number): string;
        'convert'(input: string | number): number | string {
          return input as never;
        }
      }
    `,
    // A class expression declares the same members as a declaration
    `
      const Converter = class {
        convert(input: string): number;
        convert(input: number): string;
        convert(input: string | number): number | string {
          return input as never;
        }
      };
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

    // valid — the annotation is load-bearing at the decoration site
    `function Log(): MethodDecorator {
  return () => {};
}
class E {
  @Log()
  async compute() {
    return 1;
  }
}`,
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

    // An overload set cannot span containers, so a same-named function in a
    // DIFFERENT scope neither joins the set nor inherits its exemption.
    {
      code: `
        function createConverter() {
          function convert(input: string): number;
          function convert(input: string | number): number {
            return Number(input);
          }
          return convert;
        }
        function convert(input: string): number {
          return Number(input);
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "convert"' },
        },
      ],
      output: `
        function createConverter() {
          function convert(input: string): number;
          function convert(input: string | number): number {
            return Number(input);
          }
          return convert;
        }
        function convert(input: string) {
          return Number(input);
        }
      `,
    },
    // A static overload set says nothing about the instance method that spells
    // the same name.
    {
      code: `
        class Converter {
          static convert(input: string): number;
          static convert(input: string | number): number {
            return Number(input);
          }
          convert(input: string): number {
            return Number(input);
          }
        }
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "convert"' },
        },
      ],
      output: `
        class Converter {
          static convert(input: string): number;
          static convert(input: string | number): number {
            return Number(input);
          }
          convert(input: string) {
            return Number(input);
          }
        }
      `,
    },
    // A lone function with a body overloads nothing
    {
      code: 'function convert(input: string): number { return Number(input); }',
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "convert"' },
        },
      ],
      output: 'function convert(input: string) { return Number(input); }',
    },
    // The implementation's annotation is load-bearing regardless of how the
    // overload allowance is configured: no option may request a fix that fails
    // to compile. The option reaches the declaration-only signatures, whose
    // reports carry no fixer, so the implementation is left untouched.
    {
      code: `
        function convert(input: string): number;
        function convert(input: number): string;
        function convert(input: string | number): number | string {
          return input as never;
        }
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
    // Class-method overload signatures report once the overload allowance is
    // off, and never carry a fixer: they have no body to infer from.
    {
      code: `
        class Converter {
          convert(input: string): number;
          convert(input: number): string;
          convert(input: string | number): number | string {
            return input as never;
          }
        }
      `,
      options: [{ allowOverloadedFunctions: false }],
      errors: [
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'class method "convert"' },
        },
        {
          messageId: 'noExplicitReturnTypeNonInferable',
          data: { functionKind: 'class method "convert"' },
        },
      ],
      output: null,
    },
    // A computed key names nothing resolvable, so the method joins no overload
    // set and stays reportable.
    {
      code: `
        class Converter {
          [key](input: string): number {
            return Number(input);
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
        class Converter {
          [key](input: string) {
            return Number(input);
          }
        }
      `,
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

    // Same factory as the valid case, with the self-reference removed. `orderBy`
    // is a plain property here rather than the `() => FakeQuery` closure the
    // paired valid case declares, because a callable member makes the
    // annotation a resource-handle declaration the #2073 carve-out preserves
    // for its own reason — this control would then stay green however the
    // recursion exemption behaved. The handle-shaped spelling is pinned as a
    // valid case in the resource-handle block at the end of this file.
    {
      code: `
        type FakeQuery = { orderBy: FakeQuery | null };
        declare const fallback: FakeQuery;
        const buildQuery = (p?: string): FakeQuery => {
          return { orderBy: fallback };
        };
      `,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildQuery"' },
        },
      ],
      output: `
        type FakeQuery = { orderBy: FakeQuery | null };
        declare const fallback: FakeQuery;
        const buildQuery = (p?: string) => {
          return { orderBy: fallback };
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

    // Deleting the alias these two annotations share would strand the import the
    // alias — not the annotations — references, and one deletion is as far as
    // this cleanup reaches. Neither annotation may go alone either, since
    // together they are the alias's only consumers, so the whole batch declines.
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
      output: null,
    },

    // The same two annotations over an alias that references nothing: the alias
    // goes with them, as one fix (#1902)
    {
      code: `type Wrapper = { id: string };

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Wrapper => ({ id: '2' });
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
export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
`,
    },

    // An interface is unbound the same way a type alias is
    {
      code: `interface Wrapper { id: string }

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Wrapper => ({ id: '2' });
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
export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
`,
    },

    // An EXPORTED alias has a consumer no edit to this file can reach, so it
    // stays and only the annotations go — the over-eager removal this cleanup
    // must never make
    {
      code: `export type Wrapper = { id: string };

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Wrapper => ({ id: '2' });
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
      output: `export type Wrapper = { id: string };

export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
`,
    },

    // An alias named by a third, non-annotation reference survives too
    {
      code: `type Wrapper = { id: string };

const SEED: Wrapper = { id: 'seed' };

export const buildUser = (): Wrapper => SEED;
export const cloneUser = (): Wrapper => SEED;
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
      output: `type Wrapper = { id: string };

const SEED: Wrapper = { id: 'seed' };

export const buildUser = () => SEED;
export const cloneUser = () => SEED;
`,
    },

    // Two aliases, each named only by the annotations of one batch: both go
    {
      code: `type Wrapper = { id: string };
type Holder = { id: string };

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Holder => ({ id: '2' });
export const mergeUser = (): Wrapper & Holder => ({ id: '3' });
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
          data: { functionKind: 'arrow function "mergeUser"' },
        },
      ],
      output: `
export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
export const mergeUser = () => ({ id: '3' });
`,
    },

    // A value binding read only through `typeof` is stranded exactly as a type
    // name is, and a value declaration is not something this cleanup will
    // delete — so the whole batch declines
    {
      code: `const CONFIG = { debug: false };

export const buildUser = (): typeof CONFIG => ({ debug: false });
export const cloneUser = (): typeof CONFIG => ({ debug: false });
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
      output: null,
    },

    // The same binding read by the bodies too keeps itself alive, so both
    // annotations go
    {
      code: `const CONFIG = { debug: false };

export const buildUser = (): typeof CONFIG => CONFIG;
export const cloneUser = (): typeof CONFIG => CONFIG;
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
      output: `const CONFIG = { debug: false };

export const buildUser = () => CONFIG;
export const cloneUser = () => CONFIG;
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

    // A shadowing binding of the same name makes the deletion unprovable. The
    // batch cannot fall back to stripping one annotation at a time — that is the
    // same two deletions, arriving in the same `--fix` run, with no report left
    // to unbind the import afterwards (#1902) — so it declines outright.
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
      output: null,
    },

    // A comment among the specifiers is carried through the separator surgery
    // rather than deciding whether the transform fires at all (#1902)
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
      output: `import type { /* keep */ Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A comment between the orphan and its surviving sibling is carried into
    // the sibling's place
    {
      code: `import type { User /* keep */, Role } from './types';

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
      output: `import type { /* keep */ Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = () => ({});
export const cloneUser = () => ({});
`,
    },

    // A directive among the specifiers means something at the position it
    // occupies, so re-emitting it elsewhere is not carrying it — the fix is
    // withheld instead
    {
      code: `import type {
  User,
  // eslint-disable-next-line no-unused-vars
  Role,
} from './types';

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
      output: null,
    },

    // `@ts-expect-error` among the specifiers is positional for the same reason
    {
      code: `import type {
  User,
  // @ts-expect-error the module has no types
  Role,
} from './types';

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
      output: null,
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
      output: null,
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

    // A comment among the specifiers rides along with the separator surgery
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
      output: `import type { /* keep */ Role } from './types';

export const ROLE: Role = 'admin';

export const buildUser = () => ({});
`,
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

    // A module-scope type alias whose only consumer is the annotation goes with
    // it, the same way an import specifier does (#1902)
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
      output: `
export const buildUser = (id: string) => ({ id });
`,
    },

    // A type alias declared inside a block is not module-scope, and the
    // containers that hold one do not all keep it private, so it is left alone
    {
      code: `export function build() {
  type Local = { id: string };
  const make = (): Local => ({ id: '1' });
  return make();
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "make"' },
        },
      ],
      output: null,
    },

    // Interface merging leaves the name meaning something else rather than
    // nothing, so no declaration of it is deleted
    {
      code: `interface User { id: string }
interface User { name: string }

export const buildUser = (id: string): User => ({ id, name: '' });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // A file with no import or export is a SCRIPT, whose type declarations are
    // visible to the whole program — nothing here proves the alias is dead
    {
      code: `type User = { id: string };

const buildUser = (id: string): User => ({ id });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // An enum emits a runtime object, so deleting it would change what the file
    // does rather than what it declares — the batch declines instead
    {
      code: `enum Role { Admin }

export const readRole = (): Role => 0 as never;
export const readBackupRole = (): Role => 0 as never;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readRole"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readBackupRole"' },
        },
      ],
      output: null,
    },

    // The same enum read as a value keeps itself alive, so both annotations go
    {
      code: `enum Role { Admin }

export const readRole = (): Role => Role.Admin;
export const readBackupRole = (): Role => Role.Admin;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readRole"' },
        },
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readBackupRole"' },
        },
      ],
      output: `enum Role { Admin }

export const readRole = () => Role.Admin;
export const readBackupRole = () => Role.Admin;
`,
    },

    // A class is not a type declaration this cleanup deletes, whether or not the
    // annotations are its only consumers
    {
      code: `class User {}

export const buildUser = (): User => ({} as never);
export const cloneUser = (): User => ({} as never);
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
      output: null,
    },
    {
      code: `class User {}

export const buildUser = (): User => new User();
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `class User {}

export const buildUser = () => new User();
`,
    },

    // A type declared inside a `namespace` is not module-scope
    {
      code: `namespace Api {
  export type Wrapper = { id: string };
}

export const buildUser = (): Api.Wrapper => ({ id: '1' });
export const cloneUser = (): Api.Wrapper => ({ id: '2' });
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
      output: null,
    },

    // Two declarators of one statement each carrying an annotation over the
    // same alias: the alias goes once, and the statement that survives keeps
    // both declarators
    {
      code: `type Wrapper = { id: string };

export const buildUser = (): Wrapper => ({ id: '1' }), cloneUser = (): Wrapper => ({ id: '2' });
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
export const buildUser = () => ({ id: '1' }), cloneUser = () => ({ id: '2' });
`,
    },

    // A comment inside the alias goes with the declaration it describes rather
    // than being re-emitted with nothing left to describe
    {
      code: `type Wrapper = {
  // the identifier
  id: string;
};

export const buildUser = (): Wrapper => ({ id: '1' });
export const cloneUser = (): Wrapper => ({ id: '2' });
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
export const buildUser = () => ({ id: '1' });
export const cloneUser = () => ({ id: '2' });
`,
    },

    // A same-named binding elsewhere makes the alias deletion unprovable
    {
      code: `type User = { id: string };

export const buildUser = (): User => ({ id: '1' });
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

    // A directive bound to the alias's line would outlive its subject
    {
      code: `// eslint-disable-next-line no-unused-vars
type User = { id: string };

export const buildUser = (): User => ({ id: '1' });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: null,
    },

    // A re-exported alias has a consumer outside the file
    {
      code: `type User = { id: string };

export type { User };

export const buildUser = (): User => ({ id: '1' });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildUser"' },
        },
      ],
      output: `type User = { id: string };

export type { User };

export const buildUser = () => ({ id: '1' });
`,
    },

    // A self-referential alias reads its own name from outside the annotation,
    // so the strip does not leave it referenced by nothing and it stays
    {
      code: `type Tree = { children: Tree[] };

export const buildTree = (): Tree => ({ children: [] });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildTree"' },
        },
      ],
      output: `type Tree = { children: Tree[] };

export const buildTree = () => ({ children: [] });
`,
    },

    // An alias whose body names a live binding: deleting it would strand that
    // binding, which this cleanup does not chase, so it declines
    {
      code: `import type { User } from './User';

type Wrapper = { user: User };

export const buildUser = (): Wrapper => ({ user: { id: '1' } });
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
    // Issue #1964: `ArrowParameters [no LineTerminator here] =>` forbids a line
    // terminator between the parameter list and the arrow, and a block comment
    // containing one IS a line terminator to the grammar. Leaving the comment
    // where it stands emits a hard SyntaxError that only V8 reports, so the
    // comment moves past the arrow — the nearest position outside the restricted
    // gap — rather than being dropped (#1877).
    {
      code: `export const buildCount = () /**
 * doc
 */: number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildCount"' },
        },
      ],
      output: `export const buildCount = () =>
  /**
   * doc
   */ 1;
`,
    },
    {
      code: `export const buildCount = async () /**
 * doc
 */: Promise<number> => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildCount"' },
        },
      ],
      output: `export const buildCount = async () =>
  /**
   * doc
   */ 1;
`,
    },
    // A line comment ends its line, so it displaces the arrow the same way —
    // and the body it displaces goes where a broken arrow body goes, one step
    // past the declaration (#2069).
    {
      code: `export const buildCount = () // doc
: number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildCount"' },
        },
      ],
      output: `export const buildCount = () =>
  // doc
  1;
`,
    },
    // Issue #2069, the reported reproduction: the pre-image is what Prettier
    // writes for a line comment in the gap, so this is reachable from formatted
    // source rather than only from hand-written text. The issue spells the
    // binding `f`, which `enforce-verb-noun-naming` reports — a scaffolding
    // name that would join that pair's contradiction baseline without saying
    // anything about this fixer (#2066).
    {
      code: `export const readNote = (): // note
number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readNote"' },
        },
      ],
      output: `export const readNote = () =>
  // note
  1;
`,
    },
    // A comment on one line trips no restricted production, so it stays exactly
    // where it was written.
    {
      code: `export const buildCount = () /* doc */: number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildCount"' },
        },
      ],
      output: `export const buildCount = () /* doc */ => 1;
`,
    },
    // A function declaration's annotation is followed by a body, not by a
    // restricted production, so its comment stays put whatever it spans.
    {
      code: `export function computeCount() /**
 * doc
 */: number {
  return 1;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "computeCount"' },
        },
      ],
      output: `export function computeCount() /**
 * doc
 */ {
  return 1;
}
`,
    },
    {
      code: `export class Counter {
  computeCount() /**
   * doc
   */: number {
    return 1;
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "computeCount"' },
        },
      ],
      output: `export class Counter {
  computeCount() /**
   * doc
   */ {
    return 1;
  }
}
`,
    },
    // A comment written after the colon sits inside the annotation, so a plain
    // deletion of that span takes the comment with it (#1877).
    {
      code: `export const formatCount = (): /** doc */ number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "formatCount"' },
        },
      ],
      output: `export const formatCount = () /** doc */ => 1;
`,
    },
    {
      code: `export const formatCount = (): /**
 * doc
 */ number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "formatCount"' },
        },
      ],
      output: `export const formatCount = () =>
  /**
   * doc
   */ 1;
`,
    },
    {
      code: `export function computeCount(): /** doc */ number {
  return 1;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "computeCount"' },
        },
      ],
      output: `export function computeCount() /** doc */ {
  return 1;
}
`,
    },
    // A comment between the annotation and the arrow is in the same restricted
    // gap, and so is a raw line break that the annotation was not carrying.
    {
      code: `export const readCount = (): number /**
 * doc
 */ => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readCount"' },
        },
      ],
      output: `export const readCount = () =>
  /**
   * doc
   */ 1;
`,
    },
    {
      code: `export const parseCount = ()
  : number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "parseCount"' },
        },
      ],
      output: `export const parseCount = () => 1;
`,
    },
    // Each comment keeps the treatment its own shape calls for: the one-line
    // block stays in the gap, the one carrying a line terminator moves past the
    // arrow.
    {
      code: `export const renderRow = () /* a */ /**
 * b
 */: number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "renderRow"' },
        },
      ],
      output: `export const renderRow = () /* a */ =>
  /**
   * b
   */ 1;
`,
    },
    {
      code: `export const buildRecord = () /**
 * doc
 */: { a: number } => ({ a: 1 });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildRecord"' },
        },
      ],
      output: `export const buildRecord = () => /**
 * doc
 */ ({ a: 1 });
`,
    },
    {
      code: `export class Registry {
  buildCount = () /**
   * doc
   */: number => 1;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function' },
        },
      ],
      output: `export class Registry {
  buildCount = () =>
    /**
     * doc
     */ 1;
}
`,
    },
    // An arrow whose body already starts a line of its own needs no separator of
    // the fixer's own.
    {
      code: `export const loadCount = () /**
 * doc
 */: number =>
  1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "loadCount"' },
        },
      ],
      output: `export const loadCount = () =>
  /**
   * doc
   */
  1;
`,
    },
    // Issue #2066: the carried comment is re-emitted at the depth an arrow body
    // is written at, one step past the declaration it belongs to — not at the
    // arrow's own column, which for a multi-line annotation is the comment's
    // one-space gutter. The gutter travels with it.
    {
      code: `function buildFormatter() {
  const formatCount = (): /**
   * doc
   */ number => 1;
  return formatCount;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "formatCount"' },
        },
      ],
      output: `function buildFormatter() {
  const formatCount = () =>
    /**
     * doc
     */ 1;
  return formatCount;
}
`,
    },
    // A gutter aligned to nothing in particular is re-aligned to the column the
    // comment lands at, exactly as a formatter aligns one.
    {
      code: `export const scoreCount = (): /**
     * doc
       * more
 */ number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "scoreCount"' },
        },
      ],
      output: `export const scoreCount = () =>
  /**
   * doc
   * more
   */ 1;
`,
    },
    // A block comment WITHOUT the `*` gutter carries content in its columns —
    // commented-out code, a table — so only its opening line moves and every
    // interior line keeps the text it was written with.
    {
      code: `export const traceCount = (): /*
  raw one
  raw two
*/ number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "traceCount"' },
        },
      ],
      output: `export const traceCount = () =>
  /*
  raw one
  raw two
*/ 1;
`,
    },
    // A body that opens a bracket keeps the arrow's own line: it closes back at
    // the declaration's depth, so breaking ahead of it buys nothing. The gutter
    // is still re-aligned, to the declaration's column rather than a step past.
    {
      code: `export const listCounts = (): /**
 * doc
 */ number[] => [1, 2];
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "listCounts"' },
        },
      ],
      output: `export const listCounts = () => /**
 * doc
 */ [1, 2];
`,
    },
    {
      code: `function buildFormatter() {
  const buildRecord = (): /**
 * doc
 */ { a: number } => ({ a: 1 });
  return buildRecord;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildRecord"' },
        },
      ],
      output: `function buildFormatter() {
  const buildRecord = () => /**
   * doc
   */ ({ a: 1 });
  return buildRecord;
}
`,
    },
    // The depth a carried line comment lands at is measured from the
    // declaration it belongs to, exactly as it is for a block comment (#2069).
    {
      code: `function buildFormatter() {
  const tallyCount = () // doc
: number => 1;
  return tallyCount;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "tallyCount"' },
        },
      ],
      output: `function buildFormatter() {
  const tallyCount = () =>
    // doc
    1;
  return tallyCount;
}
`,
    },
    {
      code: `export class Registry {
  readCount = (): // doc
  number => 1;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function' },
        },
      ],
      output: `export class Registry {
  readCount = () =>
    // doc
    1;
}
`,
    },
    // A one-line block comment is not what the break is for, so it gains
    // neither a line of its own nor the step that goes with one.
    {
      code: `function buildFormatter() {
  const sumCount = (): /* doc */ number => 1;
  return sumCount;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "sumCount"' },
        },
      ],
      output: `function buildFormatter() {
  const sumCount = () /* doc */ => 1;
  return sumCount;
}
`,
    },
    // A block body is reached the same way: `=>` binds it whether or not a line
    // terminator precedes it. The `hugsArrow` carve-out cannot save the arrow's
    // line here — a line comment would swallow the `{` — so the comment takes
    // the same step in a broken body takes. Prettier re-indents the block's
    // interior to match; those columns belong to the body, which is outside the
    // gap this planner rewrites, so they are left as the source wrote them.
    {
      code: `export const readRow = () // doc
: number => {
  return 1;
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readRow"' },
        },
      ],
      output: `export const readRow = () =>
  // doc
  {
  return 1;
};
`,
    },
    // A bracketed body that a line comment forces off the arrow's line goes one
    // step in with the comment, which is where Prettier puts it. Only the run
    // that breaks by the fixer's own choice — a multi-line block comment — is
    // held back by `hugsArrow`, as the two fixtures above this one pin.
    {
      code: `export const listRows = (): // doc
number[] => [1, 2];
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "listRows"' },
        },
      ],
      output: `export const listRows = () =>
  // doc
  [1, 2];
`,
    },
    {
      code: `export const buildEntry = (): // doc
{ a: number } => ({ a: 1 });
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "buildEntry"' },
        },
      ],
      output: `export const buildEntry = () =>
  // doc
  ({ a: 1 });
`,
    },
    // A body the source already put on its own line keeps that line and the
    // indentation the source gave it: the fixer emits no separator of its own,
    // only the comment ahead of it.
    {
      code: `export const readTotal = (): // doc
number =>
  computeTotalScoreForEveryone(alphaValue, betaValue, gammaValue, deltaValue);
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "readTotal"' },
        },
      ],
      output: `export const readTotal = () =>
  // doc
  computeTotalScoreForEveryone(alphaValue, betaValue, gammaValue, deltaValue);
`,
    },
    // The separator keys on the LAST comment of the run, so a run ending in a
    // line comment breaks whatever precedes it — and a run ending in a block
    // comment still breaks, because an earlier line comment already ended a
    // line.
    {
      code: `export const renderCell = (): /* a */ // b
number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "renderCell"' },
        },
      ],
      output: `export const renderCell = () /* a */ =>
  // b
  1;
`,
    },
    {
      code: `export const scanRow = (): // a
/**
 * b
 */ number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "scanRow"' },
        },
      ],
      output: `export const scanRow = () =>
  // a
  /**
   * b
   */ 1;
`,
    },
    // A directive that shares the gap with nothing else keeps both its line and
    // the fix: nothing about its position changes.
    {
      code: `export const trackCount = () /* eslint-disable-next-line no-console */: number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "trackCount"' },
        },
      ],
      output: `export const trackCount = () /* eslint-disable-next-line no-console */ => 1;
`,
    },
    // A directive whose gap has to be rewritten would point at a different line
    // afterwards, so the report ships without a fix.
    {
      code: `export const sendCount = () /* eslint-disable-next-line no-console */
  : number => 1;
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "sendCount"' },
        },
      ],
      output: null,
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

// A decorator factory's return-type annotation is the one shape where the
// annotation is WIDER than what inference produces rather than a restatement of
// it (#2014). `MethodDecorator` declares three parameters, `return () => {}`
// infers `() => void`, and a decoration site passes what the declared signature
// promises — so stripping the annotation turns every `@Factory()` use into
// TS1329. The question is answered syntactically, from the annotation's own
// name and from the decorators the file writes, because a `RuleTester` fixture
// carries no `parserOptions.project` and a type-based answer would silently
// no-op.
ruleTesterTs.run('no-explicit-return-type', noExplicitReturnType, {
  valid: [
    // Each of TypeScript's four built-in decorator signatures.
    `
function Cache(): ClassDecorator {
  return () => {};
}
@Cache()
class Registry {}
`,
    `
function Track(): PropertyDecorator {
  return () => {};
}
class Metrics {
  @Track()
  hits = 0;
}
`,
    `
function Inject(): ParameterDecorator {
  return () => {};
}
class Service {
  constructor(@Inject() dependency: unknown) {}
}
`,
    // The arrow spelling of the same factory.
    `
const Log = (): MethodDecorator => {
  return () => {};
};
class E {
  @Log()
  compute() {
    return 1;
  }
}
`,
    // The concise-bodied arrow spelling, whose annotation sits inside the
    // restricted production the fixer otherwise rewrites.
    'const Log = (): MethodDecorator => () => {};',
    // The function-expression spelling, anonymous and named.
    `
const Log = function (): MethodDecorator {
  return () => {};
};
`,
    `
const Log = function log(): ClassDecorator {
  return () => {};
};
`,
    // A qualified annotation names the type its right-most segment names, so a
    // namespace-imported decorator type is the same carve-out.
    `
function Log(): ts.MethodDecorator {
  return () => {};
}
`,
    `
function Log(): lib.ts.ClassDecorator {
  return () => {};
}
`,
    // A generic factory: the type parameter changes nothing about the position
    // the returned value has to satisfy.
    `
function Log<T>(): MethodDecorator {
  return () => {};
}
`,
    `
function Log<T extends object>(config: T): PropertyDecorator {
  return () => config;
}
`,
    // A factory usable in more than one position still owes every site the
    // declared shape.
    `
function Log(): ClassDecorator | MethodDecorator {
  return () => {};
}
`,
    `
function Log(): ClassDecorator & MethodDecorator {
  return () => {};
}
`,
    // A factory reached through a class, static and instance.
    `
class Decorators {
  static log(): MethodDecorator {
    return () => {};
  }
}
`,
    `
class Decorators {
  public log(): PropertyDecorator {
    return () => {};
  }
}
`,
    // A factory reached through an object literal.
    `
const decorators = {
  log(): MethodDecorator {
    return () => {};
  },
};
`,
    // The annotation alone decides: a factory exported for another file to
    // decorate with has no decoration site here.
    `
export function Log(): MethodDecorator {
  return () => {};
}
`,
    // The secondary guard: a factory annotated with a user-defined decorator
    // type, which no name test can recognise, is exempt because a decorator in
    // this file calls it.
    `
type Cached = (target: object, key: string, descriptor: PropertyDescriptor) => void;
function Memoize(): Cached {
  return () => {};
}
class Store {
  @Memoize()
  read() {
    return 1;
  }
}
`,
    // The same, in the arrow spelling and as a class decorator.
    `
type Constructed = (target: new (...args: unknown[]) => object) => void;
const Injectable = (): Constructed => {
  return () => {};
};
@Injectable()
class Service {}
`,
    // A curried factory: `@Log()()` calls the outer factory too.
    `
type Applied = (target: object, key: string) => void;
function Log(): () => Applied {
  return () => () => {};
}
class E {
  @Log()()
  compute() {
    return 1;
  }
}
`,
    // A factory whose decoration site is a parameter.
    `
type Injected = (target: object, key: string | undefined, index: number) => void;
function Inject(token: string): Injected {
  return () => {};
}
class Service {
  constructor(@Inject('db') database: unknown) {}
}
`,
    // Nothing to strip: a factory with no annotation is unaffected by either
    // guard, and the rule stays silent for the reason it always did.
    `
function Log() {
  return () => {};
}
class E {
  @Log()
  compute() {
    return 1;
  }
}
`,
  ],
  invalid: [
    // A user type whose name merely CONTAINS a decorator type name is an
    // unrelated type: the guard matches the resolved right-most identifier, not
    // a substring of the printed annotation.
    {
      code: `
function buildConfig(): MyMethodDecoratorConfig {
  return config;
}
`,
      output: `
function buildConfig() {
  return config;
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "buildConfig"' },
        },
      ],
    },
    {
      code: `
function buildConfig(): MethodDecoratorOptions {
  return config;
}
`,
      output: `
function buildConfig() {
  return config;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // A VALUE named after a decorator type is not an annotation naming one.
    {
      code: `
const MethodDecorator = { name: 'log' };
function pickName(): string {
  return MethodDecorator.name;
}
`,
      output: `
const MethodDecorator = { name: 'log' };
function pickName() {
  return MethodDecorator.name;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // `typeof X` queries a value's type rather than naming the decorator type,
    // and inference reproduces it exactly.
    {
      code: `
const MethodDecorator = () => {};
function pick(): typeof MethodDecorator {
  return MethodDecorator;
}
`,
      output: `
const MethodDecorator = () => {};
function pick() {
  return MethodDecorator;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // The guard reads the annotation, not the function's own name.
    {
      code: `
function MethodDecorator(): number {
  return 1;
}
`,
      output: `
function MethodDecorator() {
  return 1;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // An ordinary function returning a function is the shape the carve-out most
    // resembles, and it stays reported: nothing about a decoration site
    // constrains it.
    {
      code: `
function makeAdder(base: number): (value: number) => number {
  return (value: number) => value + base;
}
`,
      output: `
function makeAdder(base: number) {
  return (value: number) => value + base;
}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // A BARE decorator names the decorator itself, not a factory. Its
    // annotation restates what inference produces, so proximity to a decorator
    // does not buy it an exemption.
    {
      code: `
function Freeze<T extends Function>(target: T): T {
  Object.freeze(target);
  return target;
}
@Freeze
class Widget {}
`,
      output: `
function Freeze<T extends Function>(target: T) {
  Object.freeze(target);
  return target;
}
@Freeze
class Widget {}
`,
      errors: [{ messageId: 'noExplicitReturnTypeInferable' }],
    },
    // The exemption is per function, not per file: a file containing a
    // decorator factory keeps every report its other functions earn.
    {
      code: `
function Log(): MethodDecorator {
  return () => {};
}
function describeLog(): string {
  return 'log';
}
`,
      output: `
function Log(): MethodDecorator {
  return () => {};
}
function describeLog() {
  return 'log';
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "describeLog"' },
        },
      ],
    },
    // A same-named binding elsewhere cannot silence a function no decorator
    // reaches: the secondary guard resolves the decorator's identifier through
    // the scope manager rather than comparing names.
    {
      code: `
function outer() {
  function Memoize(): () => void {
    return () => {};
  }
  return Memoize;
}
class Store {
  @Memoize()
  read() {
    return 1;
  }
}
`,
      output: `
function outer() {
  function Memoize() {
    return () => {};
  }
  return Memoize;
}
class Store {
  @Memoize()
  read() {
    return 1;
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "Memoize"' },
        },
      ],
    },
  ],
});

/**
 * The decorator carve-out's oracle is the COMPILER, not the rule: what makes
 * the annotation load-bearing is a diagnostic at the decoration SITE, several
 * lines from the annotation the fixer deletes and invisible to every report the
 * rule emits. Both forms therefore go through `tsc` with the settings this
 * plugin's consumers compile under, so "no fix emitted" is pinned to the
 * difference between a compiling file and TS1329.
 */
/**
 * The diagnostic codes each snippet draws, compiled as one program because a
 * program per snippet pays for a lib load per snippet.
 *
 * A carve-out on this rule exists because a strip fails to COMPILE, which the
 * rule's own reports cannot see — the fix resolves them, so nothing re-reports
 * the damage. `tsc` is the only oracle that answers it.
 */
function compileSnippets(
  virtualDir: string,
  snippets: Record<string, string>,
  extraOptions: ts.CompilerOptions = {},
): Map<string, string[]> {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    skipLibCheck: true,
    types: [],
    ...extraOptions,
  };

  const sources = new Map(
    Object.entries(snippets).map(([label, text]) => [
      `${virtualDir}/${label}.ts`,
      text,
    ]),
  );

  const host = ts.createCompilerHost(options, true);
  const getSourceFileFromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = sources.get(fileName);
    return text === undefined
      ? getSourceFileFromDisk(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(
          fileName,
          text,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        );
  };
  const fileExistsOnDisk = host.fileExists.bind(host);
  host.fileExists = (fileName) =>
    sources.has(fileName) || fileExistsOnDisk(fileName);
  const readFileFromDisk = host.readFile.bind(host);
  host.readFile = (fileName) =>
    sources.has(fileName) ? sources.get(fileName) : readFileFromDisk(fileName);

  const program = ts.createProgram([...sources.keys()], options, host);
  const byLabel = new Map<string, string[]>();
  for (const [fileName] of sources) {
    const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;
    const label = fileName.slice(virtualDir.length + 1).replace(/\.ts$/, '');
    byLabel.set(
      label,
      [
        ...program.getSyntacticDiagnostics(sourceFile),
        ...program.getSemanticDiagnostics(sourceFile),
      ].map((diagnostic) => `TS${diagnostic.code}`),
    );
  }
  return byLabel;
}

describe('no-explicit-return-type decorator factories', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const VIRTUAL_DIR = '/virtual-decorator-factory';

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

  const compile = (snippets: Record<string, string>) =>
    compileSnippets(VIRTUAL_DIR, snippets, { experimentalDecorators: true });

  const FACTORY = `function Log(): MethodDecorator {
  return () => {};
}

class E {
  @Log()
  async compute() {
    return 1;
  }
}

export { E };
`;

  const STRIPPED = FACTORY.replace(': MethodDecorator', '');

  // The shape the carve-out must NOT reach: a function returning a function
  // that no decoration site consumes. Its annotation is a restatement, and both
  // forms compile.
  const PLAIN_FACTORY = `function makeAdder(base: number): (value: number) => number {
  return (value: number) => value + base;
}

export { makeAdder };
`;

  it('leaves a decorator factory byte-identical under --fix', () => {
    const { output, fixed } = fixWith(FACTORY);

    expect(fixed).toBe(false);
    expect(output).toBe(FACTORY);
    // The annotation's survival is the property under test, not a side effect.
    expect(output).toContain(': MethodDecorator');
  });

  it('breaks the decoration site once the annotation is gone', () => {
    const diagnostics = compile({
      annotated: FACTORY,
      stripped: STRIPPED,
      plain: PLAIN_FACTORY,
      plainStripped: PLAIN_FACTORY.replace(': (value: number) => number', ''),
    });

    // The reported break, at the decoration site rather than the annotation.
    expect(diagnostics.get('stripped')).toContain('TS1329');
    // Both controls: the exempt form compiles, and so does the strip of a
    // function the carve-out has no business reaching — otherwise "declines on
    // decorator factories" could just mean "declines on functions returning
    // functions".
    expect(diagnostics.get('annotated')).toEqual([]);
    expect(diagnostics.get('plain')).toEqual([]);
    expect(diagnostics.get('plainStripped')).toEqual([]);
  });

  it('still strips a function no decorator uses', () => {
    const { output, fixed } = fixWith(PLAIN_FACTORY);

    expect(fixed).toBe(true);
    expect(output).toBe(
      PLAIN_FACTORY.replace(': (value: number) => number', ''),
    );
    // Converged: re-running the fixer finds nothing left to change.
    expect(fixWith(output).output).toBe(output);
  });

  // The user-defined decorator type the name test cannot see, end to end.
  it('leaves a factory a decorator in the file calls byte-identical', () => {
    const source = `type Cached = (
  target: object,
  key: string,
  descriptor: PropertyDescriptor,
) => void;

function Memoize(): Cached {
  return () => {};
}

class Store {
  @Memoize()
  read() {
    return 1;
  }
}

export { Store };
`;
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(false);
    expect(output).toBe(source);
    expect(compile({ aliased: source }).get('aliased')).toEqual([]);
  });
});

describe('no-explicit-return-type overload implementations', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const VIRTUAL_DIR = '/virtual-overload-implementation';

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

  const compile = (snippets: Record<string, string>) =>
    compileSnippets(VIRTUAL_DIR, snippets);

  const OVERLOADED = `function get(): void;
function get(param: string): string;
function get(param?: string): void | string {}

export { get };
`;

  const OVERLOADED_METHOD = `class Reader {
  read(): void;
  read(key: string): string;
  read(key?: string): void | string {}
}

export { Reader };
`;

  // The shape the carve-out must NOT reach: a lone function whose annotation
  // restates what its body returns. Both forms compile, so "declines on
  // overload implementations" cannot degrade into "declines on functions".
  const PLAIN = `function convert(input: string): number {
  return Number(input);
}

export { convert };
`;

  it('leaves an overload implementation byte-identical under --fix', () => {
    const { output, fixed } = fixWith(OVERLOADED);

    expect(fixed).toBe(false);
    expect(output).toBe(OVERLOADED);
    // The annotation's survival is the property under test, not a side effect.
    expect(output).toContain(': void | string');
  });

  it('leaves an overloaded class method byte-identical under --fix', () => {
    const { output, fixed } = fixWith(OVERLOADED_METHOD);

    expect(fixed).toBe(false);
    expect(output).toBe(OVERLOADED_METHOD);
    expect(output).toContain('read(key?: string): void | string');
  });

  it('breaks the overloads above it once the annotation is gone', () => {
    const diagnostics = compile({
      annotated: OVERLOADED,
      stripped: OVERLOADED.replace(': void | string', ''),
      annotatedMethod: OVERLOADED_METHOD,
      strippedMethod: OVERLOADED_METHOD.replace(
        'read(key?: string): void | string',
        'read(key?: string)',
      ),
      plain: PLAIN,
      plainStripped: PLAIN.replace(': number', ''),
    });

    // The reported break, at the overload signature rather than at the strip.
    expect(diagnostics.get('stripped')).toContain('TS2394');
    expect(diagnostics.get('strippedMethod')).toContain('TS2394');
    // Controls: the exempt forms compile, and so does the strip of a function
    // the carve-out has no business reaching.
    expect(diagnostics.get('annotated')).toEqual([]);
    expect(diagnostics.get('annotatedMethod')).toEqual([]);
    expect(diagnostics.get('plain')).toEqual([]);
    expect(diagnostics.get('plainStripped')).toEqual([]);
  });

  it('still strips a function that overloads nothing', () => {
    const { output, fixed } = fixWith(PLAIN);

    expect(fixed).toBe(true);
    expect(output).toBe(PLAIN.replace(': number', ''));
    // Converged: re-running the fixer finds nothing left to change.
    expect(fixWith(output).output).toBe(output);
  });

  // An overload set cannot span containers, so the exemption must not follow
  // the NAME out of the scope that declares the set.
  it('still strips a same-named function in another scope', () => {
    const source = `function outer() {
  function convert(input: string): number;
  function convert(input: unknown): number {
    return Number(input);
  }
  return convert;
}

function convert(input: string): number {
  return Number(input);
}

export { outer, convert };
`;
    const { output, fixed } = fixWith(source);

    expect(fixed).toBe(true);
    // The nested overload set survives; only the unrelated top-level function
    // loses its annotation.
    expect(output).toContain('function convert(input: unknown): number {');
    expect(output).toContain('function convert(input: string) {');
    expect(compile({ scoped: output }).get('scoped')).toEqual([]);
  });
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

/**
 * Issue #1964: `ArrowParameters [no LineTerminator here] =>` is a restricted
 * production, and a block comment containing a line terminator IS a
 * LineTerminator to the syntactic grammar. An annotation strip that leaves such
 * a comment between the parameter list and the arrow therefore emits a hard
 * SyntaxError.
 *
 * V8 is the oracle because no parser in this repo's pipeline reports the breach:
 * `@typescript-eslint/parser` and the TypeScript parser both accept the broken
 * text, so every reparse-based guard reads it as clean. The fixtures below are
 * written free of TypeScript syntax once the annotation is gone, which is what
 * lets `node --check` read the fixer's own output verbatim.
 */
describe('no-explicit-return-type --fix emits code V8 accepts', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'x.ts';
  const checkDirectory = mkdtempSync(join(tmpdir(), 'blumint-v8-check-'));
  let checkCounter = 0;

  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  linter.defineRule(
    RULE_ID,
    noExplicitReturnType as unknown as Rule.RuleModule,
  );

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' },
  };

  /** V8's own verdict on a source, as the message it refuses it with. */
  const v8SyntaxErrorOf = (code: string): string | null => {
    const file = join(checkDirectory, `case-${(checkCounter += 1)}.mjs`);
    writeFileSync(file, code);
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      return null;
    } catch (error) {
      const stderr = String((error as { stderr?: Buffer }).stderr ?? '');
      return (
        stderr.split('\n').find((line) => line.includes('SyntaxError')) ??
        'rejected without a SyntaxError'
      );
    }
  };

  const DOC = ['/**', ' * doc', ' */'].join('\n');

  // The text the strip used to emit: the annotation gone, the comment left in
  // the restricted gap. Every assertion below is worthless if this shape is not
  // actually broken, and if the parsers do not actually accept it.
  const NAIVE_STRIP = `export const f = () ${DOC} => 1;\n`;

  it('rejects the shape a bare strip leaves behind', () => {
    expect(v8SyntaxErrorOf(NAIVE_STRIP)).toContain(
      "SyntaxError: Unexpected token '=>'",
    );
  });

  it('is answering a question the parsers cannot', () => {
    expect(() =>
      tsParser.parse(NAIVE_STRIP, {
        ecmaVersion: 2022,
        sourceType: 'module',
        range: true,
        loc: true,
      }),
    ).not.toThrow();
  });

  it.each([
    ['an arrow', `export const f = () ${DOC}: number => 1;\n`],
    [
      'an async arrow',
      `export const f = async () ${DOC}: Promise<number> => 1;\n`,
    ],
    ['a comment after the colon', `export const f = (): ${DOC} number => 1;\n`],
    [
      'a comment after the annotation',
      `export const f = (): number ${DOC} => 1;\n`,
    ],
    ['a line comment', 'export const f = () // doc\n: number => 1;\n'],
    [
      'a block body',
      `export const f = () ${DOC}: number => {\n  return 1;\n};\n`,
    ],
    ['a nested arrow', `foo(() ${DOC}: number => 1);\n`],
    [
      'a class property arrow',
      `export class C {\n  m = () ${DOC}: number => 1;\n}\n`,
    ],
  ])('emits V8-legal code for %s', (_label, source) => {
    const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(fixed).toBe(true);
    expect(output).not.toBe(source);
    expect(output).not.toContain(': number');
    // Declining or dropping the comment is not the remedy (#1877): the comment
    // has to arrive somewhere legal, character for character.
    expect(output).toContain('doc');
    expect(v8SyntaxErrorOf(output)).toBeNull();
  });

  // No comment is needed to breach the gap: a line break the annotation was not
  // carrying is left behind by the strip just the same.
  it('emits V8-legal code for a raw line break before the annotation', () => {
    const source = 'export const f = ()\n  : number => 1;\n';
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(output).toBe('export const f = () => 1;\n');
    expect(v8SyntaxErrorOf(output)).toBeNull();
  });

  // A comment that trips no restricted production must not be moved at all —
  // the guard above passes just as well for a fixer that relocates every
  // comment it meets.
  it('leaves a one-line comment where it was written', () => {
    const source = 'export const f = () /* doc */: number => 1;\n';
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(output).toBe('export const f = () /* doc */ => 1;\n');
    expect(v8SyntaxErrorOf(output)).toBeNull();
  });

  // A function declaration ends its parameter list at a body, so nothing about
  // its comments is restricted. Moving them would be a regression of its own.
  it('leaves a function declaration untouched', () => {
    const source = `export function j() ${DOC}: number {\n  return 1;\n}\n`;
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(output).toBe(`export function j() ${DOC} {\n  return 1;\n}\n`);
    expect(v8SyntaxErrorOf(output)).toBeNull();
  });

  it('settles in one pass', () => {
    const source = `export const f = () ${DOC}: number => 1;\n`;
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(linter.verifyAndFix(output, CONFIG, FILENAME).fixed).toBe(false);
  });
});

/**
 * Issue #2066: a carried comment that lands somewhere V8 accepts can still land
 * somewhere Prettier will not leave it. Re-emitting the raw source slice kept
 * every continuation line at the column it held in the annotation position, and
 * spliced the comment in after an arrow whose line then had to break — valid
 * output, rewritten by the next `prettier --write` and rejected by
 * `prettier --check` until then.
 *
 * Prettier itself is the oracle rather than a described layout, and it is asked
 * CONDITIONALLY: a source Prettier would rewrite on its own cannot hold the
 * fixer to a fixed point, so each input is required to be one first. That
 * requirement is what makes the sample honest — and it is asserted, not assumed,
 * because a sample that silently emptied would pass this guard forever.
 */
describe('no-explicit-return-type --fix emits code Prettier leaves alone', () => {
  const RULE_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'x.ts';

  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  linter.defineRule(
    RULE_ID,
    noExplicitReturnType as unknown as Rule.RuleModule,
  );

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' },
  };

  // The repo's own settings, which are what agora formats its source with.
  const PRETTIER_OPTIONS: prettier.Options = {
    parser: 'typescript',
    printWidth: 80,
    tabWidth: 2,
    singleQuote: true,
    semi: true,
    trailingComma: 'all',
  };

  const isFixedPoint = (text: string): boolean =>
    prettier.format(text, PRETTIER_OPTIONS) === text;

  const DOC = ['/**', ' * doc', ' */'].join('\n');
  const NESTED_DOC = ['/**', '   * doc', '   */'].join('\n');

  /**
   * Every shape the carried comment can land in, at column 0 and nested, with a
   * body that breaks the arrow's line and one that keeps it.
   */
  const SOURCES: [string, string][] = [
    ['comment after the colon', `export const f = (): ${DOC} number => 1;\n`],
    [
      'comment after the annotation',
      `export const f = (): number ${DOC} => 1;\n`,
    ],
    [
      'async arrow',
      `export const f = async (): ${DOC} Promise<number> => 1;\n`,
    ],
    [
      'nested declaration',
      `function outer() {\n  const f = (): ${NESTED_DOC} number => 1;\n  return f;\n}\n`,
    ],
    [
      'class property',
      `export class C {\n  m = (): ${NESTED_DOC} number => 1;\n}\n`,
    ],
    [
      'object property',
      `const repo = {\n  read: (): ${NESTED_DOC} number => 1,\n};\n`,
    ],
    [
      'body already on its own line',
      `export const f = (): ${DOC} number =>\n  computeTotal(alpha, beta, gamma, delta, epsilon, zeta, eta, theta);\n`,
    ],
    ['call body', `export const f = (): ${DOC} number => compute();\n`],
    [
      'conditional body',
      `export const f = (): ${DOC} number => (flag ? 1 : 2);\n`,
    ],
    [
      'object-literal body',
      `export const f = (): ${DOC} { a: number } => ({ a: 1 });\n`,
    ],
    ['array-literal body', `export const f = (): ${DOC} number[] => [1, 2];\n`],
    [
      'block body',
      `export const f = (): ${DOC} number => {\n  return 1;\n};\n`,
    ],
    [
      'gutterless block comment',
      `export const f = (): /*\n  raw doc one\n  raw doc two\n*/ number => 1;\n`,
    ],
    [
      'one-line block comment, which stays in the gap',
      `export const f = (): /* doc */ number => 1;\n`,
    ],
    // Issue #2069: a `//` comment breaks its line without its own text holding
    // a terminator, so every arm above is repeated for one. Prettier writes a
    // line comment in the gap by leaving it on the parameter list's line and
    // pushing the annotation down, which is the pre-image shape below.
    ['line comment', `export const f = (): // doc\nnumber => 1;\n`],
    [
      'line comment, nested declaration',
      `function outer() {\n  const f = (): // doc\n  number => 1;\n  return f;\n}\n`,
    ],
    [
      'line comment, class property',
      `export class C {\n  m = (): // doc\n  number => 1;\n}\n`,
    ],
    [
      'line comment, object property',
      `const repo = {\n  read: (): // doc\n  number => 1,\n};\n`,
    ],
    [
      'line comment, body already on its own line',
      `export const f = (): // doc\nnumber =>\n  computeTotalScoreForEveryone(alphaValue, betaValue, gammaValue, delta);\n`,
    ],
    [
      'line comment, array-literal body',
      `export const f = (): // doc\nnumber[] => [1, 2];\n`,
    ],
    [
      'line comment, object-literal body',
      `export const f = (): // doc\n{ a: number } => ({ a: 1 });\n`,
    ],
    [
      'line comment last of two',
      `export const f = (): /* a */ // doc\nnumber => 1;\n`,
    ],
    [
      'line comment, block body',
      `export const f = (): // doc\nnumber => {\n  return 1;\n};\n`,
    ],
  ];

  /**
   * The residues this planner cannot clear, named rather than dropped from the
   * sample so each arm keeps being exercised. Each is pinned below to the one
   * difference named here, so a drift in where the comment lands fails this
   * guard regardless.
   *
   * Prettier requires the parentheses around a conditional arrow body while the
   * arrow is flat and strips them once the line breaks, so breaking the line
   * leaves behind a pair the SOURCE wrote. Taking them out means editing the
   * body, which is outside the gap this planner rewrites — and a fixer reaching
   * across a body to adjust parentheses is a hazard of its own (#2063).
   *
   * A line comment ahead of a block body forces the break that `hugsArrow`
   * exists to avoid — the comment would otherwise swallow the `{` — and
   * Prettier re-indents the whole block behind it. Those interior columns are
   * the body's own text, equally outside the gap (#2069). What the planner does
   * own, the line the comment lands on, matches Prettier exactly.
   */
  const PAREN_RESIDUE = 'conditional body';
  const BLOCK_INDENT_RESIDUE = 'line comment, block body';

  const settled = SOURCES.filter(([, source]) => isFixedPoint(source));

  it('rewrites Prettier-clean input into Prettier-clean output', () => {
    // Equality, not a floor: a source edited into a shape Prettier rewrites is
    // one this guard stops asking about, which reads exactly like a pass.
    expect(settled.length).toBe(SOURCES.length);
    expect(settled.length).toBeGreaterThanOrEqual(23);

    const outputs = new Map(
      settled.map(([label, source]) => {
        const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);
        // A source the rule declines proves nothing about what it writes.
        expect(fixed).toBe(true);
        expect(output).toContain('doc');
        return [label, output] as const;
      }),
    );

    const unstable = [...outputs]
      .filter(([, output]) => !isFixedPoint(output))
      .map(([label]) => label);

    // In SOURCES order, which is why the line-comment arms sit last.
    expect(unstable).toEqual([PAREN_RESIDUE, BLOCK_INDENT_RESIDUE]);
    // What is left of each residue is the one thing named above and nothing
    // else: the parenthesis pair, and the block interior's own columns.
    expect(
      isFixedPoint(
        (outputs.get(PAREN_RESIDUE) as string).replace(
          '(flag ? 1 : 2)',
          'flag ? 1 : 2',
        ),
      ),
    ).toBe(true);
    expect(
      isFixedPoint(
        (outputs.get(BLOCK_INDENT_RESIDUE) as string).replace(
          '{\n  return 1;\n};\n',
          '{\n    return 1;\n  };\n',
        ),
      ),
    ).toBe(true);
  });

  it('is not vacuous: the shape this replaced is still detected', () => {
    // The output the raw-slice re-emission produced, planted so a green run
    // means the fixer improved rather than the oracle going blind.
    const residue = `export const f = () => /**\n * doc\n */ 1;\n`;
    expect(isFixedPoint(residue)).toBe(false);
    expect(
      isFixedPoint(`export const f = () =>\n  /**\n   * doc\n   */ 1;\n`),
    ).toBe(true);
    // The same plant for the line-comment arm (#2069): the break was already
    // written, at the declaration's own column rather than a step past it.
    expect(isFixedPoint(`export const f = () => // doc\n1;\n`)).toBe(false);
    expect(isFixedPoint(`export const f = () =>\n  // doc\n  1;\n`)).toBe(true);
    // And the break is not free: applied where the body hugs the arrow,
    // Prettier takes it straight back out.
    expect(
      isFixedPoint(
        `export const f = () =>\n  /**\n   * doc\n   */ ({ a: 1 });\n`,
      ),
    ).toBe(false);
  });
});

// A resource-handle return annotation is preserved (issue #2073). The
// annotation is not a redundant restatement of the result: it is the signal
// `enforce-memoize-async`'s handle-factory carve-out (#2068) reads before
// deciding NOT to demand `@Memoize()` on the method. Stripping it re-arms the
// very autofix that carve-out exists to prevent, inside the same unattended
// `eslint --fix` run, and the failure it re-arms — N concurrent callers sharing
// one lease and one release closure — is silent and load-dependent. This is
// `declaresVoidResult` (#1562) one carve-out later; the predicate itself lives
// in `src/utils/resourceHandleType.ts` so the two rules cannot drift.

/**
 * Every return shape `enforce-memoize-async` reads as a resource handle, held
 * in one array so that the `valid` block below and the composed-fix acceptance
 * test at the end of this file cannot cover different sets. A shape blessed
 * here but absent from the composed run is exactly the gap #2073 was: silent in
 * each rule's own suite, live under `eslint --fix`.
 */
const RESOURCE_HANDLE_FIXTURES: readonly string[] = [
  // The issue's reproduction, verbatim.
  `
type Admission = { readonly reservedMb: number; readonly release: () => void };
export class ExecutionGovernor {
  public async admit(spec: JobSpec): Promise<Admission> {
    const release = this.store.claim(spec);
    return { reservedMb: spec.reservedMb, release };
  }
}
`,
  // An inline handle, the shape the carve-out reads with no resolution at all.
  `
class Pool {
  public async acquire(size: number): Promise<{ id: string; release: () => void }> {
    const id = await this.claim(size);
    return { id, release: () => this.free(id) };
  }
}
`,
  // The disposer's spelling is not what is read — the shape is. `dispose`,
  // `close` and `unsubscribe` are the same member as `release`.
  `
class Sessions {
  public async open(): Promise<{ socket: Socket; dispose: () => Promise<void> }> {
    const socket = await connect();
    return { socket, dispose: async () => socket.end() };
  }
}
`,
  `
class Handles {
  public async open(): Promise<{ fd: number; close: () => void }> {
    return openFile();
  }
}
`,
  // A computed symbol key, which no name allowlist could read.
  `
class Files {
  public async openTemp(): Promise<{ path: string; [Symbol.dispose](): void }> {
    return makeTempFile();
  }
}
`,
  // `readonly` on the members, not on the result: the top-level annotation is
  // a `Promise`, so the readonly-widening carve-out does not answer for this.
  `
class Governor {
  public async admit(spec: JobSpec): Promise<{ readonly reservedMb: number; readonly release: () => void }> {
    return this.store.claim(spec);
  }
}
`,
  // A method signature (`release(): void`) is callable by construction.
  `
class Leases {
  public async take(): Promise<{ id: string; release(): void }> {
    return this.store.take();
  }
}
`,
  `
class Leases {
  public async take(): Promise<{ id: string; release?: () => void }> {
    return this.store.take();
  }
}
`,
  // One union arm carrying the closure is enough: the caller handed that arm
  // is the one harmed.
  `
class Leases {
  public async take(): Promise<{ id: string; release: (() => void) | undefined }> {
    return this.store.take();
  }
}
`,
  // A handle type is named far more often than it is written inline.
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
}
`,
  // Type declarations hoist, so an alias written below its use is in scope.
  `
class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
}

type Admission = { reservedMb: number; release: () => void };
`,
  `
export interface Subscription {
  topic: string;
  unsubscribe: () => void;
}

export class Bus {
  public async subscribe(topic: string): Promise<Subscription> {
    return this.transport.subscribe(topic);
  }
}
`,
  // Declared beside the class inside a factory, so only a scope-chain walk —
  // not a scan of `Program.body` — finds it.
  `
export function makeGovernor() {
  type Admission = { reservedMb: number; release: () => void };

  class Governor {
    public async admit(spec: JobSpec): Promise<Admission> {
      return this.store.claim(spec);
    }
  }

  return new Governor();
}
`,
  // The disposer's own type is an alias to a function type.
  `
type Release = () => void;
type Admission = { reservedMb: number; release: Release };

export class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
}
`,
  // The handle sits one member deep.
  `
class Governor {
  public async admit(spec: JobSpec): Promise<{ spec: JobSpec; admission: { release: () => void } }> {
    return this.store.claim(spec);
  }
}
`,
  `
class Pool {
  public async tryAcquire(size: number): Promise<{ id: string; release: () => void } | null> {
    return this.store.tryClaim(size);
  }
}
`,
  `
type Metered = { reservedMb: number };

class Governor {
  public async admit(spec: JobSpec): Promise<Metered & { release: () => void }> {
    return this.store.claim(spec);
  }
}
`,
  // A batch of leases is a batch of caller-owned leases: the container does
  // not change who owns them. `readonly Admission[]` and `Readonly<Admission>`
  // sit inside the `Promise`, so the readonly-widening carve-out is not what
  // answers here either.
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admitAll(specs: JobSpec[]): Promise<Admission[]> {
    return specs.map((spec) => this.store.claim(spec));
  }
}
`,
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admitAll(specs: JobSpec[]): Promise<readonly Admission[]> {
    return specs.map((spec) => this.store.claim(spec));
  }
}
`,
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admit(spec: JobSpec): Promise<Readonly<Admission>> {
    return this.store.claim(spec);
  }
}
`,
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admitAll(specs: JobSpec[]): Promise<Array<Admission>> {
    return specs.map((spec) => this.store.claim(spec));
  }
}
`,
  `
type Admission = { reservedMb: number; release: () => void };

class Governor {
  public async admitAll(specs: JobSpec[]): Promise<ReadonlyArray<Admission>> {
    return specs.map((spec) => this.store.claim(spec));
  }
}
`,
  // An alias chain still ends at the object the caller receives.
  `
type Lease = { id: string; release: () => void };
type Admission = Lease;

class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
}
`,
  // The exemption is a property of the ANNOTATION, not of the site it is
  // written at — the same shape as the void and readonly-widening carve-outs,
  // both of which apply at every implementation site this rule can fix. A
  // handle is caller-owned however the function that allocates it is spelled.
  `
type Admission = { reservedMb: number; release: () => void };

export function admit(spec: JobSpec): Admission {
  return claim(spec);
}
`,
  `
export function openHandle(): { fd: number; close: () => void } {
  return openFile();
}
`,
  `
export const openHandle = (): { fd: number; close: () => void } => {
  return openFile();
};
`,
  `
export const openHandle = function (): { fd: number; close: () => void } {
  return openFile();
};
`,
  // A synchronous method, which `enforce-memoize-async` never visits: the
  // annotation still declares a caller-owned result, and a rule reading
  // annotations should not answer differently because of the `async` keyword
  // a later refactor adds or removes.
  `
class Pool {
  public acquire(size: number): { id: string; release: () => void } {
    return this.claim(size);
  }
}
`,
  // The #1512 recursion repro's own type is handle-shaped, so this spelling is
  // preserved even where the recursion exemption does not apply — the reason
  // the paired negative control above uses a plain member instead.
  `
type FakeQuery = { orderBy: () => FakeQuery };
declare const fallback: FakeQuery;
const buildQuery = (p?: string): FakeQuery => {
  return { orderBy: () => fallback };
};
`,
  // A zero-parameter factory: the arity that makes a memoized call look most
  // obviously safe is exactly the one whose every caller shares one lease.
  `
class Locks {
  public async acquire(): Promise<{ token: string; release: () => Promise<void> }> {
    return this.store.lock();
  }
}
`,
  // Two handle factories in one class, which is what the owner rule needs in
  // order to add no `import { Memoize }` either.
  `
type Admission = { reservedMb: number; release: () => void };

export class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }

  public async admitDefault(): Promise<Admission> {
    return this.store.claim(DEFAULT_SPEC);
  }
}
`,
];

ruleTesterTs.run('no-explicit-return-type', noExplicitReturnType, {
  valid: [...RESOURCE_HANDLE_FIXTURES],
  invalid: [
    // The carve-out is NOT a blanket exemption for object results. An object
    // carrying no callable is ordinary data, and its annotation restates what
    // the body already returns.
    {
      code: `
class Repo {
  public async load(id: string): Promise<{ id: string; name: string }> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
class Repo {
  public async load(id: string) {
    return this.api.get(id);
  }
}
`,
    },
    {
      code: `
class Repo {
  public async name(id: string): Promise<string> {
    return this.api.name(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "name"' },
        },
      ],
      output: `
class Repo {
  public async name(id: string) {
    return this.api.name(id);
  }
}
`,
    },
    {
      code: `
class Repo {
  public async load(id: string): Promise<{ id: string; meta: { count: number } }> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
class Repo {
  public async load(id: string) {
    return this.api.get(id);
  }
}
`,
    },
    // A bare callable result is not a handle: the closure IS the whole result,
    // with no resource paired to it whose accounting a shared reference
    // corrupts. Both rules read it the same way.
    {
      code: `
class Templates {
  public async compile(name: string): Promise<() => string> {
    return compileTemplate(name);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "compile"' },
        },
      ],
      output: `
class Templates {
  public async compile(name: string) {
    return compileTemplate(name);
  }
}
`,
    },
    // A lookup table of handlers is not a lease: an index signature is not a
    // member either rule counts.
    {
      code: `
class Handlers {
  public async load(): Promise<{ [event: string]: () => void }> {
    return this.registry.all();
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
class Handlers {
  public async load() {
    return this.registry.all();
  }
}
`,
    },
    // A getter signature is a property access wearing a parameter list.
    {
      code: `
class Repo {
  public async load(id: string): Promise<{ get name(): string }> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
class Repo {
  public async load(id: string) {
    return this.api.get(id);
  }
}
`,
    },
    // `Function` is a type REFERENCE resolving nowhere in the file, not a
    // written function type.
    {
      code: `
class Repo {
  public async load(id: string): Promise<{ id: string; release: Function }> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: `
class Repo {
  public async load(id: string) {
    return this.api.get(id);
  }
}
`,
    },
    // A self-referential alias of plain data terminates and is still plain data.
    {
      code: `
type Chain = { id: string; next: Chain };
class Repo {
  public async head(): Promise<Chain> {
    return this.api.head();
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "head"' },
        },
      ],
      output: `
type Chain = { id: string; next: Chain };
class Repo {
  public async head() {
    return this.api.head();
  }
}
`,
    },
    {
      code: `
export function loadRow(id: string): { id: string; count: number } {
  return read(id);
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'function "loadRow"' },
        },
      ],
      output: `
export function loadRow(id: string) {
  return read(id);
}
`,
    },
    {
      code: `
export const loadRow = (id: string): { id: string; count: number } => {
  return read(id);
};
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'arrow function "loadRow"' },
        },
      ],
      output: `
export const loadRow = (id: string) => {
  return read(id);
};
`,
    },
    // A handle type imported from another module resolves nowhere lexically, so
    // neither rule can read it: this rule strips and the owner reports, which is
    // the pair AGREEING. The remedy an author has is the disable directive.
    {
      code: `
import { Admission } from './types';
class Governor {
  public async admit(spec: JobSpec): Promise<Admission> {
    return this.store.claim(spec);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "admit"' },
        },
      ],
      output: `
class Governor {
  public async admit(spec: JobSpec) {
    return this.store.claim(spec);
  }
}
`,
    },
    // The reports below stand while their fixes do not: stripping the only
    // reference to a same-file type declaration would orphan it, and this
    // fixer declines rather than strand it. The report is what this block
    // pins — the carve-out must not silence a plain data result.
    {
      code: `
type Row = { id: string; count: number };
class Repo {
  public async load(id: string): Promise<Row> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: null,
    },
    {
      code: `
interface Row {
  id: string;
  count: number;
}
class Repo {
  public async load(id: string): Promise<Row> {
    return this.api.get(id);
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "load"' },
        },
      ],
      output: null,
    },
    // A two-argument container describes a registry the method looked handles
    // up in rather than a handle the call allocated, so it is not entered.
    {
      code: `
type Admission = { reservedMb: number; release: () => void };
class Governor {
  public async all(): Promise<Map<string, Admission>> {
    return this.store.all();
  }
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "all"' },
        },
      ],
      output: null,
    },
    // A same-named alias in the nearer scope is what the annotation denotes, so
    // an outer handle alias must not answer for it.
    {
      code: `
type Admission = { reservedMb: number; release: () => void };
export function makeGovernor() {
  type Admission = { reservedMb: number };

  class Governor {
    public async admit(spec: JobSpec): Promise<Admission> {
      return this.store.reserve(spec);
    }
  }

  return new Governor();
}
`,
      errors: [
        {
          messageId: 'noExplicitReturnTypeInferable',
          data: { functionKind: 'class method "admit"' },
        },
      ],
      output: null,
    },
  ],
});

// The `valid` block above is only worth its length if each case is silent
// BECAUSE of the handle carve-out. Silence is the pass condition for a valid
// case, so any unrelated exemption — non-inferability, readonly widening, a
// parse failure — would let the whole block pass while asserting nothing
// (`silence-is-pass-oracle-needs-reachability`). Each pair below differs in one
// token: the member that makes the object a handle. The data twin must report.
describe('no-explicit-return-type resource-handle carve-out is not vacuous', () => {
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

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { [RULE_ID]: 'error' },
  };

  const PAIRS: readonly {
    name: string;
    handle: string;
    data: string;
  }[] = [
    {
      name: 'an inline handle',
      handle:
        'class P { async take(): Promise<{ id: string; release: () => void }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; release: string }> { return t(); } }',
    },
    {
      name: 'a method-signature disposer',
      handle:
        'class P { async take(): Promise<{ id: string; release(): void }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; release: void }> { return t(); } }',
    },
    {
      name: 'an optional disposer',
      handle:
        'class P { async take(): Promise<{ id: string; release?: () => void }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; release?: string }> { return t(); } }',
    },
    {
      name: 'a disposer in a union arm',
      handle:
        'class P { async take(): Promise<{ id: string; release: (() => void) | undefined }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; release: string | undefined }> { return t(); } }',
    },
    {
      name: 'a symbol-keyed disposer',
      handle:
        'class P { async take(): Promise<{ id: string; [Symbol.dispose](): void }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; [Symbol.toStringTag]: string }> { return t(); } }',
    },
    {
      name: 'a nested handle',
      handle:
        'class P { async take(): Promise<{ id: string; inner: { release: () => void } }> { return t(); } }',
      data: 'class P { async take(): Promise<{ id: string; inner: { count: number } }> { return t(); } }',
    },
    {
      name: 'an intersection arm',
      handle:
        'type M = { mb: number };\nclass P { async take(): Promise<M & { release: () => void }> { return t(); } }',
      data: 'type M = { mb: number };\nclass P { async take(): Promise<M & { id: string }> { return t(); } }',
    },
    {
      name: 'a standalone function',
      handle:
        'export function open(): { fd: number; close: () => void } { return o(); }',
      data: 'export function open(): { fd: number; path: string } { return o(); }',
    },
    {
      name: 'an arrow function',
      handle:
        'export const open = (): { fd: number; close: () => void } => o();',
      data: 'export const open = (): { fd: number; path: string } => o();',
    },
    {
      name: 'a function expression',
      handle:
        'export const open = function (): { fd: number; close: () => void } { return o(); };',
      data: 'export const open = function (): { fd: number; path: string } { return o(); };',
    },
    {
      name: 'a synchronous method',
      handle:
        'class P { take(): { id: string; release: () => void } { return t(); } }',
      data: 'class P { take(): { id: string; owner: string } { return t(); } }',
    },
  ];

  it.each(PAIRS.map((pair) => [pair.name, pair.handle] as const))(
    'preserves the annotation on %s',
    (_name, handle) => {
      const linter = makeLinter();
      expect(linter.verify(handle, CONFIG, FILENAME)).toEqual([]);
    },
  );

  it.each(PAIRS.map((pair) => [pair.name, pair.data] as const))(
    'still strips the data twin of %s',
    (_name, data) => {
      const linter = makeLinter();
      const messages = linter.verify(data, CONFIG, FILENAME);
      expect(messages.map((message) => message.messageId)).toEqual([
        'noExplicitReturnTypeInferable',
      ]);
    },
  );

  // The negative control for the carve-out itself, not for the rule: a bare
  // callable is the whole result rather than a resource paired with the closure
  // that frees it, so BOTH rules read it as ordinary and this one still strips.
  // Without it the table above could be satisfied by a predicate that exempts
  // every annotation mentioning a function type.
  it('does not exempt a bare callable result', () => {
    const linter = makeLinter();
    const messages = linter.verify(
      'class P { async take(): Promise<() => void> { return t(); } }',
      CONFIG,
      FILENAME,
    );
    expect(messages.map((message) => message.messageId)).toEqual([
      'noExplicitReturnTypeInferable',
    ]);
  });

  it('carries every shape the owner rule exempts', () => {
    // A pair silently dropped from the table would otherwise shrink this
    // control without failing it.
    expect(PAIRS).toHaveLength(11);
  });
});

// The acceptance test for the PAIR. `enforce-memoize-async` decides from the
// written annotation and `no-explicit-return-type` can delete it, and `--fix`
// re-lints until the output settles — so the strip and the memoization it
// re-arms land in one unattended run (#2073). Neither rule's own suite can see
// this: `RuleTester` applies a single pass of a single rule.
describe('enforce-memoize-async survives no-explicit-return-type --fix', () => {
  const STRIPPER_ID = '@blumintinc/blumint/no-explicit-return-type';
  const MEMOIZER_ID = '@blumintinc/blumint/enforce-memoize-async';
  const FILENAME = 'x.ts';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      STRIPPER_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      MEMOIZER_ID,
      enforceMemoizeAsync as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const BOTH: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { [STRIPPER_ID]: 'error', [MEMOIZER_ID]: 'error' },
  };

  const REPRODUCTION = [
    'type Admission = { readonly reservedMb: number; readonly release: () => void };',
    'export class ExecutionGovernor {',
    '  public async admit(spec: JobSpec): Promise<Admission> {',
    '    const release = this.store.claim(spec);',
    '    return { reservedMb: spec.reservedMb, release };',
    '  }',
    '}',
    '',
  ].join('\n');

  it('leaves the issue reproduction byte-identical', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(REPRODUCTION, BOTH, FILENAME);
    expect(fixed.output).toBe(REPRODUCTION);
    expect(fixed.messages).toEqual([]);
  });

  it('decorates nothing across the whole handle corpus', () => {
    const linter = makeLinter();
    const decorated: string[] = [];
    let examined = 0;
    for (const source of RESOURCE_HANDLE_FIXTURES) {
      examined += 1;
      const fixed = linter.verifyAndFix(source, BOTH, FILENAME);
      if (fixed.output.includes('@Memoize()')) {
        decorated.push(fixed.output);
      }
      // A composed run that never settles is its own defect, and an
      // unsettled run leaves the corpus half-examined.
      expect(fixed.messages).toEqual([]);
    }
    expect(decorated).toEqual([]);
    // The corpus cannot shrink out from under this without saying so.
    expect(examined).toBe(RESOURCE_HANDLE_FIXTURES.length);
    expect(examined).toBeGreaterThanOrEqual(29);
  });

  it('still memoizes a plain data result through the same pipeline', () => {
    const linter = makeLinter();
    const plain = [
      'export class Repo {',
      '  public async load(id: string): Promise<{ id: string; name: string }> {',
      '    return this.api.get(id);',
      '  }',
      '}',
      '',
    ].join('\n');
    const fixed = linter.verifyAndFix(plain, BOTH, FILENAME);
    // The annotation goes and the decorator arrives: the pipeline is live, so
    // the silence above is the carve-out rather than a dead harness.
    expect(fixed.output).toContain('@Memoize()');
    expect(fixed.output).not.toContain('Promise<{ id: string; name: string }>');
  });
});
