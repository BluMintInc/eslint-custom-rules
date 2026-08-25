import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import * as ts from 'typescript';
import * as prettier from 'prettier';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { noRedundantAnnotationAssertion } from '../rules/no-redundant-annotation-assertion';

ruleTesterTs.run(
  'no-redundant-annotation-assertion',
  noRedundantAnnotationAssertion,
  {
    valid: [
      `
type ResultSummary = { id: string };
type DocumentReference<T> = { doc(id: string): DocumentReference<T> };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';
const docRef = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;
      `,
      `
type ResultSummary = { id: string };
type DocumentReference<T> = { doc(id: string): DocumentReference<T> };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';
const docRef: DocumentReference<ResultSummary> =
  resultSummaryCollectionRef.doc(teamId);
      `,
      `
type ResultSummary = { id: string };
type DocumentReference<T> = { doc(id: string): DocumentReference<T> };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';
const docRef: any =
  resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;
      `,
      `
type Wrapper = { data: string };
const { data }: { data: string } = { data: 'hello' } as { data: string };
      `,
      `
type User = { id: string };
declare function fetchUser(): User;
function getUser(): User {
  if (Math.random() > 0.5) {
    return fetchUser() as User;
  }
  return fetchUser();
}
      `,
      `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User | null => (Math.random() > 0.5 ? fetchUser() : null);
      `,
      `
type Entry = { id: string };
declare const value: Entry;
const wrapped = value as Entry;
      `,
      `
type Box<T> = { value: T };
declare function createBox(): Box<string> | undefined;
const box: Box<string | undefined> = createBox();
      `,
      `
type Foo = { id: string };
declare function createFoo(): Foo | null;
const foo: Foo | null = (createFoo() as Foo | null)!;
      `,
      `
class Store {
  value: number;
  constructor(initial: number) {
    this.value = initial as number;
  }
}
      `,
      `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => fetchUser() as User;
      `,
      `
type User = { id: string };
declare function fetchUser(): Promise<User>;
  const getUser = async (): Promise<User> => (await fetchUser()) as User;
      `,
      `
type User = { id: string };
declare function fetchUser(): User;
declare function fallback(): User;
function getUser(): User {
  if (Math.random() > 0.5) {
    return fetchUser() as User;
  }

  if (Math.random() > 0.25) {
    return fallback() as User;
  }

  return fallback() as User;
}
      `,
      `let x: string = "hello" as "hello";`,
      `let x: number = 1 as 1;`,
      `let x: boolean = true as true;`,
      `
type UserRef = { id: string };
declare function read(): UserRef | undefined;
class Repo {
  ref?: UserRef = read() as UserRef;
}
      `,
      `
type UserRef = { id: string };
declare function read(): UserRef | undefined;
class Repo {
  ref? : UserRef = read() as UserRef;
}
      `,
      `
type User = { id: string };
declare function fetchUser(): User;
function getUser(): User {
  if (Math.random() > 0.5) {
    return fetchUser() as User;
  }
}
      `,
      `let x: string = getValue() as "hello";`,
      `
class Foo {
  bar!: string;
  constructor() {
    this.bar = "hello" as string;
  }
}
      `,
      `
class Foo {
  // This is a syntax error in TS but we should still skip it if the parser allows it
  bar!: string = "hello" as string;
}
      `,
      `let x!: string = "hello" as string;`,
      // A function reached from its own return expression is typed by its
      // annotation and nothing else. The equality that proves the annotation
      // redundant only holds while the annotation is there, so removing it does
      // not simplify the code — it makes the return type circular. Measured on
      // the output of each of the following: TS7023/TS7024, or a silent widening
      // of a member to `any` where the assertion breaks the cycle.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => { return buildQuery(); } };
}
      `,
      `
interface FakeQuery { readonly orderBy: () => FakeQuery; }
export function buildQuery(): FakeQuery {
  return { orderBy: () => { return buildQuery(); } } as const;
}
      `,
      `
export function loop(): number {
  return <number>loop();
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const buildQuery = (): FakeQuery => {
  return <FakeQuery>{ orderBy: () => buildQuery() };
};
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const buildQuery = (): FakeQuery => <FakeQuery>{ orderBy: () => buildQuery() };
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const buildQuery = function (): FakeQuery {
  return <FakeQuery>{ orderBy: () => buildQuery() };
};
      `,
      // A function expression reached through its own name rather than the
      // variable it is assigned to.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const query = function build(): FakeQuery {
  return <FakeQuery>{ orderBy: () => build() };
};
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export class Repo {
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => this.build() };
  }
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export class Repo {
  build = (): FakeQuery => {
    return <FakeQuery>{ orderBy: () => this.build() };
  };
}
      `,
      // Reading `obj.build` yields a clone of the symbol the property declares,
      // so the self-reference is recognised by declaration rather than by symbol
      // identity.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const obj = {
  build: function (): FakeQuery {
    return <FakeQuery>{ orderBy: () => obj.build() };
  },
};
      `,
      `
interface FakeQuery { buildQuery: () => FakeQuery; }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ buildQuery };
}
      `,
      // `typeof f` is the one type-position spelling that reads a VALUE, and it
      // resolves through the function's own return type — so unlike a plain type
      // reference it does close the cycle, and the annotation stays.
      `
export function f(): typeof f {
  return <typeof f>f;
}
      `,
      // Mutually recursive functions each type fine while the other keeps its
      // annotation, and go circular only because this rule ships every removal
      // in one batch.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export function first(): FakeQuery {
  return <FakeQuery>{ orderBy: () => second() };
}
export function second(): FakeQuery {
  return <FakeQuery>{ orderBy: () => first() };
}
      `,
      // A cycle closes through whatever lies on it, and what lies on it is
      // usually not a candidate: an unannotated helper has no annotation to
      // remove, so a relation drawn candidate-to-candidate never sees it.
      // Measured on the output of each of the following (#1886): TS7023 on
      // every unannotated link, or a silent widening to `any`.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
function helper() { return buildQuery(); }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
const helper = () => buildQuery();
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
      `,
      // The `as const` spelling of the same reach. Measured: TS6196 plus a
      // return type of `{ readonly orderBy: () => any }`.
      `
interface FakeQuery { readonly orderBy: () => FakeQuery; }
function helper() { return buildQuery(); }
export function buildQuery(): FakeQuery {
  return { orderBy: () => helper() } as const;
}
      `,
      // Three links, so a fixpoint over one-hop edges cannot reach it either.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
function helper() { return buildQuery(); }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => alpha() };
}
export function alpha(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export class Builder {
  helper() { return this.build(); }
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => this.helper() };
  }
}
      `,
      // A value binding relays the dependency just as a function does: the
      // object holding the callback has no return type of its own to annotate.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
const cache = { get: () => build() };
export function build(): FakeQuery {
  return <FakeQuery>{ orderBy: () => cache.get() };
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export class Repo {
  cache = { get: () => this.build() };
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => this.cache.get() };
  }
}
      `,
      // A local binding on the way to the return. Measured: TS7022 on `x`
      // alongside TS7023 on both functions.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
function helper() { const x = buildQuery(); return x; }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
const alias = buildQuery;
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => alias() };
}
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
const defaults = { orderBy: () => build() };
export function build(): FakeQuery {
  return <FakeQuery>{ ...defaults };
}
      `,
      // A property read spells its name as a string under bracket access, and
      // resolves to the same symbol the dotted spelling does.
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const obj = {
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => obj['build']() };
  },
};
      `,
      `
interface FakeQuery { orderBy: () => FakeQuery; }
export const obj = {
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => obj[\`build\`]() };
  },
};
      `,
      // An `as const` assertion produces readonly members, so it never restates
      // a mutable annotation. Dropping the annotation here changes the value's
      // type rather than deduplicating it.
      `
export type FakeQuery = { orderBy: () => void };
export function build(): FakeQuery {
  return { orderBy: () => {} } as const;
}
      `,
      `
export const conf: { run: () => void } = { run: () => {} } as const;
export function mutate() { conf.run = () => {}; }
      `,
      `
export class Holder {
  cfg: { run: () => void } = { run: () => {} } as const;
}
      `,
      `
export const build = (): { orderBy: () => void } => {
  return { orderBy: () => {} } as const;
};
      `,
      `
export class Query {
  build(): { orderBy: () => void } {
    return { orderBy: () => {} } as const;
  }
}
      `,
      // Readonly-ness written out rather than synthesized, on the assertion side.
      `
type Mutable = { x: number };
type Frozen = { readonly x: number };
declare const frozen: Frozen;
export const value: Mutable = frozen as Frozen;
      `,
      // #1887: an index signature carries readonly-ness too, and readonly-ness
      // does not affect an index signature's bidirectional assignability — so
      // without it in the key these match and removing the annotation ships
      // TS2542, "only permits reading".
      `
export const m: { [k: string]: number } = { a: 1 } as { readonly [k: string]: number };
      `,
      `
export const nums: { [i: number]: string } = { 0: 'a' } as { readonly [i: number]: string };
      `,
      `
type Dict = { [k: string]: number };
export const d: { [k: string]: number } = { a: 1 } as Readonly<Dict>;
      `,
      // A getter with no setter is readonly by SHAPE — it carries neither the
      // readonly modifier nor the readonly check flag — so it would otherwise
      // format identically to a mutable property and removing the annotation
      // ships TS2540.
      `
type Getter = { get x(): number };
declare const g: Getter;
export const v: { x: number } = g as Getter;
      `,
      // #1888: a computed key whose key is a literal names exactly the member a
      // bracketed read resolves to. Refusing it left the candidate with NO
      // owner, so not even a DIRECT self-reference could be found.
      `
interface Q { orderBy: () => Q; }
export const obj = {
  ['build'](): Q { return <Q>{ orderBy: () => obj['build']() }; },
};
      `,
      `
interface Q { orderBy: () => Q; }
export class Builder {
  helper() { return this['build'](); }
  ['build'](): Q { return <Q>{ orderBy: () => this.helper() }; }
}
      `,
      // A binding introduced by a pattern relays a dependency exactly as a plain
      // one does; it was not a graph node at all.
      `
interface Q { orderBy: () => Q; }
const { run } = { run: () => build() };
export function build(): Q { return <Q>{ orderBy: () => run() }; }
      `,
      `
interface Q { orderBy: () => Q; }
const [run] = [() => build()];
export function build(): Q { return <Q>{ orderBy: () => run() }; }
      `,
      `
interface Q { orderBy: () => Q; }
const { run: go } = { run: () => build() };
export function build(): Q { return <Q>{ orderBy: () => go() }; }
      `,
      // A parameter default is the parameter spelling of a body \`const\`, and
      // nothing visited parameters.
      `
interface Q { orderBy: () => Q; }
function helper(seed = build()) { return seed; }
export function build(): Q { return <Q>{ orderBy: () => helper() }; }
      `,
      // A written-down type normally breaks the cycle — unless the annotation
      // itself reads the candidate through \`typeof\`, which is the one spelling
      // that makes an annotated node keep needing inference.
      `
interface Q { orderBy: () => Q; }
type RT<T> = T extends (...a: any[]) => infer R ? R : never;
function helper(): RT<typeof build> { return build(); }
export function build(): Q { return <Q>{ orderBy: () => helper() }; }
      `,
      `
interface Q { orderBy: () => Q; }
type RT<T> = T extends (...a: any[]) => infer R ? R : never;
const helper: () => RT<typeof build> = () => build();
export function build(): Q { return <Q>{ orderBy: () => helper() }; }
      `,
    ],
    invalid: [
      {
        code: `
type ResultSummary = { id: string };
type DocumentReference<T> = { id: string; payload?: T };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';
const docRef: DocumentReference<ResultSummary> =
  resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type ResultSummary = { id: string };
type DocumentReference<T> = { id: string; payload?: T };
declare const resultSummaryCollectionRef: {
  doc(id: string): DocumentReference<ResultSummary>;
};
const teamId = 'abc';
const docRef =
  resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;
        `,
      },
      {
        code: `
type User = { id: string };
declare function fetchUser(): User;
function getUser(): User {
  return fetchUser() as User;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
function getUser() {
  return fetchUser() as User;
}
        `,
      },
      {
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User => fetchUser() as User;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => fetchUser() as User;
        `,
      },
      {
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User => {
  return fetchUser() as User;
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => {
  return fetchUser() as User;
};
        `,
      },
      {
        code: `
type User = { id: string };
declare function fetchUser(): User;
class UserStore {
  getUser(): User {
    return fetchUser() as User;
  }
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
class UserStore {
  getUser() {
    return fetchUser() as User;
  }
}
        `,
      },
      {
        code: `
type User = { id: string };
declare function createUser(): User;
const value: User = (<User>createUser());
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function createUser(): User;
const value = (<User>createUser());
        `,
      },
      {
        code: `
type Left = { id: string };
type Right = { name: string };
type Combined = Left & Right;
declare function build(): Combined;
const result: Combined = build() as Combined;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type Left = { id: string };
type Right = { name: string };
type Combined = Left & Right;
declare function build(): Combined;
const result = build() as Combined;
        `,
      },
      {
        code: `
type Shape = { kind: 'circle' } | { kind: 'square' };
declare function makeShape(): Shape;
const shape: Shape = makeShape() as Shape;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type Shape = { kind: 'circle' } | { kind: 'square' };
declare function makeShape(): Shape;
const shape = makeShape() as Shape;
        `,
      },
      {
        code: `
type MyComplexType = { id: string } & { name: string };
declare function build(): MyComplexType;
const myVar: MyComplexType = build() as MyComplexType;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type MyComplexType = { id: string } & { name: string };
declare function build(): MyComplexType;
const myVar = build() as MyComplexType;
        `,
      },
      {
        code: `
type Ref<T> = { value: T };
declare function buildRef(): Ref<string>;
const ref: Ref<string> = buildRef() as { value: string };
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type Ref<T> = { value: T };
declare function buildRef(): Ref<string>;
const ref = buildRef() as { value: string };
        `,
      },
      {
        code: `
type UserRef = { id: string };
declare function read(): UserRef;
class Repo {
  ref: UserRef = read() as UserRef;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type UserRef = { id: string };
declare function read(): UserRef;
class Repo {
  ref = read() as UserRef;
}
        `,
      },
      {
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User => (fetchUser() as User);
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => (fetchUser() as User);
        `,
      },
      {
        code: `
const handler = function process(value: number): number {
  return (value + 1) as number;
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
const handler = function process(value: number) {
  return (value + 1) as number;
};
        `,
      },
      {
        code: `
type Payload = { id: string; name: string };
type Alias = Payload;
type Exported = Alias;
declare function load(): Payload;
const result: Exported = load() as Alias;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // `Exported` is named nowhere else, so stripping the annotation would
        // leave the alias declaration unreferenced. The report stands without a
        // fix rather than trading itself for a `no-unused-vars` violation.
        output: null,
      },
      {
        code: `
namespace NS { export type T = string; }
import T = NS.T;
const x: T = "a" as T;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
namespace NS { export type T = string; }
import T = NS.T;
const x = "a" as T;
        `,
      },
      {
        code: `
type A = { x: number };
type B = { x: number };
const val: A = { x: 1 } as B;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // The annotation holds the only reference to `A`, so the fix is
        // declined: `B` keeps the assertion alive but nothing would keep `A`.
        output: null,
      },
      {
        code: `
type FormattedPart = { readonly year: number; readonly month: number };
declare function parsePart(name: string): number;
function parseFormattedParts() {
  const result: FormattedPart = {
    year: parsePart('year'),
    month: parsePart('month'),
  } as const;
  return result;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // The shape reported from production: a locally declared alias consumed
        // by exactly one annotation. Stripping it strands the declaration, so
        // the rule reports and leaves the source alone.
        output: null,
      },
      {
        code: `
interface Wrapper { id: string }
type Payload = { id: string };
declare function load(): Payload;
const result: Wrapper = load() as Payload;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // An interface declaration is orphaned the same way an alias is.
        output: null,
      },
      {
        code: `
export type Alias = { id: string };
type Payload = { id: string };
declare function load(): Payload;
const result: Alias = load() as Payload;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // An exported declaration has consumers no edit to this file can reach,
        // so losing its last local reference orphans nothing.
        output: `
export type Alias = { id: string };
type Payload = { id: string };
declare function load(): Payload;
const result = load() as Payload;
        `,
      },
      {
        code: `
type Payload = { id: string };
type Alias = { id: string };
declare function load(): Alias;
declare function store(value: Payload): void;
const result: Payload = load() as Alias;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // The common case: `Payload` is named elsewhere, so the annotation goes
        // and the declaration stays. Autofix must survive here.
        output: `
type Payload = { id: string };
type Alias = { id: string };
declare function load(): Alias;
declare function store(value: Payload): void;
const result = load() as Alias;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
const user: User = raw as Person;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // An import the annotation solely consumed is unbound by the same fix,
        // so neither half can ship without the other.
        output: `
import { Person } from './person';
declare const raw: Person;
const user = raw as Person;
        `,
      },
      {
        code: `
import { Person, User } from './types';
declare const raw: Person;
const user: User = raw as Person;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // Only the orphaned specifier and its separator go; the sibling binding
        // and its declaration are untouched.
        output: `
import { Person } from './types';
declare const raw: Person;
const user = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
const first: User = raw as Person;
const second: User = raw as Person;
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        // The control for the suppressed case below: with nothing suppressed
        // both annotations report and both are removed, so nothing names `User`
        // afterwards and its import goes with them. Neither removal orphans it
        // alone — only their union does, which is why the batch is planned as
        // one edit rather than a removal at a time.
        output: `
import { Person } from './person';
declare const raw: Person;
const first = raw as Person;
const second = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
// eslint-disable-next-line no-redundant-annotation-assertion
const first: User = raw as Person;
const second: User = raw as Person;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // Suppression is applied to reports after a rule emits them, so a fix
        // that counted on its suppressed sibling's removal would unbind an
        // import `first` still names. The import survives.
        output: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
// eslint-disable-next-line no-redundant-annotation-assertion
const first: User = raw as Person;
const second = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
const first: User = raw as Person;
// eslint-disable-next-line no-redundant-annotation-assertion
const second: User = raw as Person;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        // The carrier slot falls to a surviving site wherever the suppressed one
        // sits: here the batch is `first` alone, and `second` keeps naming
        // `User`, so the import stays.
        output: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
const first = raw as Person;
// eslint-disable-next-line no-redundant-annotation-assertion
const second: User = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
declare const raw: Person;
const first: User = raw as Person;
const second: User = raw as Person;
const third: User = raw as Person;
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        // The batch is not limited to a pair; the import goes once nothing in
        // the file names it.
        output: `
import { Person } from './person';
declare const raw: Person;
const first = raw as Person;
const second = raw as Person;
const third = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Admin } from './admin';
import { Person } from './person';
declare const raw: Person;
const user: User = raw as Person;
const admin: Admin = raw as Person;
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        // One fix carries every removal in the batch, so two distinct orphaned
        // imports go in the same pass.
        output: `
import { Person } from './person';
declare const raw: Person;
const user = raw as Person;
const admin = raw as Person;
        `,
      },
      {
        code: `
import { User } from './types';
import { Person } from './person';
interface Wrapper { id: string }
type Payload = { id: string };
declare function load(): Payload;
declare const raw: Person;
const wrapped: Wrapper = load() as Payload;
const shared: User = raw as Person;
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        // A site the helper cannot plan must not veto the batch. `Wrapper` is an
        // interface this rule declines to delete, so that annotation stays put
        // while the imported `User` is still unbound alongside its annotation.
        output: `
import { Person } from './person';
interface Wrapper { id: string }
type Payload = { id: string };
declare function load(): Payload;
declare const raw: Person;
const wrapped: Wrapper = load() as Payload;
const shared = raw as Person;
        `,
      },
      {
        code: `
interface Wrapper { id: string }
type Payload = { id: string };
declare function load(): Payload;
const first: Wrapper = load() as Payload;
const second: Wrapper = load() as Payload;
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        // Neither removal orphans `Wrapper` alone, but together they do, and a
        // declaration is not this rule's to delete. Judging the union declines
        // the whole batch rather than stranding the interface.
        output: null,
      },
      {
        // The circularity carve-out costs nothing on a plain return annotation:
        // the function reaches nothing from its own return expression.
        code: `
export type User = { id: string };
declare function fetchUser(): User;
export function getUser(): User {
  return fetchUser() as User;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type User = { id: string };
declare function fetchUser(): User;
export function getUser() {
  return fetchUser() as User;
}
        `,
      },
      {
        // Recursion confined to a nested function says nothing about the
        // enclosing function's return type.
        code: `
export type User = { id: string };
declare function fetchUser(): User;
export function getUser(): User {
  function inner(): User { return inner(); }
  return fetchUser() as User;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type User = { id: string };
declare function fetchUser(): User;
export function getUser() {
  function inner(): User { return inner(); }
  return fetchUser() as User;
}
        `,
      },
      {
        // The returned expression subtree CONTAINS the assertion's own type
        // node, so a binding and a type sharing one name would make the
        // assertion look like a self-reference. A type annotation resolves
        // without any function's return type, so it can never close the cycle:
        // only VALUE reads count.
        name: 'a type reference sharing the function name is not a self-reference',
        code: `
export type Status = { a: number };
export const Status = (): Status => <Status>{ a: 1 };
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Status = { a: number };
export const Status = () => <Status>{ a: 1 };
        `,
      },
      {
        name: 'a merged interface name on a function declaration is not a self-reference',
        code: `
export interface Shape { a: number }
export function Shape(): Shape {
  return <Shape>{ a: 1 };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface Shape { a: number }
export function Shape() {
  return <Shape>{ a: 1 };
}
        `,
      },
      {
        // A binding that merely shares the function's name is resolved through
        // the checker, so shadowing does not read as a self-reference.
        code: `
export type Query = { orderBy: () => void };
declare function raw(): Query;
export function buildQuery(): Query {
  return (() => { const buildQuery = raw; return buildQuery(); })() as Query;
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Query = { orderBy: () => void };
declare function raw(): Query;
export function buildQuery() {
  return (() => { const buildQuery = raw; return buildQuery(); })() as Query;
}
        `,
      },
      {
        // One candidate referencing another is only circular when the reference
        // comes back. This chain does not, so both annotations still go.
        code: `
export type Q = { id: string };
export type P = { id: string };
declare function raw(): P;
export function first(): Q {
  return raw() as P;
}
export function second(): Q {
  return first() as P;
}
        `,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        output: `
export type Q = { id: string };
export type P = { id: string };
declare function raw(): P;
export function first() {
  return raw() as P;
}
export function second() {
  return first() as P;
}
        `,
      },
      {
        // Readonly-awareness is a discriminator, not a blanket exclusion: two
        // shapes that are both readonly still restate one another.
        code: `
export interface Frozen { readonly x: number }
export type AlsoFrozen = { readonly x: number };
declare const value: AlsoFrozen;
export const frozen: Frozen = value as AlsoFrozen;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface Frozen { readonly x: number }
export type AlsoFrozen = { readonly x: number };
declare const value: AlsoFrozen;
export const frozen = value as AlsoFrozen;
        `,
      },
      {
        // The same discriminator applied to index signatures: matching ones
        // still restate each other, or folding them into the key would make it
        // over-specific and silence the rule on every indexed type.
        name: 'matching mutable index signatures still report',
        code: `
export const m: { [k: string]: number } = { a: 1 } as { [k: string]: number };
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export const m = { a: 1 } as { [k: string]: number };
        `,
      },
      {
        name: 'matching readonly index signatures still report',
        code: `
export const m: { readonly [k: string]: number } = { a: 1 } as { readonly [k: string]: number };
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export const m = { a: 1 } as { readonly [k: string]: number };
        `,
      },
      {
        // The widened graph must stay keyed on WHICH declaration is reached:
        // a computed key naming a different member strands nothing.
        name: 'a computed-key candidate reading a different member still reports',
        code: `
export interface Q { orderBy: () => Q; }
declare function raw(): Q;
export const obj = {
  other: raw,
  ['build'](): Q { return <Q>{ orderBy: () => obj['other']() }; },
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface Q { orderBy: () => Q; }
declare function raw(): Q;
export const obj = {
  other: raw,
  ['build']() { return <Q>{ orderBy: () => obj['other']() }; },
};
        `,
      },
      {
        name: 'a destructured binding that does not come back still reports',
        code: `
export interface Q { orderBy: () => Q; }
declare function raw(): Q;
const { run } = { run: () => raw() };
export function build(): Q { return <Q>{ orderBy: () => run() }; }
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface Q { orderBy: () => Q; }
declare function raw(): Q;
const { run } = { run: () => raw() };
export function build() { return <Q>{ orderBy: () => run() }; }
        `,
      },
      {
        // An annotated parameter is typed without consulting its default, so it
        // breaks the chain like any other written-down type.
        name: 'an annotated parameter default still breaks the chain',
        code: `
export interface Q { orderBy: () => Q; }
function helper(seed: Q = build()) { return seed; }
export function build(): Q { return <Q>{ orderBy: () => helper() }; }
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface Q { orderBy: () => Q; }
function helper(seed: Q = build()) { return seed; }
export function build() { return <Q>{ orderBy: () => helper() }; }
        `,
      },
      {
        name: 'matching getter-only accessors still report',
        code: `
export type Getter = { get x(): number };
declare const g: Getter;
export const v: Getter = g as Getter;
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Getter = { get x(): number };
declare const g: Getter;
export const v = g as Getter;
        `,
      },
      {
        // A method whose return expression calls something else keeps reporting.
        code: `
export type Q = { id: string };
declare function raw(): Q;
export class Repo {
  build(): Q {
    return raw() as Q;
  }
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { id: string };
declare function raw(): Q;
export class Repo {
  build() {
    return raw() as Q;
  }
}
        `,
      },
      {
        // Transitive reach ends at the first type that is written down. The
        // helper's own annotation types it without consulting `buildQuery`, so
        // the loop is not one TypeScript has to resolve. Measured on the
        // output: no diagnostics, `buildQuery` still returns `FakeQuery`.
        name: 'a cycle closed through an annotated helper still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
function helper(): FakeQuery { return buildQuery(); }
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
function helper(): FakeQuery { return buildQuery(); }
export function buildQuery() {
  return <FakeQuery>{ orderBy: () => helper() };
}
        `,
      },
      {
        // The relay is a MEMBER of an object the candidate reads, and it writes
        // its own return type down. Attributing that member's body to the
        // binding merely containing it would close a loop TypeScript does not
        // have — measured on the output: no diagnostics, `buildQuery` still
        // returns `FakeQuery`. The member is already its own graph node.
        name: 'a cycle closed through an annotated object member still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const cache = { get: (): FakeQuery => buildQuery() };
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => cache.get() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const cache = { get: (): FakeQuery => buildQuery() };
export function buildQuery() {
  return <FakeQuery>{ orderBy: () => cache.get() };
}
        `,
      },
      {
        name: 'a cycle closed through an annotated object method still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const api = { run(): FakeQuery { return buildQuery(); } };
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => api.run() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const api = { run(): FakeQuery { return buildQuery(); } };
export function buildQuery() {
  return <FakeQuery>{ orderBy: () => api.run() };
}
        `,
      },
      {
        name: 'a cycle closed through an annotated array element still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const handlers = [(): FakeQuery => buildQuery()];
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => handlers[0]() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const handlers = [(): FakeQuery => buildQuery()];
export function buildQuery() {
  return <FakeQuery>{ orderBy: () => handlers[0]() };
}
        `,
      },
      {
        // A contextually typed function is not inferred from its body either,
        // so the binding's annotation breaks the loop just as a return
        // annotation does.
        name: 'a cycle closed through a contextually typed binding still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const helper: () => FakeQuery = () => buildQuery();
export function buildQuery(): FakeQuery {
  return <FakeQuery>{ orderBy: () => helper() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
const helper: () => FakeQuery = () => buildQuery();
export function buildQuery() {
  return <FakeQuery>{ orderBy: () => helper() };
}
        `,
      },
      {
        name: 'a cycle closed through an annotated class field still reports',
        code: `
export interface FakeQuery { orderBy: () => FakeQuery; }
export class Repo {
  helper: () => FakeQuery = () => this.build();
  build(): FakeQuery {
    return <FakeQuery>{ orderBy: () => this.helper() };
  }
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export interface FakeQuery { orderBy: () => FakeQuery; }
export class Repo {
  helper: () => FakeQuery = () => this.build();
  build() {
    return <FakeQuery>{ orderBy: () => this.helper() };
  }
}
        `,
      },
      {
        name: 'a cycle closed through an annotated relay binding still reports',
        code: `
export type Q = { id: string };
declare function raw(): Q;
const cache: { get: () => Q } = { get: () => build() };
export function build(): Q {
  return <Q>{ ...cache.get() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { id: string };
declare function raw(): Q;
const cache: { get: () => Q } = { get: () => build() };
export function build() {
  return <Q>{ ...cache.get() };
}
        `,
      },
      {
        // An unannotated helper on the path is not itself a reason to decline:
        // reaching one only matters when the walk comes back.
        name: 'an unannotated helper that does not come back still reports',
        code: `
export type Q = { id: string };
declare function raw(): Q;
function helper() { return raw(); }
export function build(): Q {
  return <Q>{ ...helper() };
}
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { id: string };
declare function raw(): Q;
function helper() { return raw(); }
export function build() {
  return <Q>{ ...helper() };
}
        `,
      },
      {
        // Reading one member of an object is not reading the object's every
        // member: TypeScript resolves an object literal's properties one at a
        // time, so `other` types without `build`. Measured on the output: no
        // diagnostics, `build` still returns `Q`.
        name: 'a bracket read of a different property still reports',
        code: `
export type Q = { id: string };
declare function raw(): Q;
export const obj = {
  other: raw,
  build(): Q {
    return obj['other']() as Q;
  },
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { id: string };
declare function raw(): Q;
export const obj = {
  other: raw,
  build() {
    return obj['other']() as Q;
  },
};
        `,
      },
      {
        // A string is a name only where it indexes something. Elsewhere it is
        // data, and resolving it would make any value that happens to spell a
        // member's name read as a reference to that member.
        name: 'a string literal that is data is not a property read',
        code: `
export type Q = { build: string };
export const obj = {
  build(): Q {
    return <Q>{ build: 'build' };
  },
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { build: string };
export const obj = {
  build() {
    return <Q>{ build: 'build' };
  },
};
        `,
      },
      {
        // The name a member declares is not a read of it, so walking an object
        // literal does not make the literal depend on every function inside it.
        name: 'a member name inside the returned literal is not a reference',
        code: `
export type Q = { orderBy: () => void };
declare function raw(): Q;
export const obj = {
  orderBy: () => {},
  build(): Q {
    return raw() as Q;
  },
};
        `,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
export type Q = { orderBy: () => void };
declare function raw(): Q;
export const obj = {
  orderBy: () => {},
  build() {
    return raw() as Q;
  },
};
        `,
      },
    ],
  },
);

/**
 * Issue #1969: an arrow function's return annotation sits inside the
 * `ArrowParameters [no LineTerminator here] =>` restricted production, and the
 * syntactic grammar counts a block comment carrying a line terminator AS a line
 * terminator. Deleting the annotation and leaving such a comment in the gap
 * therefore emits a hard SyntaxError (TS1200), which `@typescript-eslint/parser`
 * accepts — so the fixer has to answer for it rather than a reparse.
 *
 * Every other subject ends its signature at a body or a separator, so its
 * comments stay exactly where they were written.
 */
ruleTesterTs.run(
  'no-redundant-annotation-assertion',
  noRedundantAnnotationAssertion,
  {
    valid: [
      // A comment in the restricted gap is not itself a violation: the types
      // still have to match before anything is removed.
      `
type User = { id: string };
type Admin = { id: string; role: string };
declare function fetchAdmin(): Admin;
const getUser = () /**
 * doc
 */ : User => fetchAdmin() as Admin;
      `,
      `
type User = { id: string };
type Admin = { id: string; role: string };
declare function fetchAdmin(): Admin;
const getUser = () // doc
: User => fetchAdmin() as Admin;
      `,
      // Nothing to remove without an assertion, whatever sits in the gap.
      `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /**
 * doc
 */ : User => fetchUser();
      `,
      // Nothing to remove without an annotation either.
      `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => /**
 * doc
 */ fetchUser() as User;
      `,
      // Two returns leave the branches free to assert different types, so the
      // annotation stays and the gap is never rewritten.
      `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (flag: boolean) /**
 * doc
 */ : User => {
  if (flag) {
    return fetchUser() as User;
  }
  return fetchUser();
};
      `,
      // The assertion belongs to the inner arrow, which the outer annotation
      // does not duplicate.
      `
type User = { id: string };
declare function fetchUser(): User;
const build = () /**
 * doc
 */ : (() => User) => () => fetchUser() as User;
      `,
      `
type User = { id: string };
type Admin = { id: string; role: string };
declare function fetchAdmin(): Admin;
function getUser() /**
 * doc
 */ : User {
  return fetchAdmin() as Admin;
}
      `,
      `
type User = { id: string };
declare function fetchUsers(): User[];
const getUsers = () /**
 * doc
 */ : User[] => fetchUsers()[0] as User;
      `,
    ],
    invalid: [
      {
        name: 'a multi-line block comment ahead of an arrow annotation is carried past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /**
 * why this exists
 */ : User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  /**
   * why this exists
   */ fetchUser() as User;
`,
      },
      {
        // A single-line block comment trips no restricted production, so moving
        // it would be a regression of its own.
        name: 'a single-line block comment stays in the gap',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* doc */: User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* doc */ => fetchUser() as User;
`,
      },
      {
        // Issue #2069: a line comment ends its line without its own text
        // holding a terminator, so the body it displaces goes exactly where a
        // broken arrow body goes — one step past the declaration, which is what
        // Prettier writes.
        name: 'a line comment ahead of the annotation is carried past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () // doc
: User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  // doc
  fetchUser() as User;
`,
      },
      {
        // The shape Prettier itself writes for a line comment in the gap, so
        // this arm is reachable from formatted source.
        name: 'a line comment inside the annotation is carried to the body depth',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): // why this exists
User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  // why this exists
  fetchUser() as User;
`,
      },
      {
        name: 'a nested declaration carries its line comment to its own depth',
        code: `
type User = { id: string };
declare function fetchUser(): User;
function outer() {
  const getUser = (): // doc
  User => fetchUser() as User;
  return getUser;
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
function outer() {
  const getUser = () =>
    // doc
    fetchUser() as User;
  return getUser;
}
`,
      },
      {
        // The separator keys on the LAST comment of the run: the one-line block
        // stays in the gap and the line comment behind it still breaks.
        name: 'a run ending in a line comment breaks behind the comment that stayed',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): /* a */ // doc
User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* a */ =>
  // doc
  fetchUser() as User;
`,
      },
      {
        // Issue #2120: a line comment ahead of a block body forces the break
        // the bracketed body would otherwise avoid — it would swallow the `{` —
        // so the `{` drops to its own line one step in while the body's
        // interior and its closing brace stay at the columns they were written
        // at. Settling those three depths means re-indenting the body, which is
        // text outside the gap this planner rewrites, so the fix is withheld
        // and only the report ships.
        name: 'a line comment ahead of a block body withholds the fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): // doc
User => {
  return fetchUser() as User;
};
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: null,
      },
      {
        // The neighbour on the other side of that carve-out: the body opens a
        // line of its own at exactly the depth the carried run is written to,
        // so nothing behind it moves and the fix ships.
        name: 'a body already opening its own line at the run depth is fixed',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): // doc
User =>
  {
    return fetchUser() as User;
  };
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  // doc
  {
    return fetchUser() as User;
  };
`,
      },
      {
        // The lines a template literal occupies are inside a single token, so
        // it has no interior columns to leave behind at the wrong depth —
        // displacing it moves the whole literal intact.
        name: 'a multi-line template body is displaced without withholding the fix',
        code: `
const render = (): // doc
string =>
  \`line one
line two\` as string;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
const render = () =>
  // doc
  \`line one
line two\` as string;
`,
      },
      {
        // Issue #2120: Prettier lays an arrow chain out as one group, and the
        // line terminator this annotation carries is the only thing holding
        // that group open. Stripping it re-decides where the OTHER link breaks,
        // which is text outside this annotation's span, so the fix is withheld.
        name: 'a broken arrow chain held open by a block comment withholds the fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const outer =
  () =>
  (): /**
   * doc
   */ User =>
    fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: null,
      },
      {
        // A line comment holds the group open just as hard as a block comment
        // carrying a terminator, so the same carve-out answers for it.
        name: 'a broken arrow chain held open by a line comment withholds the fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const outer =
  () =>
  (): // doc
  User =>
    fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: null,
      },
      {
        // The neighbour that pins what the carve-out keys on: the chain is
        // written just as broken, but the strip takes no line terminator out of
        // the head, so the group stays where it was and the fix ships.
        name: 'a broken arrow chain losing no terminator is still fixed',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const buildUserFetcher =
  (tenantIdentifier: string, tenantRegionName: string) =>
  (requestIdentifier: string, requestRegionName: string): User =>
    fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const buildUserFetcher =
  (tenantIdentifier: string, tenantRegionName: string) =>
  (requestIdentifier: string, requestRegionName: string) =>
    fetchUser() as User;
`,
      },
      {
        // Same broken chain with a comment that stays in the gap: a comment is
        // not itself the trigger, only the terminator one may carry.
        name: 'a broken arrow chain keeps a one-line comment and its fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const buildUserFetcher =
  (tenantIdentifier: string, tenantRegionName: string) =>
  (requestIdentifier: string, requestRegionName: string): /* doc */ User =>
    fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const buildUserFetcher =
  (tenantIdentifier: string, tenantRegionName: string) =>
  (requestIdentifier: string, requestRegionName: string) /* doc */ =>
    fetchUser() as User;
`,
      },
      {
        // A chain whose links share a line is a group nothing holds open, so
        // the strip cannot collapse it and the fix ships.
        name: 'a chain written on one line is fixed',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const outer = () => (): /* doc */ User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const outer = () => () /* doc */ => fetchUser() as User;
`,
      },
      {
        // An arrow sitting in another arrow's PARAMETER list shares a parent
        // type without sharing a chain: its own head is laid out on its own,
        // so the chain carve-out must not reach it.
        name: 'an arrow in a parameter default is not treated as a chain link',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const outer = (
  cb = (): /**
   * doc
   */ User => fetchUser() as User,
) => cb;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const outer = (
  cb = () =>
    /**
     * doc
     */ fetchUser() as User,
) => cb;
`,
      },
      {
        // The comment sits inside the deleted slice, so a plain deletion would
        // drop it outright (#1877).
        name: 'a single-line comment inside the annotation survives in the gap',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): /* doc */ User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* doc */ => fetchUser() as User;
`,
      },
      {
        name: 'a multi-line comment inside the annotation is carried past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): /**
 * doc
 */ User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  /**
   * doc
   */ fetchUser() as User;
`,
      },
      {
        name: 'a multi-line comment after the annotation is carried past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = (): User /**
 * doc
 */ => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  /**
   * doc
   */ fetchUser() as User;
`,
      },
      {
        // No comment is needed to breach the gap: a raw line break the
        // annotation was not carrying is left behind by the deletion just the
        // same.
        name: 'a raw line break ahead of the annotation is collapsed',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = ()
  : User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => fetchUser() as User;
`,
      },
      {
        name: 'an async arrow carries its comment past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): Promise<User>;
const getUser = async () /**
 * doc
 */ : Promise<User> => fetchUser() as Promise<User>;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): Promise<User>;
const getUser = async () =>
  /**
   * doc
   */ fetchUser() as Promise<User>;
`,
      },
      {
        name: 'a nested arrow carries its comment past its own arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const outer = () => (() /**
 * doc
 */ : User => fetchUser() as User);
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const outer = () => (() =>
  /**
   * doc
   */ fetchUser() as User);
`,
      },
      {
        name: 'a class-property arrow carries its comment past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  getUser = () /**
   * doc
   */ : User => fetchUser() as User;
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  getUser = () =>
    /**
     * doc
     */ fetchUser() as User;
}
`,
      },
      {
        name: 'an object-property arrow carries its comment past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const repo = {
  getUser: () /**
   * doc
   */ : User => fetchUser() as User,
};
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const repo = {
  getUser: () =>
    /**
     * doc
     */ fetchUser() as User,
};
`,
      },
      {
        // Issue #2066: a body that opens a brace keeps the arrow's own line —
        // it closes back at the declaration's depth, so breaking ahead of it
        // buys nothing. The gutter is still aligned to where the comment lands.
        name: 'an arrow with a block body carries its comment past the arrow',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /**
 * doc
 */ : User => {
  return fetchUser() as User;
};
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () => /**
 * doc
 */ {
  return fetchUser() as User;
};
`,
      },
      {
        // Issue #2066: the comment is re-emitted at the depth an arrow body is
        // written at — one step past the declaration it belongs to, not the
        // arrow's own column, which a multi-line annotation leaves sitting on
        // the comment's one-space gutter. The gutter travels with it.
        name: 'a nested declaration carries its comment to its own depth',
        code: `
type User = { id: string };
declare function fetchUser(): User;
function outer() {
  const getUser = (): /**
 * doc
 */ User => fetchUser() as User;
  return getUser;
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
function outer() {
  const getUser = () =>
    /**
     * doc
     */ fetchUser() as User;
  return getUser;
}
`,
      },
      {
        name: 'a generic arrow carries its comment past the arrow',
        code: `
type Box<T> = { value: T };
declare function make<T>(): Box<T>;
const build = <T,>() /**
 * doc
 */ : Box<T> => make<T>() as Box<T>;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type Box<T> = { value: T };
declare function make<T>(): Box<T>;
const build = <T,>() =>
  /**
   * doc
   */ make<T>() as Box<T>;
`,
      },
      {
        // Each comment is judged on its own: only the one that carries a line
        // terminator has to leave the gap.
        name: 'only the comment that breaches the gap is moved',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* a */ /**
 * b
 */ : User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /* a */ =>
  /**
   * b
   */ fetchUser() as User;
`,
      },
      {
        name: 'a comment already past the arrow keeps its place behind the carried one',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () /**
 * doc
 */ : User => /* body */ fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = () =>
  /**
   * doc
   */ /* body */ fetchUser() as User;
`,
      },
      {
        // The whole batch ships as one fix, so both arrows are rewritten in the
        // same pass and neither edit may overlap the other.
        name: 'two arrows in one file are both carried',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const first = () /**
 * one
 */ : User => fetchUser() as User;
const second = () /**
 * two
 */ : User => fetchUser() as User;
`,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const first = () =>
  /**
   * one
   */ fetchUser() as User;
const second = () =>
  /**
   * two
   */ fetchUser() as User;
`,
      },
      {
        name: 'an arrow batched with a plain binding keeps both removals',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const cached: User = fetchUser() as User;
const getUser = () /**
 * doc
 */ : User => fetchUser() as User;
`,
        errors: [
          { messageId: 'redundantAnnotationAndAssertion' },
          { messageId: 'redundantAnnotationAndAssertion' },
        ],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const cached = fetchUser() as User;
const getUser = () =>
  /**
   * doc
   */ fetchUser() as User;
`,
      },
      {
        // Rewriting the gap collapses the lines it spanned, which would move the
        // line the directive points at, so the fix is withheld and only the
        // report ships. `output: null` is what asserts that — an omitted
        // `output` asserts nothing.
        name: 'a disable directive in the gap withholds the fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = ()
// eslint-disable-next-line no-console
: User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: null,
      },
      {
        name: 'a @ts-expect-error in the gap withholds the fix',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = ()
/* @ts-expect-error intentional */
: User => fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: null,
      },
      {
        // A function declaration ends its signature at a body, so nothing about
        // its comments is restricted and the deletion stays byte-identical.
        name: 'a function declaration keeps its comment where it was written',
        code: `
type User = { id: string };
declare function fetchUser(): User;
function getUser() /**
 * doc
 */ : User {
  return fetchUser() as User;
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
function getUser() /**
 * doc
 */ {
  return fetchUser() as User;
}
`,
      },
      {
        name: 'a method keeps its comment where it was written',
        code: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  getUser() /**
   * doc
   */ : User {
    return fetchUser() as User;
  }
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  getUser() /**
   * doc
   */ {
    return fetchUser() as User;
  }
}
`,
      },
      {
        name: 'a function expression keeps its comment where it was written',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = function () /**
 * doc
 */ : User {
  return fetchUser() as User;
};
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const getUser = function () /**
 * doc
 */ {
  return fetchUser() as User;
};
`,
      },
      {
        name: 'a class property keeps its comment where it was written',
        code: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  user /**
   * doc
   */ : User = fetchUser() as User;
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
class Repo {
  user /**
   * doc
   */ = fetchUser() as User;
}
`,
      },
      {
        name: 'a plain binding keeps its comment where it was written',
        code: `
type User = { id: string };
declare function fetchUser(): User;
const user /* doc */: User = fetchUser() as User;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
type User = { id: string };
declare function fetchUser(): User;
const user /* doc */ = fetchUser() as User;
`,
      },
    ],
  },
);

/**
 * Issue #1969: the fixer's own output, judged by a compiler rather than by a
 * parser.
 *
 * TS1200 ("Line terminator not permitted before arrow") is the only instrument
 * that sees this breach. `@typescript-eslint/parser` accepts the broken text —
 * the case below measures that — so every reparse-based guard in this repo,
 * including the RuleTester's own, reads it as clean. The program is built over
 * an in-memory file with `noResolve`/`noLib` because only the syntactic verdict
 * on the emitted text is at stake, not whether the fixture's types resolve.
 */
describe('no-redundant-annotation-assertion --fix emits code the compiler accepts', () => {
  const RULE_ID = '@blumintinc/blumint/no-redundant-annotation-assertion';
  const FILENAME = 'x.ts';

  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  linter.defineRule(
    RULE_ID,
    noRedundantAnnotationAssertion as unknown as Rule.RuleModule,
  );

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' },
  };

  /** The restricted-production breaches a compiler finds in `code`. */
  const restrictedProductionErrorsOf = (code: string): string[] => {
    const file = ts.createSourceFile(
      FILENAME,
      code,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );
    const host: ts.CompilerHost = {
      getSourceFile: (name) => (name === FILENAME ? file : undefined),
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => undefined,
      getCurrentDirectory: () => '/',
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (name) => name === FILENAME,
      readFile: (name) => (name === FILENAME ? code : undefined),
    };
    const program = ts.createProgram(
      [FILENAME],
      { noResolve: true, noLib: true },
      host,
    );

    return [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ]
      .filter((diagnostic) => diagnostic.code === 1200)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      );
  };

  /**
   * How many return annotations `code` still declares. Substring assertions
   * cannot answer this — the fixtures name their type in a `declare` and in an
   * assertion the fix must keep — so the count is read off the AST instead.
   */
  const returnAnnotationCount = (code: string): number => {
    const ast = tsParser.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    });
    let count = 0;

    const visit = (node: TSESTree.Node): void => {
      if (
        (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.type === AST_NODE_TYPES.FunctionDeclaration ||
          node.type === AST_NODE_TYPES.FunctionExpression) &&
        node.returnType
      ) {
        count += 1;
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

    visit(ast as unknown as TSESTree.Node);
    return count;
  };

  const HEAD =
    'type User = { id: string };\ndeclare function fetchUser(): User;\n';
  const DOC = ['/**', ' * why this exists', ' */'].join('\n');

  // The text a bare deletion used to emit: the annotation gone, the comment
  // left in the restricted gap. Every assertion below is worthless if this
  // shape is not actually broken, and if the parsers do not actually accept it.
  const NAIVE_STRIP = `${HEAD}const getUser = () ${DOC} => fetchUser() as User;\n`;

  it('rejects the shape a bare deletion leaves behind', () => {
    expect(restrictedProductionErrorsOf(NAIVE_STRIP)).toEqual([
      'Line terminator not permitted before arrow.',
    ]);
  });

  it('accepts the source that shape was fixed from', () => {
    expect(
      restrictedProductionErrorsOf(
        `${HEAD}const getUser = () ${DOC} : User => fetchUser() as User;\n`,
      ),
    ).toEqual([]);
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
    [
      'the reported repro',
      `${HEAD}const getUser = () ${DOC} : User => fetchUser() as User;\n`,
    ],
    [
      'a comment inside the annotation',
      `${HEAD}const getUser = (): ${DOC} User => fetchUser() as User;\n`,
    ],
    [
      'a comment after the annotation',
      `${HEAD}const getUser = (): User ${DOC} => fetchUser() as User;\n`,
    ],
    [
      'a line comment',
      `${HEAD}const getUser = () // why this exists\n: User => fetchUser() as User;\n`,
    ],
    [
      'an async arrow',
      `type User = { id: string };\ndeclare function fetchUser(): Promise<User>;\nconst getUser = async () ${DOC} : Promise<User> => fetchUser() as Promise<User>;\n`,
    ],
    [
      'a nested arrow',
      `${HEAD}const outer = () => (() ${DOC} : User => fetchUser() as User);\n`,
    ],
    [
      'a class-property arrow',
      `${HEAD}class Repo {\n  getUser = () ${DOC} : User => fetchUser() as User;\n}\n`,
    ],
    [
      'a block body',
      `${HEAD}const getUser = () ${DOC} : User => {\n  return fetchUser() as User;\n};\n`,
    ],
    [
      'two arrows in one batch',
      `${HEAD}const first = () ${DOC} : User => fetchUser() as User;\nconst second = () ${DOC} : User => fetchUser() as User;\n`,
    ],
  ])('emits compiler-legal code for %s', (_label, source) => {
    const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(fixed).toBe(true);
    expect(output).not.toBe(source);
    expect(returnAnnotationCount(source)).toBeGreaterThan(0);
    expect(returnAnnotationCount(output)).toBe(0);
    // Declining or dropping the comment is not the remedy (#1877): the comment
    // has to arrive somewhere legal, character for character.
    expect(output).toContain('why this exists');
    expect(restrictedProductionErrorsOf(output)).toEqual([]);
  });

  // A comment that trips no restricted production must not be moved at all —
  // the table above passes just as well for a fixer that relocates every
  // comment it meets.
  it('leaves a one-line comment where it was written', () => {
    const source = `${HEAD}const getUser = () /* doc */: User => fetchUser() as User;\n`;
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(output).toBe(
      `${HEAD}const getUser = () /* doc */ => fetchUser() as User;\n`,
    );
    expect(restrictedProductionErrorsOf(output)).toEqual([]);
  });

  // A function declaration ends its signature at a body, so nothing about its
  // comments is restricted. Moving them would be a regression of its own.
  it('leaves a function declaration untouched', () => {
    const source = `${HEAD}function getUser() ${DOC} : User {\n  return fetchUser() as User;\n}\n`;
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(output).toBe(
      `${HEAD}function getUser() ${DOC} {\n  return fetchUser() as User;\n}\n`,
    );
    expect(restrictedProductionErrorsOf(output)).toEqual([]);
  });

  it('settles in one pass', () => {
    const source = `${HEAD}const getUser = () ${DOC} : User => fetchUser() as User;\n`;
    const { output } = linter.verifyAndFix(source, CONFIG, FILENAME);

    expect(linter.verifyAndFix(output, CONFIG, FILENAME).fixed).toBe(false);
  });
});

/**
 * Every case here names a type the checker cannot resolve without
 * `parserOptions.project`, which the `RuleTester` never supplies: array types
 * collapse to one shared anonymous `{}` and generic references become the error
 * type. The rule used to read that collapse as proof the two types matched, so
 * it reported unrelated pairs and `--fix` deleted the annotation, silently
 * changing the binding's type (#1972).
 *
 * The valid arm is therefore load-bearing rather than decorative: these exact
 * inputs were the false positives. The invalid arm holds the other half — the
 * pairs really are redundant, so degrading to a spelling comparison must not
 * cost the report.
 */
ruleTesterTs.run(
  'no-redundant-annotation-assertion (unresolved types, issue #1972)',
  noRedundantAnnotationAssertion,
  {
    valid: [
      // Both element types collapse to the same `{}`; the annotations differ.
      `
declare const x: unknown;
const v: string[] = x as number[];
`,
      `
interface A { id: string }
interface B { n: number }
declare const x: unknown;
const v: A[] = x as B[];
`,
      // `readonly` is erased by the collapse, so the pair looked identical.
      `
interface A { id: string }
declare const x: unknown;
const v: readonly A[] = x as A[];
`,
      // Generic references degrade to the error type, assignable both ways.
      `
declare const x: unknown;
const v: Record<string, string> = x as Record<string, number>;
`,
      `
declare const x: unknown;
const v: Promise<string> = x as Promise<number>;
`,
      `
interface A { id: string }
declare const x: unknown;
const v: A[] = x as Map<string, A>;
`,
      // The same collapse reaches the return-position arm.
      `
declare function f(): unknown;
function g(): string[] {
  return f() as number[];
}
`,
    ],
    invalid: [
      {
        name: 'an array type spelled identically on both sides is still redundant',
        code: `
interface A { id: string }
declare const x: unknown;
const v: A[] = x as A[];
`,
        // The message quotes the annotation as written. It reported `{}` while
        // the collapse went unnoticed, naming a type absent from the source.
        errors: [
          {
            messageId: 'redundantAnnotationAndAssertion',
            data: { type: 'A[]' },
          },
        ],
        output: `
interface A { id: string }
declare const x: unknown;
const v = x as A[];
`,
      },
      {
        name: 'spacing inside a generic argument list does not hide the match',
        code: `
interface A { id: string }
declare const x: unknown;
const v: Map<string, A> = x as Map<string,A>;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
interface A { id: string }
declare const x: unknown;
const v = x as Map<string,A>;
`,
      },
      {
        name: 'an unresolved generic reference is still redundant against itself',
        code: `
declare const x: unknown;
const v: Record<string, number> = x as Record<string, number>;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
declare const x: unknown;
const v = x as Record<string, number>;
`,
      },
      {
        name: 'the return-position arm keeps reporting an identical spelling',
        code: `
declare function f(): unknown;
function g(): string[] {
  return f() as string[];
}
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `
declare function f(): unknown;
function g() {
  return f() as string[];
}
`,
      },
    ],
  },
);

/**
 * Issue #2070 reaches this rule through the shared arrow-gap planner, which
 * carries a stranded comment into the parentheses a JSX arrow body takes. The
 * branch is measured UNREACHABLE from here, and the reason is structural rather
 * than incidental: this rule fires only where the arrow returns an assertion, so
 * the body it hands the planner is a `TSAsExpression` or the `BlockStatement`
 * holding one — never a `JSXElement` or `JSXFragment`. An arrow returning bare
 * JSX has no assertion to be redundant with, so it draws no report at all.
 *
 * What the JSX VALUE must not do is drag the body with it. The fixtures below
 * pin that: the carried comment keeps the position every non-JSX body gets, and
 * the emitted text is a Prettier fixed point at the repo's settings.
 */
ruleTesterJsx.run(
  'no-redundant-annotation-assertion',
  noRedundantAnnotationAssertion,
  {
    valid: [
      // No assertion, so nothing is redundant — the shape that would otherwise
      // be the JSX branch's own subject draws no report here.
      `export const Row = (): JSX.Element => <div />;\n`,
    ],
    invalid: [
      // The assertion's operand is JSX; the arrow's body is the assertion. The
      // comment takes the line one step past the declaration, with no
      // parentheses added around a body that is not itself JSX.
      {
        code: `export const Row = (): /**
 * doc
 */ JSX.Element => (<div />) as JSX.Element;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `export const Row = () =>
  /**
   * doc
   */ (<div />) as JSX.Element;
`,
      },
      // The same through a block body, which the hugging carve-out answers for:
      // the brace closes back at the declaration's depth, so it keeps the
      // arrow's own line whatever the returned value is.
      {
        code: `export const Row = (): /**
 * doc
 */ JSX.Element => {
  return (<div />) as JSX.Element;
};
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `export const Row = () => /**
 * doc
 */ {
  return (<div />) as JSX.Element;
};
`,
      },
      // A line comment reaches the same place, without consulting the carve-out
      // at all: it ends its line by itself.
      {
        code: `export const Row = (): // doc
JSX.Element => (<div />) as JSX.Element;
`,
        errors: [{ messageId: 'redundantAnnotationAndAssertion' }],
        output: `export const Row = () =>
  // doc
  (<div />) as JSX.Element;
`,
      },
    ],
  },
);

/**
 * The shared planner's output for this rule, judged by Prettier (#2070). The
 * JSX branch changed where a comment lands for one body shape; this asks
 * whether that move leaked into the shapes this rule actually produces.
 */
describe('no-redundant-annotation-assertion --fix leaves JSX values alone', () => {
  const RULE_ID = '@blumintinc/blumint/no-redundant-annotation-assertion';
  const FILENAME = 'x.tsx';

  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  linter.defineRule(
    RULE_ID,
    noRedundantAnnotationAssertion as unknown as Rule.RuleModule,
  );

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' },
  };

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

  const SOURCES: [string, string][] = [
    [
      'asserted JSX value',
      `export const Row = (): ${DOC} JSX.Element => (<div />) as JSX.Element;\n`,
    ],
    [
      'line comment, asserted JSX value',
      `export const Row = (): // doc\nJSX.Element => (<div />) as JSX.Element;\n`,
    ],
    [
      'non-JSX value, for contrast',
      `type El = { k: string };\ndeclare function make(): El;\nexport const Row = (): ${DOC} El => make() as El;\n`,
    ],
  ];

  const settled = SOURCES.filter(([, source]) => isFixedPoint(source));

  it('rewrites Prettier-clean input into Prettier-clean output', () => {
    expect(settled.length).toBe(SOURCES.length);

    for (const [, source] of settled) {
      const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);
      expect(fixed).toBe(true);
      expect(output).toContain('doc');
      // No pair is added around the assertion: the parentheses in the output
      // are the ones the source wrote around the JSX operand.
      expect(output).not.toMatch(/=> \(\n/);
      expect(isFixedPoint(output)).toBe(true);
    }
  });

  it('is not vacuous: the JSX branch would be visible here if it fired', () => {
    // The shape the JSX branch emits, planted. Prettier rejects it for an
    // assertion body, so a leak into this rule could not pass the check above.
    expect(
      isFixedPoint(
        `export const Row = () => (\n  /**\n   * doc\n   */ (<div />) as JSX.Element\n);\n`,
      ),
    ).toBe(false);
    // And the position this rule does emit is one Prettier keeps.
    expect(
      isFixedPoint(
        `export const Row = () =>\n  /**\n   * doc\n   */ (<div />) as JSX.Element;\n`,
      ),
    ).toBe(true);
  });
});

/**
 * Issue #2120: agora runs Prettier and `eslint --fix` over the same tree, so a
 * fixer whose output Prettier rewrites on arrival produces a diff that never
 * settles and churns every file it touches.
 *
 * Every source below is a Prettier fixed point as written, which is what makes
 * the question meaningful: a pre-image Prettier would reformat anyway cannot
 * distinguish the fixer's churn from the formatter's own.
 */
describe('no-redundant-annotation-assertion --fix output survives Prettier', () => {
  const RULE_ID = '@blumintinc/blumint/no-redundant-annotation-assertion';
  const FILENAME = 'x.ts';

  const linter = new Linter();
  linter.defineParser('@typescript-eslint/parser', tsParser as never);
  linter.defineRule(
    RULE_ID,
    noRedundantAnnotationAssertion as unknown as Rule.RuleModule,
  );

  const CONFIG: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' },
  };

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

  const HEAD =
    'type User = { id: string };\ndeclare function fetchUser(): User;\n';

  /** The two shapes reported in #2120, each written as Prettier prints it. */
  const WITHHELD: [string, string][] = [
    [
      'a line comment ahead of a block body',
      `${HEAD}const getUser = (): // doc\nUser => {\n  return fetchUser() as User;\n};\n`,
    ],
    [
      'a broken arrow chain held open by the annotation',
      `${HEAD}const outer =\n  () =>\n  (): /**\n   * doc\n   */ User =>\n    fetchUser() as User;\n`,
    ],
  ];

  /**
   * Neighbours of those two carve-outs: the same body shape and the same broken
   * chain, differing only in what the strip would displace. Each must still be
   * fixed, and its output must settle.
   */
  const FIXED: [string, string][] = [
    [
      'the same block body, with a comment that keeps the arrow line',
      `${HEAD}const getUser = (): /**\n * doc\n */ User => {\n  return fetchUser() as User;\n};\n`,
    ],
    [
      'a broken chain that loses no line terminator',
      `${HEAD}const buildUserFetcher =\n  (tenantIdentifier: string, tenantRegionName: string) =>\n  (requestIdentifier: string, requestRegionName: string): User =>\n    fetchUser() as User;\n`,
    ],
    [
      'a broken chain whose comment stays in the gap',
      `${HEAD}const buildUserFetcher =\n  (tenantIdentifier: string, tenantRegionName: string) =>\n  (requestIdentifier: string, requestRegionName: string): /* doc */ User =>\n    fetchUser() as User;\n`,
    ],
    [
      'a chain written on one line',
      `${HEAD}const outer = () => (): /* doc */ User => fetchUser() as User;\n`,
    ],
    [
      'an arrow in a parameter default',
      `${HEAD}const outer = (\n  cb = (): /**\n   * doc\n   */ User => fetchUser() as User,\n) => cb;\n`,
    ],
    [
      'a multi-line template body',
      'const render = (): // doc\nstring =>\n  `line one\nline two` as string;\n',
    ],
  ];

  it.each([...WITHHELD, ...FIXED])(
    'reads %s from a Prettier fixed point',
    (_label, source) => {
      expect(isFixedPoint(source)).toBe(true);
      expect(
        linter.verify(source, CONFIG, FILENAME).filter((m) => m.fatal),
      ).toEqual([]);
    },
  );

  it.each(WITHHELD)('withholds the fix for %s', (_label, source) => {
    // The report survives the decline: the annotation is still surfaced to its
    // author, only the edit is withheld.
    expect(
      linter
        .verify(source, CONFIG, FILENAME)
        .filter((message) => message.ruleId === RULE_ID),
    ).toHaveLength(1);

    const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);
    expect(fixed).toBe(false);
    expect(output).toBe(source);
  });

  it.each(FIXED)('fixes %s into a Prettier fixed point', (_label, source) => {
    const { output, fixed } = linter.verifyAndFix(source, CONFIG, FILENAME);
    expect(fixed).toBe(true);
    expect(output).not.toBe(source);
    expect(isFixedPoint(output)).toBe(true);
  });

  // Declining is only worth its false negative where no emission settles. The
  // text the planner would otherwise have written for each withheld shape is
  // planted here: Prettier rejects both, so neither could pass the check above.
  it('is not vacuous: the withheld emissions are the ones Prettier rewrites', () => {
    expect(
      isFixedPoint(
        `${HEAD}const getUser = () =>\n  // doc\n  {\n  return fetchUser() as User;\n};\n`,
      ),
    ).toBe(false);
    expect(
      isFixedPoint(
        `${HEAD}const outer =\n  () =>\n  () =>\n    /**\n     * doc\n     */\n    fetchUser() as User;\n`,
      ),
    ).toBe(false);
    // And the settled layout for the block-body shape is one no annotation
    // strip can reach: it re-indents the body's own interior.
    expect(
      isFixedPoint(
        `${HEAD}const getUser = () =>\n  // doc\n  {\n    return fetchUser() as User;\n  };\n`,
      ),
    ).toBe(true);
  });
});
