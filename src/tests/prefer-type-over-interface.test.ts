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

  // Issue #1406: the heritage separator `,` used to survive into the type
  // alias. Without this guard, a parse assertion that silently accepted the
  // broken shape would prove nothing about the multi-heritage cases below.
  it('rejects the pre-fix broken shape `type A =  B, C & {`', () => {
    expect(() =>
      asParseable('export type A =  B, C & {\n  a: string;\n};'),
    ).toThrow();
  });

  it('accepts the expected intersection shape `type A = B & C & {`', () => {
    expect(() =>
      asParseable('export type A = B & C & {\n  a: string;\n};'),
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
        'type AnotherInterface = SomeInterface & { otherField: number; }',
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
      output: asParseable('type Derived<T> = Base<T> & { extra: T; }'),
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
        'type Special<T extends string> = Base & { value: T; }',
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
    // Issue #1406 reproduction: two heritage clauses must be joined with `&`,
    // not left separated by the `,` the interface syntax used.
    {
      code: `interface B { b: string }
interface C { c: string }
export interface A extends B, C {
  a: string;
}`,
      errors: [
        { messageId: 'preferType', data: { interfaceName: 'B' } },
        { messageId: 'preferType', data: { interfaceName: 'C' } },
        { messageId: 'preferType', data: { interfaceName: 'A' } },
      ],
      output: asParseable(`type B = { b: string }
type C = { c: string }
export type A = B & C & {
  a: string;
}`),
    },
    // Three heritage clauses
    {
      code: 'interface A extends B, C, D { a: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A = B & C & D & { a: string; }'),
    },
    // Generic heritage alongside a plain one: type arguments must round-trip
    {
      code: 'interface A<T> extends B<T>, C { a: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A<T> = B<T> & C & { a: T; }'),
    },
    // Qualified (namespaced) heritage names
    {
      code: 'interface A extends ns.B, C { a: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A = ns.B & C & { a: string; }'),
    },
    // Deeply qualified plus multiple generic arguments
    {
      code: 'interface A extends outer.inner.B<T, U>, C<T> { a: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A = outer.inner.B<T, U> & C<T> & { a: T; }'),
    },
    // Heritage clauses spread across lines collapse onto the alias line
    {
      code: `interface A
  extends B,
    C {
  a: string;
}`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable(`type A = B & C & {
  a: string;
}`),
    },
    // A constrained type parameter must not be mistaken for heritage when
    // several heritage clauses follow it.
    {
      code: 'interface A<T extends string> extends B, C { a: T; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A<T extends string> = B & C & { a: T; }'),
    },
    // No whitespace anywhere in the header still yields a spaced `=`
    {
      code: 'interface A{a:string}',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable('type A = {a:string}'),
    },
    // Comments outside the rewritten header spans survive the fix
    {
      code: `// leading comment
interface A extends B, C {
  // member comment
  a: string;
}`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: asParseable(`// leading comment
type A = B & C & {
  // member comment
  a: string;
}`),
    },
    // Comments *inside* the rewritten header spans cannot be relocated
    // safely, so the rule reports without fixing rather than deleting them.
    {
      code: 'interface A /* keep */ extends B, C { a: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: null,
    },
    {
      code: 'interface /* keep */ A { a: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: null,
    },
    {
      code: 'interface A extends B /* keep */ { a: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: null,
    },
    {
      code: `interface A // keep
  extends B, C {
  a: string;
}`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'A' },
        },
      ],
      output: null,
    },
  ],
});
