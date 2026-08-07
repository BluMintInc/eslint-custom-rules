import { Linter, Rule } from 'eslint';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
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

  // Issue #1850: the keyword swap under `export default` produced this. It is
  // not a near-miss the parser tolerates — there is no default-exported type
  // alias in TypeScript at all — which is why the fix is declined rather than
  // re-anchored.
  it('rejects the pre-fix broken shape `export default type X = {…}`', () => {
    expect(() =>
      asParseable('export default type Opts = { a?: string }'),
    ).toThrow();
  });

  // The remedy the `preferTypeDefaultExport` message names. Parsing is the
  // weaker half of the claim; the stronger half — that it type-checks and that
  // existing `import Opts from '...'` sites keep working — was verified with
  // `tsc` under `strict`, `isolatedModules` and `verbatimModuleSyntax`.
  it('accepts the two-statement remedy `type X = …; export type { X as default };`', () => {
    expect(() =>
      asParseable(
        'type Opts = { a?: string };\nexport type { Opts as default };',
      ),
    ).not.toThrow();
  });
});

/**
 * Issue #1549: the augmentation exemption keys off the AST spelling of the
 * enclosing `TSModuleDeclaration`, so these assertions pin the shape the
 * pinned parser actually produces. If a parser bump changes the spelling, this
 * fails loudly instead of silently re-enabling the breaking autofix.
 */
describe('prefer-type-over-interface augmentation AST shape', () => {
  const moduleDeclarationOf = (code: string) => {
    const found: TSESTree.TSModuleDeclaration[] = [];
    const walk = (node: TSESTree.Node) => {
      if (node.type === AST_NODE_TYPES.TSModuleDeclaration) {
        found.push(node);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          value.forEach(
            (child) =>
              child &&
              typeof child.type === 'string' &&
              walk(child as TSESTree.Node),
          );
        } else if (value && typeof (value as TSESTree.Node).type === 'string') {
          walk(value as TSESTree.Node);
        }
      }
    };
    walk(parse(code, PARSE_OPTIONS) as unknown as TSESTree.Node);
    return found[0];
  };

  it('spells `declare global` with the `global` flag and a `global` identifier id', () => {
    const declaration = moduleDeclarationOf(
      'declare global { interface W {} }',
    );
    expect(declaration.global).toBe(true);
    expect(declaration.declare).toBe(true);
    expect(declaration.id.type).toBe(AST_NODE_TYPES.Identifier);
    expect((declaration.id as TSESTree.Identifier).name).toBe('global');
  });

  it('spells an external-module augmentation with a string Literal id', () => {
    const declaration = moduleDeclarationOf(
      "declare module '@mui/material/styles' { interface Theme {} }",
    );
    expect(declaration.id.type).toBe(AST_NODE_TYPES.Literal);
    expect((declaration.id as TSESTree.StringLiteral).value).toBe(
      '@mui/material/styles',
    );
    expect(declaration.global).toBeUndefined();
  });

  it('spells a plain namespace with an Identifier id and no `global` flag', () => {
    const declaration = moduleDeclarationOf(
      'declare namespace Internal { interface Helper {} }',
    );
    expect(declaration.id.type).toBe(AST_NODE_TYPES.Identifier);
    expect(declaration.global).toBeUndefined();
  });
});

/**
 * Issue #1850: the decline keys off the interface's PARENT being an
 * `ExportDefaultDeclaration`, and on the fact that `export default` sits
 * outside the interface's own range. Both are parser-spelling facts, so they
 * are pinned here: a parser bump that moved either would otherwise silently
 * re-enable the fix that writes `export default type X = …` to disk.
 */
describe('prefer-type-over-interface default-export AST shape', () => {
  const interfaceOf = (code: string) => {
    const program = parse(code, PARSE_OPTIONS) as unknown as TSESTree.Program;
    const [statement] = program.body;
    return statement as TSESTree.ExportDefaultDeclaration;
  };

  it('parents the interface on an ExportDefaultDeclaration', () => {
    const statement = interfaceOf(
      'export default interface Opts { a?: string }',
    );
    expect(statement.type).toBe(AST_NODE_TYPES.ExportDefaultDeclaration);
    expect(statement.declaration.type).toBe(
      AST_NODE_TYPES.TSInterfaceDeclaration,
    );
  });

  it('starts the interface range after `export default`, where the swap lands', () => {
    const code = 'export default interface Opts { a?: string }';
    const statement = interfaceOf(code);
    const declaration =
      statement.declaration as TSESTree.TSInterfaceDeclaration;
    expect(code.slice(declaration.range[0], declaration.range[0] + 9)).toBe(
      'interface',
    );
    // The text the keyword swap would leave in front of `type`, spelled out.
    expect(code.slice(0, declaration.range[0])).toBe('export default ');
  });

  // A named export keeps the keyword inside the statement's own range, which is
  // why that arm converts cleanly and must stay fixable.
  it('keeps `export interface` reachable by the same swap', () => {
    const code = 'export interface Opts { a?: string }';
    const program = parse(code, PARSE_OPTIONS) as unknown as TSESTree.Program;
    const statement = program.body[0] as TSESTree.ExportNamedDeclaration;
    expect(statement.type).toBe(AST_NODE_TYPES.ExportNamedDeclaration);
    expect(statement.declaration?.type).toBe(
      AST_NODE_TYPES.TSInterfaceDeclaration,
    );
  });
});

ruleTesterTs.run('prefer-type-over-interface', preferTypeOverInterface, {
  valid: [
    'type SomeType = { field: string; };',
    'type AnotherType = SomeType & { otherField: number; };',
    'type GenericType<T> = { value: T; };',
    'type ConstrainedType<T extends string> = { value: T; };',
    // Issue #1549: an interface inside a module augmentation exists to merge
    // with a declaration owned by another file. A type alias cannot merge, so
    // the rewrite drops the augmentation and collides with the original
    // (TS2300), which makes the report unactionable rather than stylistic.
    `export {};
declare global {
  interface Window {
    blumintFlag: string;
  }
}`,
    `declare module '@mui/material/styles' {
  interface Theme {
    border: string;
  }
}`,
    // Double quotes and no `declare` prefix are the same augmentation shape.
    `module "@mui/material/styles" {
  interface Theme {
    border: string;
  }
}`,
    // Every interface in an augmentation is exempt, not just the first.
    `declare module '@mui/material/styles' {
  interface Theme {
    border: string;
  }
  interface ThemeOptions {
    border?: string;
  }
  interface Palette {
    dynamic: string;
  }
}`,
    // The interface need not be a direct child of the augmentation block.
    `declare module '@mui/material/styles' {
  namespace Nested {
    interface Deep {
      id: string;
    }
  }
}`,
    `export {};
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      BLUMINT_ENV: string;
    }
  }
}`,
    // Empty body plus a heritage clause is the canonical MUI merge idiom.
    `declare module '@mui/material/styles' {
  interface Palette extends PaletteDynamic {}
}`,
    // The bare `global` block inside an ambient module carries the `global`
    // flag without a `declare` of its own.
    `declare module 'some-pkg' {
  global {
    interface Window {
      blumintFlag: string;
    }
  }
}`,
    // Issue #1583: two interfaces of the same name in one scope are a single
    // merged type. Rewriting either half emits two declarations of the same
    // name (TS2300) and splits the shape, so `limit` and `orderBy` stop
    // coexisting. Merging is the one thing `type` cannot express, which makes
    // the report unactionable rather than stylistic.
    `interface QueryLike {
  limit: (count: number) => void;
}
interface QueryLike {
  orderBy: (field: string) => void;
}
export const q: QueryLike = null as any;`,
    // The exemption is not pairwise: every member of a three-way merge is
    // exempt, including the middle one.
    `interface Chain {
  first: string;
}
interface Chain {
  second: string;
}
interface Chain {
  third: string;
}
export const chain: Chain = null as any;`,
    // Exported halves merge exactly the same way.
    `export interface Options {
  retries: number;
}
export interface Options {
  timeout: number;
}`,
    // An interface merges into a class declaration too, and `class A` already
    // owns the type-space slot a `type A` would claim.
    `class Widget {
  id = '';
}
interface Widget {
  label: string;
}
export const widget: Widget = null as any;`,
    // A plain namespace declares its own scope, so a merge inside it is a
    // merge in that scope even though the block augments nothing.
    `namespace Internal {
  interface Helper {
    a: string;
  }
  interface Helper {
    b: string;
  }
}`,
    // A same-named *value* occupies a different declaration space, so this one
    // would in fact survive the rewrite. It is exempted anyway: the check asks
    // whether the name carries more than one declaration rather than modelling
    // TypeScript's merging table, and the resulting miss is a false negative,
    // which this rule prefers to a build-breaking fix.
    `function Adapter() {}
interface Adapter {
  id: string;
}`,
    // Issue #1850: a default export that is not an interface is none of this
    // rule's business, and must stay untouched by the decline added for the
    // interface form.
    'export default class Widget { id = ""; }',
    'export default function build() {}',
    'export default { a: 1 };',
    `type Opts = { a?: string };
export type { Opts as default };`,
    // A default-exported interface inside an augmentation stays silent: the
    // augmentation guard runs first, so the decline does not become the reason
    // this is skipped.
    `declare module 'pkg' {
  export default interface Opts {
    a?: string;
  }
}`,
    // Merging inside `declare global` is doubly exempt: the augmentation guard
    // already covers it, and this pins that the merge case does not somehow
    // re-enable the rewrite there.
    `export {};
declare global {
  interface Window {
    blumintFlag: string;
  }
  interface Window {
    blumintTheme: string;
  }
}`,
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
    // Issue #1549 counter-cases: the augmentation exemption must stay narrow.
    // A plain top-level interface merges with nothing, so it still reports.
    {
      code: 'interface User { id: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'User' },
        },
      ],
      output: asParseable('type User = { id: string; }'),
    },
    // A plain namespace augments nothing — it declares its own scope — so a
    // type alias is a working replacement and the report stands.
    {
      code: 'namespace Internal { interface Helper { id: string } }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Helper' },
        },
      ],
      output: asParseable(
        'namespace Internal { type Helper = { id: string } }',
      ),
    },
    // `declare namespace Internal` reports for the same reason: `declare` only
    // marks the body as ambient (no emit), it does not target another module.
    // The id is an Identifier, not a string module specifier, so the block
    // declares the `Internal` namespace rather than augmenting one somebody
    // else owns, and merging is not what the interface is there for.
    {
      code: 'declare namespace Internal { interface Helper { id: string } }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Helper' },
        },
      ],
      output: asParseable(
        'declare namespace Internal { type Helper = { id: string } }',
      ),
    },
    // `declare module Foo` (identifier id) is the legacy spelling of
    // `declare namespace Foo`, not an external-module augmentation.
    {
      code: 'declare module Foo { interface Helper { id: string } }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Helper' },
        },
      ],
      output: asParseable(
        'declare module Foo { type Helper = { id: string } }',
      ),
    },
    // A namespace merely *named* `global` is not the global augmentation
    // block: it lacks both the `global` flag and `declare`.
    {
      code: 'namespace global { interface Helper { id: string } }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'Helper' },
        },
      ],
      output: asParseable('namespace global { type Helper = { id: string } }'),
    },
    // The exemption is scoped to the block: a sibling interface outside the
    // augmentation still reports, and the augmented one is left alone.
    {
      code: `declare module '@mui/material/styles' {
  interface Theme { border: string }
}
interface LocalOnly { id: string }`,
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'LocalOnly' },
        },
      ],
      output: asParseable(`declare module '@mui/material/styles' {
  interface Theme { border: string }
}
type LocalOnly = { id: string }`),
    },
    // Issue #1583 counter-cases: merging is a property of the declaration
    // space, so the exemption keys on the declaring scope and not on a count
    // of the name across the file. Two same-named interfaces in different
    // function bodies are distinct types that never merge, and each converts
    // cleanly.
    {
      code: `function one() {
  interface Config { a: string }
  return null as unknown as Config;
}
function two() {
  interface Config { b: string }
  return null as unknown as Config;
}`,
      errors: [
        { messageId: 'preferType', data: { interfaceName: 'Config' } },
        { messageId: 'preferType', data: { interfaceName: 'Config' } },
      ],
      output: asParseable(`function one() {
  type Config = { a: string }
  return null as unknown as Config;
}
function two() {
  type Config = { b: string }
  return null as unknown as Config;
}`),
    },
    // The same for two sibling block statements.
    {
      code: `{
  interface Local { a: string }
}
{
  interface Local { b: string }
}`,
      errors: [
        { messageId: 'preferType', data: { interfaceName: 'Local' } },
        { messageId: 'preferType', data: { interfaceName: 'Local' } },
      ],
      output: asParseable(`{
  type Local = { a: string }
}
{
  type Local = { b: string }
}`),
    },
    // ...and for two sibling namespaces, whose bodies are separate scopes.
    {
      code: `namespace First { interface Shared { a: string } }
namespace Second { interface Shared { b: string } }`,
      errors: [
        { messageId: 'preferType', data: { interfaceName: 'Shared' } },
        { messageId: 'preferType', data: { interfaceName: 'Shared' } },
      ],
      output: asParseable(`namespace First { type Shared = { a: string } }
namespace Second { type Shared = { b: string } }`),
    },
    // The exemption is per-name: an unmerged interface sharing a file with a
    // merged pair still reports, and the merged pair is left intact.
    {
      code: `interface Merged { a: string }
interface Merged { b: string }
interface Solo { c: string }`,
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Solo' } }],
      output: asParseable(`interface Merged { a: string }
interface Merged { b: string }
type Solo = { c: string }`),
    },
    // A co-declaration under a *different* name exempts nothing: the check is
    // per-name, not "this scope contains more than one declaration".
    {
      code: `function handler() {}
interface Standalone { id: string }`,
      errors: [
        { messageId: 'preferType', data: { interfaceName: 'Standalone' } },
      ],
      output: asParseable(`function handler() {}
type Standalone = { id: string }`),
    },
    // Issue #1850: a default-exported interface still reports — the conversion
    // is available to the author — but carries NO fix, because there is no
    // position for the keyword swap to land in. `output: null` is the whole
    // assertion here: omitting `output` asserts nothing at all, and the fix
    // this replaces produced `export default type Opts = ...`, which does not
    // parse.
    {
      code: 'export default interface Opts { a?: string }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Opts' },
        },
      ],
      output: null,
    },
    // Type parameters: the header anchor the fix would use is irrelevant when
    // the whole declaration position is wrong.
    {
      code: 'export default interface Box<T> { v: T }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Box' },
        },
      ],
      output: null,
    },
    {
      code: 'export default interface Lookup<T extends keyof U, U> { key: T; source: U; }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Lookup' },
        },
      ],
      output: null,
    },
    // A heritage clause is the one part of the rewrite that would otherwise
    // have produced valid-looking text, so it gets its own case.
    {
      code: 'export default interface Opts extends Base { a?: string }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Opts' },
        },
      ],
      output: null,
    },
    {
      code: 'export default interface Opts extends Base, Other { a?: string }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Opts' },
        },
      ],
      output: null,
    },
    // Empty body
    {
      code: 'export default interface Empty {}',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Empty' },
        },
      ],
      output: null,
    },
    // Multi-line body
    {
      code: `export default interface Options {
  retries: number;
  timeout?: number;
  onDone(): void;
}`,
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Options' },
        },
      ],
      output: null,
    },
    // A header comment would already have declined the fix. The messageId still
    // has to be the default-export one, or the developer is handed the
    // "move the comment" remedy for a declaration that stays unfixable after
    // they move it.
    {
      code: 'export default interface Opts /* keep */ extends Base { a?: string }',
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Opts' },
        },
      ],
      output: null,
    },
    // NEGATIVE CONTROL for the narrowing, in one file: the default-exported
    // interface keeps its (unfixable) report while its plain sibling is still
    // rewritten. A decline that leaked one node wider would leave `Local`
    // alone too, and a suite of `output: null` cases alone could not tell.
    {
      code: `export default interface Opts { a?: string }
interface Local { b: string }`,
      errors: [
        {
          messageId: 'preferTypeDefaultExport',
          data: { interfaceName: 'Opts' },
        },
        { messageId: 'preferType', data: { interfaceName: 'Local' } },
      ],
      output: asParseable(`export default interface Opts { a?: string }
type Local = { b: string }`),
    },
    // NEGATIVE CONTROLS: every other export form still reports AND still
    // autofixes. These are the arms the decline must not reach.
    {
      code: 'export interface Opts { a?: string }',
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Opts' } }],
      output: asParseable('export type Opts = { a?: string }'),
    },
    {
      code: 'interface Opts { a?: string }',
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Opts' } }],
      output: asParseable('type Opts = { a?: string }'),
    },
    // `declare` marks the declaration ambient and is dropped by the rewrite,
    // which changes nothing: an interface and a type alias are both type-only
    // and emit nothing either way.
    {
      code: 'declare interface Opts { a?: string }',
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Opts' } }],
      output: asParseable('type Opts = { a?: string }'),
    },
    // An interface declared then default-exported by NAME is not a
    // default-exported interface: the keyword sits in its own statement, the
    // swap lands where it always did, and `export default Opts` keeps
    // referring to the alias.
    {
      code: `interface Opts { a?: string }
export default Opts;`,
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Opts' } }],
      output: asParseable(`type Opts = { a?: string }
export default Opts;`),
    },
    // A namespaced interface is fixable as before; `export default` is the
    // only export form that moves the keyword out of reach.
    {
      code: 'namespace Internal { export interface Helper { id: string } }',
      errors: [{ messageId: 'preferType', data: { interfaceName: 'Helper' } }],
      output: asParseable(
        'namespace Internal { export type Helper = { id: string } }',
      ),
    },
  ],
});

/**
 * Issue #1549: RuleTester applies a single fix pass, so it cannot prove the
 * declaration survives the multi-pass `eslint --fix` a developer actually
 * runs. These cases drive the real fixer to a fixpoint and assert the
 * augmentation file comes back byte-identical.
 */
describe('prefer-type-over-interface leaves module augmentations untouched under --fix', () => {
  const RULE_ID = '@blumintinc/blumint/prefer-type-over-interface';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      preferTypeOverInterface as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    makeLinter().verifyAndFix(code, CONFIG, 'declarations.d.ts').output;

  const reportCount = (code: string) =>
    makeLinter()
      .verify(code, CONFIG, 'declarations.d.ts')
      .filter((message) => message.ruleId === RULE_ID).length;

  const messageIds = (code: string) =>
    makeLinter()
      .verify(code, CONFIG, 'declarations.d.ts')
      .filter((message) => message.ruleId === RULE_ID)
      .map((message) => message.messageId);

  /**
   * The #1850 detector, scoped to this rule: lint the FIXED text and report the
   * parse failure. A fatal carries no `ruleId`, so a rule-keyed report count
   * reads corrupted output as silence — which is exactly how the broken fix
   * survived this suite.
   */
  const fatalAfterFix = (code: string) => {
    const output = fix(code);
    const fatal = makeLinter()
      .verify(output, CONFIG, 'declarations.d.ts')
      .find((message) => message.fatal);
    return fatal ? fatal.message : null;
  };

  const GLOBAL_AUGMENTATION = `export {};
declare global {
  interface Window {
    blumintFlag: string;
  }
}
`;

  const MUI_AUGMENTATION = `declare module '@mui/material/styles' {
  interface Theme {
    border: string;
  }
  interface ThemeOptions {
    border?: string;
  }
  interface Palette extends PaletteDynamic {}
}
`;

  // Without a control the byte-identical assertions below would also pass if
  // the linter were misconfigured and the rule never ran at all.
  it('control: an ordinary interface is still rewritten to a type alias', () => {
    expect(reportCount('interface User { id: string }')).toBe(1);
    expect(fix('interface User { id: string }')).toBe(
      'type User = { id: string }',
    );
  });

  it('reports nothing inside `declare global`', () => {
    expect(reportCount(GLOBAL_AUGMENTATION)).toBe(0);
  });

  it('reports nothing inside an external-module augmentation', () => {
    expect(reportCount(MUI_AUGMENTATION)).toBe(0);
  });

  const MERGED_INTERFACES = `interface QueryLike {
  limit: (count: number) => void;
}
interface QueryLike {
  orderBy: (field: string) => void;
}
export const q: QueryLike = null as any;
`;

  const MERGED_THREE_WAY = `interface Chain {
  first: string;
}
interface Chain {
  second: string;
}
interface Chain {
  third: string;
}
export const chain: Chain = null as any;
`;

  const MERGED_INTO_CLASS = `class Widget {
  id = '';
}
interface Widget {
  label: string;
}
export const widget: Widget = null as any;
`;

  it.each([
    ['declare global', GLOBAL_AUGMENTATION],
    ['@mui/material/styles augmentation', MUI_AUGMENTATION],
    // Issue #1583: the fix loop is where the damage happened — each half of a
    // merge was rewritten independently into `type QueryLike = ...` twice.
    ['a two-way interface merge', MERGED_INTERFACES],
    ['a three-way interface merge', MERGED_THREE_WAY],
    ['an interface merged into a class', MERGED_INTO_CLASS],
  ])('leaves %s byte-identical and free of `type `', (_label, code) => {
    const output = fix(code);
    expect(output).toBe(code);
    expect(output).not.toContain('type ');
  });

  it.each([
    ['a two-way interface merge', MERGED_INTERFACES],
    ['a three-way interface merge', MERGED_THREE_WAY],
    ['an interface merged into a class', MERGED_INTO_CLASS],
  ])('reports nothing for %s', (_label, code) => {
    expect(reportCount(code)).toBe(0);
  });

  // Same-named interfaces in sibling scopes never merge, so the exemption must
  // not reach them. Without this the fix above could be "no reports anywhere".
  /**
   * Issue #1850. `RuleTester` applies a single pass and asserts the fix that
   * did not arrive; this drives the loop a developer actually runs and asserts
   * what landed on disk still parses. The detector is deliberately the parse of
   * the OUTPUT rather than the byte comparison alone, because a future fixer
   * for this shape may legitimately rewrite the text — what it may never do is
   * emit source TypeScript cannot read.
   */
  const DEFAULT_EXPORTED = `export default interface Opts {
  a?: string;
}
`;

  const DEFAULT_EXPORTED_GENERIC = `export default interface Box<T> extends Base<T> {
  value: T;
}
`;

  it.each([
    ['a default-exported interface', DEFAULT_EXPORTED],
    [
      'a generic default-exported interface with heritage',
      DEFAULT_EXPORTED_GENERIC,
    ],
    [
      'an empty default-exported interface',
      'export default interface Empty {}\n',
    ],
  ])('leaves %s byte-identical and parsable under --fix', (_label, code) => {
    expect(fatalAfterFix(code)).toBeNull();
    expect(fix(code)).toBe(code);
  });

  it('reports the default-exported interface rather than falling silent', () => {
    expect(messageIds(DEFAULT_EXPORTED)).toEqual(['preferTypeDefaultExport']);
    expect(messageIds(DEFAULT_EXPORTED_GENERIC)).toEqual([
      'preferTypeDefaultExport',
    ]);
  });

  // The control that makes the assertion above non-vacuous: `fatalAfterFix` has
  // to be able to see corruption. It is fed the exact text the old fixer wrote,
  // which is what `--fix` left on disk before this decline.
  it('control: the text the old fixer emitted is detected as unparsable', () => {
    expect(
      fatalAfterFix('export default type Opts = { a?: string }\n'),
    ).toMatch(/Parsing error/);
  });

  it('still rewrites same-named interfaces in sibling function scopes', () => {
    const code = `function one() {
  interface Config { a: string }
  return null as unknown as Config;
}
function two() {
  interface Config { b: string }
  return null as unknown as Config;
}
`;
    expect(reportCount(code)).toBe(2);
    expect(fix(code)).toBe(`function one() {
  type Config = { a: string }
  return null as unknown as Config;
}
function two() {
  type Config = { b: string }
  return null as unknown as Config;
}
`);
  });
});
