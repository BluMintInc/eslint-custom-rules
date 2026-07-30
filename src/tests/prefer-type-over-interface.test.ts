import { parse } from '@typescript-eslint/parser';
import { preferTypeOverInterface } from '../rules/prefer-type-over-interface';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * The defect class this suite guards against is unparseable fixer output
 * (e.g. `type X =<T> {` from issue #1403), so every expected `output` below
 * is asserted to parse. The loc/range/tokens/comment options are required:
 * omitting them can make the parser throw on valid input.
 */
const PARSE_OPTIONS = {
  loc: true,
  range: true,
  tokens: true,
  comment: true,
  ecmaVersion: 2020,
  sourceType: 'module',
} as const;

const asParseable = (output: string): string => {
  parse(output, PARSE_OPTIONS);
  return output;
};

describe('prefer-type-over-interface fixed-output parse guard', () => {
  it('rejects the pre-fix broken shape `type X =<T> {`', () => {
    expect(() =>
      asParseable('export type Filter =<T> {\n  filter: FilterFunction<T>;\n}'),
    ).toThrow();
  });

  it('accepts the expected fixed shape `type X<T> = {`', () => {
    expect(() =>
      asParseable(
        'export type Filter<T> = {\n  filter: FilterFunction<T>;\n};',
      ),
    ).not.toThrow();
  });
});

ruleTesterTs.run('prefer-type-over-interface', preferTypeOverInterface, {
  valid: [
    'type SomeType = { field: string; };',
    'type AnotherType = SomeType & { otherField: number; };',
    'type GenericType<T> = { value: T; };',
    'type ConstrainedType<T extends string> = { value: T; };',
  ],
  invalid: [
    {
      code: 'interface SomeInterface { field: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'SomeInterface' },
        },
      ],
      output: asParseable('type SomeInterface = { field: string; }'),
    },
    {
      code: 'interface AnotherInterface extends SomeInterface { otherField: number; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'AnotherInterface' },
        },
      ],
      output: asParseable(
        'type AnotherInterface =  SomeInterface & { otherField: number; }',
      ),
    },
    // Issue #1403 reproduction: the fixer must place `=` after the
    // type-parameter list, not after the interface name.
    {
      code: `export type FilterFunction<T> = (items: T[]) => T[];

export interface Filter<T> {
  filter: FilterFunction<T>;
}`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Filter' },
        },
      ],
      output: asParseable(`export type FilterFunction<T> = (items: T[]) => T[];

export type Filter<T> = {
  filter: FilterFunction<T>;
}`),
    },
    // Single type parameter
    {
      code: 'interface Box<T> { value: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Box' },
        },
      ],
      output: asParseable('type Box<T> = { value: T; }'),
    },
    // Multiple type parameters
    {
      code: 'interface Pair<T, U> { first: T; second: U; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Pair' },
        },
      ],
      output: asParseable('type Pair<T, U> = { first: T; second: U; }'),
    },
    // Constrained type parameter
    {
      code: 'interface Named<T extends string> { name: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Named' },
        },
      ],
      output: asParseable('type Named<T extends string> = { name: T; }'),
    },
    // Defaulted type parameter
    {
      code: 'interface Wrapper<T = unknown> { value: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Wrapper' },
        },
      ],
      output: asParseable('type Wrapper<T = unknown> = { value: T; }'),
    },
    // Combined constrained + additional type parameter
    {
      code: 'interface Lookup<T extends keyof U, U> { key: T; source: U; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Lookup' },
        },
      ],
      output: asParseable(
        'type Lookup<T extends keyof U, U> = { key: T; source: U; }',
      ),
    },
    // Generic interface with a heritage clause
    {
      code: 'interface Derived<T> extends Base<T> { extra: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Derived' },
        },
      ],
      output: asParseable('type Derived<T> =  Base<T> & { extra: T; }'),
    },
    // Constrained type parameter combined with a heritage clause: the
    // heritage `extends` must be removed, not the constraint's `extends`.
    {
      code: 'interface Special<T extends string> extends Base { value: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Special' },
        },
      ],
      output: asParseable(
        'type Special<T extends string> =  Base & { value: T; }',
      ),
    },
    // Multiline generic interface with members referencing the parameter
    {
      code: `interface Repository<T extends { id: string }> {
  findById(id: string): T | undefined;
  save(entity: T): void;
}`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Repository' },
        },
      ],
      output: asParseable(`type Repository<T extends { id: string }> = {
  findById(id: string): T | undefined;
  save(entity: T): void;
}`),
    },
  ],
});
