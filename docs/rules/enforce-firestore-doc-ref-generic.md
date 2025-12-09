# Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup (`@blumintinc/blumint/enforce-firestore-doc-ref-generic`)

💼 This rule is enabled in the ✅ `recommended` config.

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule requires every Firestore `DocumentReference`, `CollectionReference`, and `CollectionGroup` to declare the document shape via their generic type and rejects generics that resolve to `any` or `{}` (including nested usages). Firestore does not enforce schemas at runtime; without a typed generic, TypeScript treats the data as loose `DocumentData`, so field typos and missing properties compile and ship to production unchecked.

## Rule Details

- Provide a concrete document interface or type whenever you create a Firestore reference or call `doc`, `collection`, or `collectionGroup`.
- Calls on an already typed `CollectionReference<T>` may omit the `doc` generic because the collection supplies the document shape.
- Generics that collapse to `any` or `{}` (directly or through nested properties) are disallowed because they erase the schema and disable compile-time checks on reads and writes.

Examples of **incorrect** code for this rule:

```ts
// Missing generic type argument on a reference
const docRef: DocumentReference = db.doc('users/123');

// Missing generic when creating a collection
const users = db.collection('users');

// Using `any` erases the schema
const docRef: DocumentReference<any> = db.doc('users/123');

// Using empty object type
const docRef: DocumentReference<{}> = db.doc('users/123');

// Nested `any` still erases the document type
interface UserData {
  name: string;
  metadata: { audit: any };
}
const docRef: DocumentReference<UserData> = db.doc('users/123');

// Overriding a typed collection with an unsafe generic
const usersCollection = db.collection<UserData>('users');
const userDoc = usersCollection.doc<any>('user123');
```

Examples of **correct** code for this rule:

```ts
interface UserData {
  name: string;
  age: number;
  isActive: boolean;
}

// Using proper interface as generic type
const docRef: DocumentReference<UserData> = db.doc('users/123');

// Using type alias as generic type
type ProductData = {
  title: string;
  price: number;
  stock: number;
};
const docRef: DocumentReference<ProductData> = db.doc('products/456');

// Typed collection supplies the generic to doc()
const users = db.collection<UserData>('users');
const userDoc = users.doc('123');

// Using intersection types keeps the schema intact
type BaseData = { id: string; createdAt: Date };
type UserWithBase = UserData & BaseData;
const docRef: DocumentReference<UserWithBase> = db.doc('users/123');
```

## When Not To Use It

Only disable this rule when you intentionally work with dynamic collections whose shape is unknown and you accept the loss of type safety. Even then, prefer modeling the uncertainty explicitly (e.g., with `unknown` plus runtime validation) instead of relying on `any` or `{}`.
