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
    ],
  },
);
