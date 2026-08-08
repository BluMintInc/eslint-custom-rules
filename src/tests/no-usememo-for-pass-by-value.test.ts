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
    /**
     * Nullish-valued memos, and the reason they are spelled that way.
     *
     * Every fixture above resolves its memoized value through a type the checker
     * can only describe with a lib: `string`, `number`, a tuple. The repo-wide
     * fix guards lint this corpus under a bare `Linter`, which strips the
     * `project` these cases declare, and the isolated single-file program that
     * remains carries NO lib files. `checker.isArrayLikeType` then answers true
     * for every non-nullable type, because the global readonly-array type it
     * compares against has degraded to the error type — so `isPassByValueType`
     * takes its array branch, finds no type arguments, and returns
     * `indeterminate`, which `checkUseMemoForPassByValue` declines. The result
     * was a rule shipping `fixable: 'code'` at `'error'` whose fixer no
     * convergence, shadow-capture, type-safety, comment-fidelity or fixpoint
     * sweep had ever run (#1871).
     *
     * `undefined` and `null` are the shapes that survive that degradation:
     * `isArrayLikeType` short-circuits on `TypeFlags.Nullable`, so the primitive
     * flag test is reached and the classification is identical with and without
     * a program. Respelling any of these with a `string` or `number` value
     * therefore re-darkens the fix channel without failing anything here, since
     * `RuleTester` runs them against the real project.
     *
     * The first two also omit `typedPrelude`, which is not an oversight:
     * `fixer-type-safety` compiles the whole corpus as ONE program and drops
     * every snippet carrying a `declare module 'x'`, since an ambient module
     * declaration retypes every other rule's fixtures. With the prelude on all
     * of them, that guard had no pair to type-check for this rule at all. They
     * report through the same path — the unresolvable `react` import types the
     * call `any`, and `classifyUseMemoReturnType` falls back to the returned
     * expression.
     */
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useUndefinedValue() {
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `      export function useUndefinedValue() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useNullValue() {
        return useMemo(() => {
          return null;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useNullValue() {
        return null;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useNullishBranches(flag: boolean, fallback: string) {
        return useMemo(() => (flag ? undefined : null), [flag]) ?? fallback;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `      export function useNullishBranches(flag: boolean, fallback: string) {
        return (flag ? undefined : null) ?? fallback;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useFunctionCallback() {
        return useMemo(function () {
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useFunctionCallback() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useVoidZero() {
        return useMemo(() => void 0, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useVoidZero() {
        return void 0;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React from 'react';

      export function useNamespaceMissing() {
        return React.useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import React from 'react';

      export function useNamespaceMissing() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo, useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useStoredNothing(slug: string) {
        const [state] = useState(slug);
        void state;
        const memoized = useMemo(() => undefined, []);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import { useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useStoredNothing(slug: string) {
        const [state] = useState(slug);
        void state;
        const memoized = undefined;
        return memoized;
      }
      `,
    },
    /**
     * Comment fidelity (#1877).
     *
     * The fix rewrites the whole `useMemo(...)` span from the returned
     * expression, so anything written elsewhere in that span — in the callback
     * body, around the arguments, in the dependency array — has no anchor in
     * the replacement. Deleting such a comment silently under `--fix` and
     * declining the fix whenever one is present are BOTH fidelity bugs: the
     * second makes the mere presence of a comment decide whether the rule
     * rewrites at all. The fixer instead carries every stranded comment into
     * the replacement, on the side of the expression it was written on, and
     * without changing the non-comment token stream: parenthesization stays
     * exactly what the comment-free fix would emit. A comment that demands a
     * line of its own (a `//` comment, or a block-comment
     * `eslint-disable-next-line`, which targets the line after the comment
     * ENDS) is hoisted onto a full line above the line the call starts on when
     * the replacement is unparenthesized — a line break between `return` and
     * its argument would change the program through ASI — and rides inside the
     * parentheses, where no newline can trigger ASI, when the context
     * parenthesizes.
     *
     * The pair at the end pins the boundary from the other side: a comment
     * INSIDE the returned expression travels with its text, and a comment
     * outside the call is never in the rewritten span.
     */
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useBlockCommentBeforeReturn() {
        return useMemo(() => {
          /* keep me */
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useBlockCommentBeforeReturn() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useLineCommentBeforeReturn() {
        return useMemo(() => {
          // keep me
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useLineCommentBeforeReturn() {
        // keep me
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useTrailingCommentAfterExpression() {
        return useMemo(() => {
          return undefined; // keep me
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useTrailingCommentAfterExpression() {
        return undefined // keep me
        ;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentBeforeCloseBrace() {
        return useMemo(() => {
          return undefined;
          /* keep me */
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentBeforeCloseBrace() {
        return undefined /* keep me */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentInDependencyArray(flag: boolean) {
        return useMemo(() => undefined, [
          // keep me
          flag,
        ]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentInDependencyArray(flag: boolean) {
        return undefined // keep me
        ;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentBeforeArrow() {
        return useMemo(/* keep me */ () => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentBeforeArrow() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentBetweenArguments() {
        return useMemo(() => undefined /* keep me */, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentBetweenArguments() {
        return undefined /* keep me */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useJsDocInCallback() {
        return useMemo(() => {
          /**
           * Why this value is nothing.
           */
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useJsDocInCallback() {
        return /**
           * Why this value is nothing.
           */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useManyComments(flag: boolean) {
        return useMemo(() => {
          // first
          /* second */
          return undefined; // third
        }, [/* fourth */ flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useManyComments(flag: boolean) {
        // first
        return /* second */ undefined // third
        /* fourth */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useConciseBodyLeadingComment() {
        return useMemo(() => /* keep me */ undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useConciseBodyLeadingComment() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentInParameterList() {
        return useMemo((/* keep me */) => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentInParameterList() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useFunctionCallbackComment() {
        return useMemo(function () {
          // keep me
          return null;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useFunctionCallbackComment() {
        // keep me
        return null;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import React from 'react';

      export function useNamespaceCallbackComment() {
        return React.useMemo(() => {
          // keep me
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import React from 'react';

      export function useNamespaceCallbackComment() {
        // keep me
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export const useAliasedCommentedMemo = () => {
        const value = useMemo(() => {
          /* keep me */
          return undefined;
        }, []);
        return value;
      };
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export const useAliasedCommentedMemo = () => {
        const value = /* keep me */ undefined;
        return value;
      };
      `,
    },
    {
      // A hoisted line comment in assignment position: no ASI hazard exists
      // after `=`, but the hoist keeps one shape for every unparenthesized
      // context, and the comment still annotates the line that now hosts the
      // expression.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useStoredLineComment() {
        const memoized = useMemo(() => {
          // keep me
          return undefined;
        }, []);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useStoredLineComment() {
        // keep me
        const memoized = undefined;
        return memoized;
      }
      `,
    },
    {
      // A parenthesizing context carries the comment INSIDE the parentheses,
      // where a line break can never trigger ASI, so the line comment keeps a
      // line of its own without leaving the replacement.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useNegatedCommented(flag: boolean) {
        void flag;
        return !useMemo(() => {
          // keep me
          return null;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useNegatedCommented(flag: boolean) {
        void flag;
        return !(
        // keep me
        null);
      }
      `,
    },
    {
      // An eslint-disable-next-line directive targets the line after it, so it
      // is hoisted onto its own line directly above the statement that now
      // hosts the expression it guards.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useDirectiveLineComment() {
        return useMemo(() => {
          // eslint-disable-next-line no-restricted-syntax
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useDirectiveLineComment() {
        // eslint-disable-next-line no-restricted-syntax
        return undefined;
      }
      `,
    },
    {
      // The block spelling of the same directive targets the line after the
      // comment ENDS, so it may not share a line with the expression either.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useDirectiveBlockComment() {
        return useMemo(() => {
          /* eslint-disable-next-line no-restricted-syntax */
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useDirectiveBlockComment() {
        /* eslint-disable-next-line no-restricted-syntax */
        return undefined;
      }
      `,
    },
    {
      // Retiring the sole specifier removes the declaration, but a comment
      // between the braces survives in the declaration's place.
      ...baseOptions,
      code: `
${typedPrelude}
      import { /* keep me */ useMemo } from 'react';

      export function useCommentedImport() {
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      /* keep me */

      export function useCommentedImport() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo, useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useCommentedPartialImport(slug: string) {
        const [state] = useState(slug);
        void state;
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import { useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useCommentedPartialImport(slug: string) {
        const [state] = useState(slug);
        void state;
        return undefined;
      }
      `,
    },
    {
      // A comment between the specifiers survives because the removal edits
      // only the retired specifier and its comma, never re-emitting the
      // declaration from its parts.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo, /* keep me */ useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useCommentedSpecifierList(slug: string) {
        const [state] = useState(slug);
        void state;
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      import {  /* keep me */ useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useCommentedSpecifierList(slug: string) {
        const [state] = useState(slug);
        void state;
        return undefined;
      }
      `,
    },
    {
      // A comment INSIDE the returned expression rides along with its text, so
      // the fix stands. This is the negative half of the decline: without it a
      // rule that declined on every comment anywhere would pass just as well.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      export function useCommentInsideExpression(flag: boolean) {
        return useMemo(() => (flag ? undefined : /* inner */ null), [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      export function useCommentInsideExpression(flag: boolean) {
        return flag ? undefined : /* inner */ null;
      }
      `,
    },
    {
      // Comments outside the call are never in the rewritten span.
      ...baseOptions,
      code: `
${typedPrelude}
      import { useMemo } from 'react';

      /** Documented hook. */
      export function useCommentsAroundCall() {
        // above the call
        return useMemo(() => undefined, []); // beside the call
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
${typedPrelude}
      /** Documented hook. */
      export function useCommentsAroundCall() {
        // above the call
        return undefined; // beside the call
      }
      `,
    },
  ],
});
