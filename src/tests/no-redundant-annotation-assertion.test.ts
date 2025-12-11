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
    ],
  },
);
