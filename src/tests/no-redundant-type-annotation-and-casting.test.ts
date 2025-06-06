import { ruleTesterTs } from '../utils/ruleTester';
import { noRedundantTypeAnnotationAndCasting } from '../rules/no-redundant-type-annotation-and-casting';

ruleTesterTs.run('no-redundant-type-annotation-and-casting', noRedundantTypeAnnotationAndCasting, {
  valid: [
    // Variable declaration without type annotation
    {
      code: 'const docRef = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;',
    },
    // Variable declaration without type assertion
    {
      code: 'const docRef: DocumentReference<ResultSummary> = resultSummaryCollectionRef.doc(teamId);',
    },
    // Different types in annotation and assertion
    {
      code: 'const myVar: any = "some string" as string;',
    },
    // Different generic types
    {
      code: 'const userRef: DocumentReference<User> = db.collection("users").doc("123") as DocumentReference<Profile>;',
    },
    // No type annotation or assertion
    {
      code: 'const value = getValue();',
    },
    // Only type assertion, no annotation
    {
      code: 'const result = apiCall() as ApiResponse;',
    },
    // Only type annotation, no assertion
    {
      code: 'const handler: EventHandler = createHandler();',
    },
    // Arrow function without return type
    {
      code: 'const getUser = () => fetchUser() as User;',
    },
    // Complex nested expressions without redundancy
    {
      code: 'const data: ApiResponse = await fetch("/api").then(res => res.json()) as UserData;',
    },
    // Union types that are different
    {
      code: 'const value: string | number = getValue() as string;',
    },
    // Intersection types that are different
    {
      code: 'const obj: BaseType & ExtendedType = getObject() as BaseType;',
    },
    // Array types that are different
    {
      code: 'const items: string[] = getItems() as number[];',
    },
    // Tuple types that are different
    {
      code: 'const pair: [string, number] = getPair() as [number, string];',
    },
    // Generic function types that are different
    {
      code: 'const fn: <T>(x: T) => T = createFn() as <U>(x: U) => U;',
    },
    // Object types that are different
    {
      code: 'const obj: { id: string } = getObj() as { id: number };',
    },
    // Class property without redundancy
    {
      code: 'class Example { prop: string = getValue() as number; }',
    },
    // Assignment without redundancy
    {
      code: 'let variable: string; variable = getValue() as number;',
    },
    // Method call chains without redundancy
    {
      code: 'const result: Promise<User> = api.getUser().then(data => data as Profile);',
    },
    // Conditional expressions
    {
      code: 'const value: string = condition ? getValue() as number : "default";',
    },
    // Destructuring (should be ignored for now)
    {
      code: 'const { data }: { data: string } = { data: "hello" } as { data: string };',
    },
    // Nested function calls
    {
      code: 'const result: OuterType = outer(inner() as InnerType) as DifferentType;',
    },
    // Template literal types
    {
      code: 'const template: `prefix-${string}` = getValue() as `suffix-${string}`;',
    },
    // Mapped types
    {
      code: 'const mapped: Partial<User> = getUser() as Required<User>;',
    },
    // Conditional types
    {
      code: 'const conditional: T extends string ? string : number = getValue() as T extends number ? number : string;',
    },
  ],
  invalid: [
    // Basic case - the example from the problem statement
    {
      code: `const docRef: DocumentReference<ResultSummary> = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;`,
      output: `const docRef = resultSummaryCollectionRef.doc(teamId) as DocumentReference<ResultSummary>;`,
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Simple primitive types
    {
      code: 'const value: string = getValue() as string;',
      output: 'const value = getValue() as string;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Generic types
    {
      code: 'const list: Array<string> = getList() as Array<string>;',
      output: 'const list = getList() as Array<string>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Complex generic types
    {
      code: 'const promise: Promise<User[]> = fetchUsers() as Promise<User[]>;',
      output: 'const promise = fetchUsers() as Promise<User[]>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Union types
    {
      code: 'const value: string | number = getValue() as string | number;',
      output: 'const value = getValue() as string | number;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Intersection types
    {
      code: 'const obj: BaseType & ExtendedType = getObject() as BaseType & ExtendedType;',
      output: 'const obj = getObject() as BaseType & ExtendedType;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Array types
    {
      code: 'const items: string[] = getItems() as string[];',
      output: 'const items = getItems() as string[];',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Tuple types
    {
      code: 'const pair: [string, number] = getPair() as [string, number];',
      output: 'const pair = getPair() as [string, number];',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Object types
    {
      code: 'const obj: { id: string; name: string } = getObj() as { id: string; name: string };',
      output: 'const obj = getObj() as { id: string; name: string };',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Function types
    {
      code: 'const fn: (x: number) => string = createFn() as (x: number) => string;',
      output: 'const fn = createFn() as (x: number) => string;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Generic function types
    {
      code: 'const fn: <T>(x: T) => T = createFn() as <T>(x: T) => T;',
      output: 'const fn = createFn() as <T>(x: T) => T;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Class property
    {
      code: 'class Example { prop: string = getValue() as string; }',
      output: 'class Example { prop = getValue() as string; }',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },

    // Arrow function return type
    {
      code: 'const getUser = (): User => fetchUser() as User;',
      output: 'const getUser = () => fetchUser() as User;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },

    // Nested generic types
    {
      code: 'const data: Map<string, Set<number>> = getData() as Map<string, Set<number>>;',
      output: 'const data = getData() as Map<string, Set<number>>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Readonly types
    {
      code: 'const items: readonly string[] = getItems() as readonly string[];',
      output: 'const items = getItems() as readonly string[];',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Optional properties
    {
      code: 'const obj: { id?: string } = getObj() as { id?: string };',
      output: 'const obj = getObj() as { id?: string };',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Method signatures
    {
      code: 'const obj: { method(): void } = getObj() as { method(): void };',
      output: 'const obj = getObj() as { method(): void };',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Index signatures
    {
      code: 'const obj: { [key: string]: number } = getObj() as { [key: string]: number };',
      output: 'const obj = getObj() as { [key: string]: number };',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Conditional types
    {
      code: 'const value: T extends string ? string : number = getValue() as T extends string ? string : number;',
      output: 'const value = getValue() as T extends string ? string : number;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Mapped types
    {
      code: 'const partial: Partial<User> = getUser() as Partial<User>;',
      output: 'const partial = getUser() as Partial<User>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Template literal types
    {
      code: 'const template: `prefix-${string}` = getValue() as `prefix-${string}`;',
      output: 'const template = getValue() as `prefix-${string}`;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Utility types
    {
      code: 'const required: Required<User> = getUser() as Required<User>;',
      output: 'const required = getUser() as Required<User>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Keyof types
    {
      code: 'const key: keyof User = getKey() as keyof User;',
      output: 'const key = getKey() as keyof User;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Typeof types
    {
      code: 'const config: typeof defaultConfig = getConfig() as typeof defaultConfig;',
      output: 'const config = getConfig() as typeof defaultConfig;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Complex nested method calls
    {
      code: 'const result: DocumentReference<User> = db.collection("users").doc("123") as DocumentReference<User>;',
      output: 'const result = db.collection("users").doc("123") as DocumentReference<User>;',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // Type assertion with parentheses
    {
      code: 'const value: string = (getValue() as string);',
      output: 'const value = (getValue() as string);',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
    // TSTypeAssertion syntax (angle brackets)
    {
      code: 'const value: string = <string>getValue();',
      output: 'const value = <string>getValue();',
      errors: [{ messageId: 'redundantTypeAnnotationAndCasting' }],
    },
  ],
});
