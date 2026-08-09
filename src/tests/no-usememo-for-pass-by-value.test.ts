import path from 'path';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
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

ruleTesterTs.run('no-usememo-for-pass-by-value', noUsememoForPassByValue, {
  valid: [
    {
      ...baseOptions,
      code: `
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
      import { useMemo } from 'react';

      export function useActions(id: string) {
        return useMemo(() => ({ id, onClick: () => id }), [id]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export const useItems = (values: Array<{ id: string }>) => {
        return useMemo(() => values.map((value) => ({ ...value, ready: true })), [values]);
      };
      `,
    },
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useWithFunctionTuple(fn: () => void) {
        return React.useMemo(() => [fn, { call: fn }], [fn]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';
      export function useDirect(value: number) {
        return value + 1;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function usePrime(n: number) {
        return useMemo(() => computeBigPrime(n), [n]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useAny(value: unknown) {
        return useMemo(() => value as any, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      import { useMemo } from 'react';

      export function useUnknown(value: unknown) {
        return useMemo(() => value as unknown, [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useDate(value: string) {
        return useMemo(() => new Date(value), [value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useArrayWithObjects(values: Array<{ id: string }>) {
        return useMemo(() => [{ id: values[0]?.id || 'none' }], [values]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      export function useLocalMemo(flag: boolean) {
        const useMemo = <T,>(factory: () => T, deps: unknown[]) => factory();
        return useMemo(() => (flag ? 1 : 0), [flag]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      import { useMemo } from 'react';

      export function useMixedTuple(id: string) {
        return useMemo(() => [id, { id }] as [string, { id: string }], [id]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useObjectArray() {
        return useMemo(() => [{ id: 1 }, { id: 2 }], []);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useSymbolToken() {
        return useMemo(() => Symbol('token'), []);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useIndeterminateUnion(flag: boolean, value: any) {
        return useMemo(() => (flag ? 1 : value), [flag, value]);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      import { useMemo } from 'react';

      export function useTuple(slug: string) {
        return useMemo(() => [slug, slug.toUpperCase()], [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTuple(slug: string) {
        return [slug, slug.toUpperCase()];
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useTupleLiteral() {
        return useMemo(() => [1, 2, 3] as const, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTupleLiteral() {
        return [1, 2, 3] as const;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function usePrimitiveArray() {
        const values: number[] = [1, 2, 3];
        return useMemo(() => values, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function usePrimitiveArray() {
        const values: number[] = [1, 2, 3];
        return values;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useEmptyArray() {
        return useMemo(() => [], []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useEmptyArray() {
        return [];
      }
      `,
    },
    {
      ...baseOptions,
      code: `

      import { useMemo } from 'react';

      export function useLeadingBlank(value: number) {
        return useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `


      export function useLeadingBlank(value: number) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useNegated(flag: boolean) {
        return !useMemo(() => flag, [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNegated(flag: boolean) {
        return !(flag);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useNegative(value: number) {
        return -useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNegative(value: number) {
        return -(value);
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useInvalidPattern(value: string) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo as memo } from 'react';

      export const useFlag = (values: string[]) =>
        memo(() => values.every(Boolean), [values]);
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export const useFlag = (values: string[]) =>
        values.every(Boolean);
      `,
    },
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useNext(count: number) {
        return React.useMemo(() => count + 1, [count]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNext(count: number) {
        return count + 1;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function usePlainLabel() {
        return useMemo(() => 'ready', []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function usePlainLabel() {
        return 'ready';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useUnion(flag: boolean) {
        return useMemo(() => (flag ? 'ready' : false), [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useUnion(flag: boolean) {
        return flag ? 'ready' : false;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useReadonly(values: ReadonlyArray<number>) {
        return useMemo(() => values[0] ?? 0, [values]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useReadonly(values: ReadonlyArray<number>) {
        return values[0] ?? 0;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useStored(slug: string) {
        const memoized = useMemo(() => slug, [slug]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useStored(slug: string) {
        const memoized = slug;
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useAssigned(flag: boolean) {
        let result: boolean;
        result = useMemo(() => flag, [flag]);
        return result;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

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
      import { useMemo } from 'react';

      export function useCompoundAssigned(flag: boolean) {
        let result = 1;
        result += useMemo(() => (flag ? 1 : 2), [flag]);
        return result;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

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
      import { useMemo } from 'react';

      export function useConditional(flag: boolean, fallback: string) {
        return flag
          ? useMemo(() => 'on', [flag])
          : fallback;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

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
      import { useMemo } from 'react';

      export function useTernaryTest(flag: boolean) {
        return useMemo(() => flag || 0, [flag]) ? 'yes' : 'no';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTernaryTest(flag: boolean) {
        return (flag || 0) ? 'yes' : 'no';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useNestedTernary(flag: boolean) {
        return useMemo(() => (flag ? 1 : 2), [flag]) ? 'on' : 'off';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNestedTernary(flag: boolean) {
        return (flag ? 1 : 2) ? 'on' : 'off';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useLogicalLeft(value?: string) {
        return useMemo(() => value && value.toUpperCase(), [value]) || 'NONE';
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useLogicalLeft(value?: string) {
        return (value && value.toUpperCase()) || 'NONE';
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useLogicalAnd(flag: boolean, label: string) {
        return useMemo(() => flag || label.length > 0, [flag, label]) && label;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useLogicalAnd(flag: boolean, label: string) {
        return (flag || label.length > 0) && label;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useBlock(slug: string) {
        return useMemo(() => {
          return slug;
        }, [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useBlock(slug: string) {
        return slug;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useParenthesized(value: string) {
        return useMemo(() => (value), [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useParenthesized(value: string) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      declare function wrap<T>(value: T): T;

      export function useWrapped(flag: boolean) {
        return wrap((flag, flag ? 1 : 2));
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useAssert(flag: boolean, fallback: boolean) {
        return useMemo(() => flag || fallback, [flag, fallback]) as boolean;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useAssert(flag: boolean, fallback: boolean) {
        return (flag || fallback) as boolean;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useSequence(first: number, second: number) {
        const memoized = (first, second);
        return memoized;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export const useArrowSequence = (first: number, second: number) =>
        useMemo(() => {
          return first, second;
        }, [first, second]);
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export const useArrowSequence = (first: number, second: number) =>
        (first, second);
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useValue(slug: string) {
        return useMemo(() => slug, [slug]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useValue(slug: string) {
        return slug;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useMath(value: number) {
        return useMemo(() => (value + 1), [value]) * 2;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useMath(value: number) {
        return (value + 1) * 2;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useArrayWrapper(flag: boolean) {
        return [useMemo(() => flag || !flag, [flag])];
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useArrayWrapper(flag: boolean) {
        return [flag || !flag];
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useObjectWrapper(flag: boolean) {
        return { value: useMemo(() => (flag ? 1 : 2), [flag]) };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useObjectWrapper(flag: boolean) {
        return { value: flag ? 1 : 2 };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useSatisfies(value: string) {
        return useMemo(() => value, [value]) satisfies string;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useSatisfies(value: string) {
        return value satisfies string;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useSatisfiesLogical(flag: boolean, fallback: boolean) {
        return useMemo(() => flag || fallback, [flag, fallback]) satisfies boolean;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useSatisfiesLogical(flag: boolean, fallback: boolean) {
        return (flag || fallback) satisfies boolean;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useDestructured() {
        const [value] = useMemo(() => [1], []);
        return value;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useDestructured() {
        const [value] = [1];
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useTupleDestructured() {
        const [a] = useMemo(() => [1] as [number], []);
        return a;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTupleDestructured() {
        const [a] = [1] as [number];
        return a;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useComplexDestructuring() {
        const [a, [b, c]] = useMemo(() => [1, [2, 3]] as const, []);
        return { a, b, c };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useComplexDestructuring() {
        const [a, [b, c]] = [1, [2, 3]] as const;
        return { a, b, c };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useRestDestructuring() {
        const [first, ...rest] = useMemo(() => [1, 2, 3], []);
        return { first, rest };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useRestDestructuring() {
        const [first, ...rest] = [1, 2, 3];
        return { first, rest };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useObjectDestructuring() {
        const { 0: a, ...rest } = useMemo(() => [1, 2, 3] as const, []);
        return { a, rest };
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useObjectDestructuring() {
        const { 0: a, ...rest } = [1, 2, 3] as const;
        return { a, rest };
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useAssignmentPattern() {
        const [a = 1] = useMemo(() => [2] as const, []);
        return a;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useAssignmentPattern() {
        const [a = 1] = [2] as const;
        return a;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      import React, { useMemo } from 'react';

      export function useMixedImport(slug: string) {
        const memoized = useMemo(() => slug, [slug]);
        return memoized;
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
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
      output: `

      export function useUndefinedValue() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useNullValue() {
        return useMemo(() => {
          return null;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

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
      output: `

      export function useNullishBranches(flag: boolean, fallback: string) {
        return (flag ? undefined : null) ?? fallback;
      }
      `,
    },
    // A string constant beside the call, read by the memoized expression. The
    // constant survives the unwrap because the expression is moved rather than
    // deleted, and its literal is what lets a program-less corpus probe
    // perturb this rule at all: `undefined`/`null` are the classifications an
    // isolated, lib-less program still resolves.
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useTaggedNothing(slug: string) {
        const tag = 'ready';
        return useMemo(() => (slug === tag ? undefined : null), [slug, tag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTaggedNothing(slug: string) {
        const tag = 'ready';
        return slug === tag ? undefined : null;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useFunctionCallback() {
        return useMemo(function () {
          return undefined;
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useFunctionCallback() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useVoidZero() {
        return useMemo(() => void 0, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useVoidZero() {
        return void 0;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useNamespaceMissing() {
        return React.useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNamespaceMissing() {
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useBlockCommentBeforeReturn() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useLineCommentBeforeReturn() {
        // keep me
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useTrailingCommentAfterExpression() {
        return useMemo(() => {
          return undefined; // keep me
        }, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useTrailingCommentAfterExpression() {
        return undefined // keep me
        ;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useCommentBeforeCloseBrace() {
        return undefined /* keep me */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useCommentInDependencyArray(flag: boolean) {
        return useMemo(() => flag, [
          // keep me
          flag,
        ]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useCommentInDependencyArray(flag: boolean) {
        return flag // keep me
        ;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useCommentBeforeArrow() {
        return useMemo(/* keep me */ () => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useCommentBeforeArrow() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useCommentBetweenArguments() {
        return useMemo(() => undefined /* keep me */, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useCommentBetweenArguments() {
        return undefined /* keep me */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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
      import { useMemo } from 'react';

      export function useManyComments(flag: boolean) {
        return useMemo(() => {
          // first
          /* second */
          return flag; // third
        }, [/* fourth */ flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useManyComments(flag: boolean) {
        // first
        return /* second */ flag // third
        /* fourth */;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useConciseBodyLeadingComment() {
        return useMemo(() => /* keep me */ undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useConciseBodyLeadingComment() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useCommentInParameterList() {
        return useMemo((/* keep me */) => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useCommentInParameterList() {
        return /* keep me */ undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useFunctionCallbackComment() {
        // keep me
        return null;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useNamespaceCallbackComment() {
        // keep me
        return undefined;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
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

      export function useDirectiveBlockComment() {
        /* eslint-disable-next-line no-restricted-syntax */
        return undefined;
      }
      `,
    },
    {
      // Retiring the sole specifier would remove the declaration, and the
      // ranges that unbind a specifier span the separators around it — so a
      // comment written inside the declaration would be swallowed or stranded
      // depending on where it sits. The unwrap is declined outright rather
      // than guessed at: the report stands, and no comment is rewritten.
      ...baseOptions,
      code: `
      import { /* keep me */ useMemo } from 'react';

      export function useCommentedImport() {
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: null,
    },
    {
      ...baseOptions,
      code: `
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
      // A comment among the specifiers declines the unwrap for the same reason
      // as above, even though a specifier here survives: the run that retires
      // `useMemo` reaches forward to `useState`, which is exactly where the
      // comment sits.
      ...baseOptions,
      code: `
      import { useMemo, /* keep me */ useState } from 'react';
      declare function useState<T>(initial: T): [T, (val: T) => void];

      export function useCommentedSpecifierList(slug: string) {
        const [state] = useState(slug);
        void state;
        return useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: null,
    },
    {
      // A comment INSIDE the returned expression rides along with its text, so
      // the fix stands. This is the negative half of the decline: without it a
      // rule that declined on every comment anywhere would pass just as well.
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useCommentInsideExpression(flag: boolean) {
        return useMemo(() => (flag ? undefined : /* inner */ null), [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useCommentInsideExpression(flag: boolean) {
        return flag ? undefined : /* inner */ null;
      }
      `,
    },
    {
      // Comments outside the call are never in the rewritten span.
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      /** Documented hook. */
      export function useCommentsAroundCall() {
        // above the call
        return useMemo(() => undefined, []); // beside the call
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      /** Documented hook. */
      export function useCommentsAroundCall() {
        // above the call
        return undefined; // beside the call
      }
      `,
    },
    // #1896: the reported repro. Unwrapping `React.useMemo` deletes the only
    // reference to the default import, so the same fix drops the declaration it
    // just orphaned.
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useNamespace() {
        return React.useMemo(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useNamespace() {
        return undefined;
      }
      `,
    },
    // ...and a `React` anything else reads survives. An over-eager removal
    // breaks the file outright, where a stranded import only fails a lint rule.
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useNamespaceKept(flag: boolean) {
        return React.useMemo(() => flag, [flag]);
      }

      export function useOther() {
        return React.useCallback(() => undefined, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
      import React from 'react';

      export function useNamespaceKept(flag: boolean) {
        return flag;
      }

      export function useOther() {
        return React.useCallback(() => undefined, []);
      }
      `,
    },
    // The namespace spelling of the same import.
    {
      ...baseOptions,
      code: `
      import * as React from 'react';

      export function useStarNamespace() {
        return React.useMemo(() => 1, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `

      export function useStarNamespace() {
        return 1;
      }
      `,
    },
    // Two unwraps in one file: judged one at a time neither is the binding's
    // last use, so the rewrites ship as ONE fix and the import goes with them.
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useFirst() {
        return React.useMemo(() => 1, []);
      }

      export function useSecond() {
        return React.useMemo(() => 2, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }, { messageId: 'primitiveMemo' }],
      output: `

      export function useFirst() {
        return 1;
      }

      export function useSecond() {
        return 2;
      }
      `,
    },
    // A suppressed report never rewrites, so its reference still counts and the
    // import stays: the batch may only be judged against edits that land.
    {
      ...baseOptions,
      code: `
      import React from 'react';

      export function useSuppressed() {
        // eslint-disable-next-line no-usememo-for-pass-by-value
        return React.useMemo(() => 1, []);
      }

      export function useLive() {
        return React.useMemo(() => 2, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
      import React from 'react';

      export function useSuppressed() {
        // eslint-disable-next-line no-usememo-for-pass-by-value
        return React.useMemo(() => 1, []);
      }

      export function useLive() {
        return 2;
      }
      `,
    },
    // Both clauses of a mixed declaration go orphaned at once, which collapses
    // the declaration rather than leaving `import , {} from 'react'` behind.
    {
      ...baseOptions,
      code: `
      import React, { useMemo as memo } from 'react';

      export function useNamed(slug: string) {
        return memo(() => slug, [slug]);
      }

      export function useNamespaced() {
        return React.useMemo(() => 1, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }, { messageId: 'primitiveMemo' }],
      output: `

      export function useNamed(slug: string) {
        return slug;
      }

      export function useNamespaced() {
        return 1;
      }
      `,
    },
    // The same file with the specifier left unaliased unwraps only the
    // namespaced call in one pass. Unbinding a specifier is checked against a
    // second, coarser opinion — does the NAME still occur anywhere the edit
    // does not delete — and `React.useMemo` spells `useMemo` in a position that
    // reads nothing. The conservative direction costs a pass, never a binding:
    // the unwrapped file no longer spells the name, so the next `--fix` pass
    // retires the specifier.
    {
      ...baseOptions,
      code: `
      import React, { useMemo } from 'react';

      export function useNamed(slug: string) {
        return useMemo(() => slug, [slug]);
      }

      export function useNamespaced() {
        return React.useMemo(() => 1, []);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }, { messageId: 'primitiveMemo' }],
      output: `
      import { useMemo } from 'react';

      export function useNamed(slug: string) {
        return useMemo(() => slug, [slug]);
      }

      export function useNamespaced() {
        return 1;
      }
      `,
    },
    // The mixed declaration with only the default clause orphaned: the named
    // specifier a surviving call still reads keeps its place.
    {
      ...baseOptions,
      code: `
      import React, { useMemo } from 'react';

      export function useNamespacedOnly() {
        return React.useMemo(() => 1, []);
      }

      export function useObject(id: string) {
        return useMemo(() => ({ id }), [id]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
      import { useMemo } from 'react';

      export function useNamespacedOnly() {
        return 1;
      }

      export function useObject(id: string) {
        return useMemo(() => ({ id }), [id]);
      }
      `,
    },
    // A comment trailing the import on its own line sits AFTER the terminating
    // token, so it is outside the declaration and not the fix's to delete. The
    // retirement stops short of it rather than claiming the whole line.
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react'; /* pinned */

      export function useTrailingImportComment(value: string) {
        return useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
/* pinned */

      export function useTrailingImportComment(value: string) {
        return value;
      }
      `,
    },
    {
      ...baseOptions,
      code: `
      import React from 'react'; // pinned

      export function useTrailingNamespaceComment(value: string) {
        return React.useMemo(() => value, [value]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: `
// pinned

      export function useTrailingNamespaceComment(value: string) {
        return value;
      }
      `,
    },
    // The dependency array IS deleted, so a binding read only from there is
    // left unreferenced. A parameter is not something the import planner may
    // rewrite, so the whole fix declines — a report without a fix beats a file
    // that fails `noUnusedParameters`.
    {
      ...baseOptions,
      code: `
      import { useMemo } from 'react';

      export function useStaleDependency(flag: boolean) {
        return useMemo(() => 'constant', [flag]);
      }
      `,
      errors: [{ messageId: 'primitiveMemo' }],
      output: null,
    },
  ],
});

/**
 * The classic JSX runtime keeps `React` alive with no explicit reference, and
 * scope analysis is the sole oracle for that: the scope manager records the
 * implicit reference a JSX pragma creates, which is exactly what
 * `no-unused-vars` consults. A hand-written `.tsx`/JSX guard was measurably
 * wrong under `jsxPragma: null` (#1894), so none is written here.
 *
 * The pair is a control pair. Only the JSX-free half proves the removal still
 * happens in a `.tsx` file, without which the first case would pass for a rule
 * that simply never unbinds anything.
 */
const jsxOptions = {
  parserOptions: {
    project: path.join(__dirname, '../../tsconfig.json'),
    tsconfigRootDir: path.join(__dirname, '../../'),
    ecmaVersion: 2020 as const,
    sourceType: 'module' as const,
    ecmaFeatures: { jsx: true },
  },
  filename: path.join(
    __dirname,
    '../../src/tests/fixtures/type-aware-component.tsx',
  ),
} as const;

ruleTesterJsx.run(
  'no-usememo-for-pass-by-value (jsx)',
  noUsememoForPassByValue,
  {
    valid: [],
    invalid: [
      {
        ...jsxOptions,
        code: `import React from 'react';

export function useLabel(flag: boolean) {
  return React.useMemo(() => flag, [flag]);
}

export const Panel = () => <div />;
`,
        errors: [{ messageId: 'primitiveMemo' }],
        output: `import React from 'react';

export function useLabel(flag: boolean) {
  return flag;
}

export const Panel = () => <div />;
`,
      },
      {
        ...jsxOptions,
        code: `import React from 'react';

export function useLabel(flag: boolean) {
  return React.useMemo(() => flag, [flag]);
}
`,
        errors: [{ messageId: 'primitiveMemo' }],
        output: `
export function useLabel(flag: boolean) {
  return flag;
}
`,
      },
    ],
  },
);
