# Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup (`@blumintinc/blumint/enforce-firestore-doc-ref-generic`)

💼 This rule is enabled in the ✅ `recommended` config.

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule requires every Firestore `DocumentReference`, `CollectionReference`, and `CollectionGroup` to declare the document shape via their generic type and rejects generics that are `any` or `{}` (and flags nested `any`/`{}` where they can be statically detected). Firestore does not enforce schemas at runtime; without a typed generic, TypeScript treats the data as loose `DocumentData`, so field typos and missing properties compile and ship to production unchecked.

## Rule Details

- Provide a concrete document interface or type whenever you create a Firestore reference or call `doc`, `collection`, or `collectionGroup`.
- Calls on an already typed `CollectionReference<T>` may omit the generic on `collectionRef.doc(...)` because the collection supplies the document shape. This holds whether the collection is chained (`db.collection<T>('x').doc('y')`) or first stored in a `const`.
- Resolving a stored collection is deliberately shallow: only a `const` whose initializer is a `collection<T>(...)` call, whose annotation is `CollectionReference<T>`, or which asserts that type is followed, and only one hop. An alias of an alias, a `let`, a parameter, or an import cannot be proven typed, so `doc(...)` on those still requires its own generic.
- Generics that use `any` or `{}` erase the schema and disable compile-time checks; nested `any`/`{}` are flagged when the rule can see them inline or via same-file types.
- Receivers that trace back to `@firebase/rules-unit-testing` are exempt. See [Compat Firestore from `@firebase/rules-unit-testing`](#compat-firestore-from-firebaserules-unit-testing).

## Compat Firestore from `@firebase/rules-unit-testing`

`RulesTestContext.firestore()` returns the compat (v8-style) `Firestore`, whose `doc`, `collection`, and `collectionGroup` declare **zero** type parameters. Supplying a generic there is `error TS2558: Expected 0 type arguments, but got 1`, so on that surface every fix this rule suggests is uncompilable. Security-rules tests therefore get an exemption: a `doc`/`collection`/`collectionGroup` call whose receiver traces syntactically back to a value from `@firebase/rules-unit-testing` is not reported.

The trace follows awaits, calls, member access, optional chaining, and type assertions, and it recognizes every import form (named, aliased, default, namespace, and type-only). A parameter annotated with a type imported from that module — the `withSecurityRulesDisabled(async (ctx: RulesTestContext) => ...)` callback — also counts.

The exemption is deliberately limited:

- **`const` only.** A `let`/`var` binding anywhere along the chain is refused, because a later assignment can swap in an Admin SDK handle where the generic is both supportable and valuable.
- **The receiver decides, not the file.** An Admin SDK reference in a rules test is still reported.
- **The modular `doc(db, path)` function is untouched.** It accepts the generic, so it still requires one.
- **An explicit `DocumentReference` annotation is untouched.** The annotation is written by hand and can carry its generic regardless of the runtime surface.

```ts
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { getFirestore } from 'firebase-admin/firestore';

const run = async () => {
  const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });

  // Correct: the compat surface accepts no type argument.
  const compatDb = testEnv.authenticatedContext('owner-uid').firestore();
  await compatDb.doc('User/uid/OverlaySettings/uid').get();

  // Incorrect: the receiver is an Admin SDK Firestore, which does accept one.
  const adminDb = getFirestore();
  await adminDb.doc('User/uid').get();
};
```

### Examples of incorrect code

```ts
// Missing generic type argument on a reference
const userDocRef: DocumentReference = db.doc('users/123');

// Missing generic when creating a collection
const usersCollectionUntyped = db.collection('users');

// Using `any` erases the schema
const productDocRef: DocumentReference<any> = db.doc('products/123');

// Using empty object type
const auditLogDocRef: DocumentReference<{}> = db.doc('audit/123');

// Nested `any` still erases the document type
interface UserProfile {
  name: string;
  metadata: { audit: any };
}
const userProfileDocRef: DocumentReference<UserProfile> = db.doc('users/123');

// Overriding a typed collection with an unsafe generic
const customerCollection = db.collection<UserProfile>('customers');
const unsafeCustomerDoc = customerCollection.doc<any>('cust123');
```

### Examples of correct code

```ts
interface UserData {
  name: string;
  age: number;
  isActive: boolean;
}

// Using proper interface as generic type
const userDocRef: DocumentReference<UserData> = db.doc('users/123');

// Using type alias as generic type
type ProductData = {
  title: string;
  price: number;
  stock: number;
};
const productDocRef: DocumentReference<ProductData> = db.doc('products/456');

// Typed collection supplies the generic to collectionRef.doc()
const typedUsersCollection = db.collection<UserData>('users');
const typedUserDoc = typedUsersCollection.doc('123');

// Using intersection types keeps the schema intact
type BaseData = { id: string; createdAt: Date };
type UserWithBase = UserData & BaseData;
const userWithBaseDoc: DocumentReference<UserWithBase> = db.doc('users/123');
```

## When Not To Use It

Only disable this rule when you intentionally work with dynamic collections whose shape is unknown and you accept the loss of type safety. Even then, prefer modeling the uncertainty explicitly (e.g., with `unknown` plus runtime validation) instead of relying on `any` or `{}`.
