import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { noUsememoForPassByValue } from '../rules/no-usememo-for-pass-by-value';

const parserOptions = {
  project: path.join(__dirname, '../../tsconfig.json'),
  tsconfigRootDir: path.join(__dirname, '../../'),
  ecmaVersion: 2020 as const,
  sourceType: 'module' as const,
};
const baseOptions = {
  parserOptions,
  filename: path.join(__dirname, '../../src/index.ts'),
} as const;
const typedPrelude = `
declare function useMemo<T>(factory: () => T, deps: unknown[]): T;
declare namespace React {
  function useMemo<T>(factory: () => T, deps: unknown[]): T;
}
declare module 'react' {
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
}`;

ruleTesterTs.run('no-usememo-for-pass-by-value', noUsememoForPassByValue, {
  valid: [
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      // Not a custom hook
      function buildLabel(slug: string) {
        return useMemo(() => slug.toUpperCase(), [slug]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useActions(id: string) {
        return useMemo(() => ({ id, onClick: () => id }), [id]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export const useItems = (values: Array<{ id: string }>) => {
        return useMemo(() => values.map((value) => ({ ...value, ready: true })), [values]);
      };
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React from 'react';

      export function useWithFunctionTuple(fn: () => void) {
        return React.useMemo(() => [fn, { call: fn }], [fn]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';
      export function useDirect(value: number) {
        return value + 1;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function usePrime(n: number) {
        return useMemo(() => computeBigPrime(n), [n]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useAny(value: unknown) {
        return useMemo(() => value as any, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      declare function fail(message: string): never;

      import { useMemo } from 'react';

      export function useNever(message: string) {
        return useMemo(() => fail(message), [message]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useUnknown(value: unknown) {
        return useMemo(() => value as unknown, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useDate(value: string) {
        return useMemo(() => new Date(value), [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useArrayWithObjects(values: Array<{ id: string }>) {
        return useMemo(() => [{ id: values[0]?.id || 'none' }], [values]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      export function useLocalMemo(flag: boolean) {
        const useMemo = <T,>(factory: () => T, deps: unknown[]) => factory();
        return useMemo(() => (flag ? 1 : 0), [flag]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      export function useLocalReactObject(value: number) {
        const React = {
          useMemo<T>(factory: () => T, deps: unknown[]) {
            void deps;
            return factory();
          },
        };

        return React.useMemo(() => value, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';
      void useMemo;

      export function useShadowedUseMemo(
        useMemo: <T>(factory: () => T, deps: unknown[]) => T,
        value: number,
      ) {
        return useMemo(() => value, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React from 'react';
      void React;

      export function useShadowedReact(
        React: { useMemo<T>(factory: () => T, deps: unknown[]): T },
        value: number,
      ) {
        return React.useMemo(() => value, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useReassigned(flag: boolean) {
        let memoized = useMemo(() => flag, [flag]);
        memoized = flag ? 1 : 0;
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useShadowed(value: string, flag: boolean) {
        const memo = useMemo(() => ({ label: value }), [value]);
        if (flag) {
          const memo = useMemo(() => value.length, [value]);
          console.log(memo);
        }
        return memo;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useBlockWithStatements(slug: string) {
        return useMemo(() => {
          const value = slug.toUpperCase();
          return value;
        }, [slug]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useMixedTuple(id: string) {
        return useMemo(() => [id, { id }] as [string, { id: string }], [id]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useObjectArray() {
        return useMemo(() => [{ id: 1 }, { id: 2 }], []);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useSymbolToken() {
        return useMemo(() => Symbol('token'), []);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useIndeterminateUnion(flag: boolean, value: any) {
        return useMemo(() => (flag ? 1 : value), [flag, value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useIndeterminateTuple(value: any) {
        return useMemo(() => [1, value] as [number, any], [value]);
      }
      `,
    },
  ],
  invalid: [
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useTuple(slug: string) {
        return useMemo(() => [slug, slug.toUpperCase()], [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useTuple(slug: string) {
        return [slug, slug.toUpperCase()];
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useTupleLiteral() {
        return useMemo(() => [1, 2, 3] as const, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useTupleLiteral() {
        return [1, 2, 3] as const;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function usePrimitiveArray() {
        const values: number[] = [1, 2, 3];
        return useMemo(() => values, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function usePrimitiveArray() {
        const values: number[] = [1, 2, 3];
        return values;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useEmptyArray() {
        return useMemo(() => [], []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useEmptyArray() {
        return [];
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}

      import { useMemo } from 'react';

      export function useLeadingBlank(value: number) {
        return useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useLeadingBlank(value: number) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useNegated(flag: boolean) {
        return !useMemo(() => flag, [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useNegated(flag: boolean) {
        return !(flag);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useNegative(value: number) {
        return -useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useNegative(value: number) {
        return -(value);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useInvalidPattern(value: string) {
        return useMemo(() => value, [value]);
      }
      `,
      options: [{ allowExpensiveCalleePatterns: ['('] }],
      errors: [
        { messageId: 'invalidRegex', data: { pattern: '(' } },
        { messageId: 'primitiveMemo' },
      ],
      output: `
${typedPrelude}
      export function useInvalidPattern(value: string) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo as memo } from 'react';

      export const useFlag = (values: string[]) =>
        memo(() => values.every(Boolean), [values]);
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export const useFlag = (values: string[]) =>
        values.every(Boolean);
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React from 'react';

      export function useNext(count: number) {
        return React.useMemo(() => count + 1, [count]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import React from 'react';

      export function useNext(count: number) {
        return count + 1;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useUnion(flag: boolean) {
        return useMemo(() => (flag ? 'ready' : false), [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useUnion(flag: boolean) {
        return flag ? 'ready' : false;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useReadonly(values: ReadonlyArray<number>) {
        return useMemo(() => values[0] ?? 0, [values]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useReadonly(values: ReadonlyArray<number>) {
        return values[0] ?? 0;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useStored(slug: string) {
        const memoized = useMemo(() => slug, [slug]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useStored(slug: string) {
        const memoized = slug;
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useAssigned(flag: boolean) {
        let result: boolean;
        result = useMemo(() => flag, [flag]);
        return result;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useAssigned(flag: boolean) {
        let result: boolean;
        result = flag;
        return result;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCompoundAssigned(flag: boolean) {
        let result = 1;
        result += useMemo(() => (flag ? 1 : 2), [flag]);
        return result;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCompoundAssigned(flag: boolean) {
        let result = 1;
        result += flag ? 1 : 2;
        return result;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useConditional(flag: boolean, fallback: string) {
        return flag
          ? useMemo(() => 'on', [flag])
          : fallback;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useConditional(flag: boolean, fallback: string) {
        return flag
          ? 'on'
          : fallback;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useTernaryTest(flag: boolean) {
        return useMemo(() => flag || 0, [flag]) ? 'yes' : 'no';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useTernaryTest(flag: boolean) {
        return (flag || 0) ? 'yes' : 'no';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useNestedTernary(flag: boolean) {
        return useMemo(() => (flag ? 1 : 2), [flag]) ? 'on' : 'off';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useNestedTernary(flag: boolean) {
        return (flag ? 1 : 2) ? 'on' : 'off';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useLogicalLeft(value?: string) {
        return useMemo(() => value && value.toUpperCase(), [value]) || 'NONE';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useLogicalLeft(value?: string) {
        return (value && value.toUpperCase()) || 'NONE';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useLogicalAnd(flag: boolean, label: string) {
        return useMemo(() => flag || label.length > 0, [flag, label]) && label;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useLogicalAnd(flag: boolean, label: string) {
        return (flag || label.length > 0) && label;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useBlock(slug: string) {
        return useMemo(() => {
          return slug;
        }, [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useBlock(slug: string) {
        return slug;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useParenthesized(value: string) {
        return useMemo(() => (value), [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useParenthesized(value: string) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';
      declare function wrap<T>(value: T): T;

      export function useWrapped(flag: boolean) {
        return wrap(useMemo(() => {
          return flag, flag ? 1 : 2;
        }, [flag]));
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      declare function wrap<T>(value: T): T;

      export function useWrapped(flag: boolean) {
        return wrap((flag, flag ? 1 : 2));
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useAssert(flag: boolean, fallback: boolean) {
        return useMemo(() => flag || fallback, [flag, fallback]) as boolean;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useAssert(flag: boolean, fallback: boolean) {
        return (flag || fallback) as boolean;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useSequence(first: number, second: number) {
        const memoized = useMemo(() => {
          return first, second;
        }, [first, second]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useSequence(first: number, second: number) {
        const memoized = (first, second);
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export const useArrowSequence = (first: number, second: number) =>
        useMemo(() => {
          return first, second;
        }, [first, second]);
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export const useArrowSequence = (first: number, second: number) =>
        (first, second);
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useValue(slug: string) {
        return useMemo(() => slug, [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useValue(slug: string) {
        return slug;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useMath(value: number) {
        return useMemo(() => (value + 1), [value]) * 2;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useMath(value: number) {
        return (value + 1) * 2;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useArrayWrapper(flag: boolean) {
        return [useMemo(() => flag || !flag, [flag])];
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useArrayWrapper(flag: boolean) {
        return [flag || !flag];
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useObjectWrapper(flag: boolean) {
        return { value: useMemo(() => (flag ? 1 : 2), [flag]) };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useObjectWrapper(flag: boolean) {
        return { value: flag ? 1 : 2 };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useSatisfies(value: string) {
        return useMemo(() => value, [value]) satisfies string;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useSatisfies(value: string) {
        return value satisfies string;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useSatisfiesLogical(flag: boolean, fallback: boolean) {
        return useMemo(() => flag || fallback, [flag, fallback]) satisfies boolean;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useSatisfiesLogical(flag: boolean, fallback: boolean) {
        return (flag || fallback) satisfies boolean;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useDestructured() {
        const [value] = useMemo(() => [1], []);
        return value;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useDestructured() {
        const [value] = [1];
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useTupleDestructured() {
        const [a] = useMemo(() => [1] as [number], []);
        return a;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useTupleDestructured() {
        const [a] = [1] as [number];
        return a;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useComplexDestructuring() {
        const [a, [b, c]] = useMemo(() => [1, [2, 3]] as const, []);
        return { a, b, c };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useComplexDestructuring() {
        const [a, [b, c]] = [1, [2, 3]] as const;
        return { a, b, c };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useRestDestructuring() {
        const [first, ...rest] = useMemo(() => [1, 2, 3], []);
        return { first, rest };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useRestDestructuring() {
        const [first, ...rest] = [1, 2, 3];
        return { first, rest };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useObjectDestructuring() {
        const { 0: a, ...rest } = useMemo(() => [1, 2, 3] as const, []);
        return { a, rest };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useObjectDestructuring() {
        const { 0: a, ...rest } = [1, 2, 3] as const;
        return { a, rest };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useAssignmentPattern() {
        const [a = 1] = useMemo(() => [2] as const, []);
        return a;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useAssignmentPattern() {
        const [a = 1] = [2] as const;
        return a;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo, useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function usePartialImport(slug: string) {
        const [state] = useState(slug);
        const memoized = useMemo(() => state, [state]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import { useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function usePartialImport(slug: string) {
        const [state] = useState(slug);
        const memoized = state;
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React, { useMemo } from 'react';

      export function useMixedImport(slug: string) {
        const memoized = useMemo(() => slug, [slug]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import React from 'react';

      export function useMixedImport(slug: string) {
        const memoized = slug;
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useInvalidConfig() {
        return useMemo(() => 1, []);
      }
      `,
      options: [{ allowExpensiveCalleePatterns: ['['] }],
      errors: [
        { messageId: 'invalidRegex', data: { pattern: '[' } },
        { messageId: 'primitiveMemo' },
      ],
      output: `
${typedPrelude}
      export function useInvalidConfig() {
        return 1;
      }
      `,
    },
  ],
});
