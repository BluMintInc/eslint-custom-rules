import { ruleTesterTs } from '../utils/ruleTester';
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
