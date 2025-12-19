# Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup (`@blumintinc/blumint/enforce-firestore-doc-ref-generic`)

💼 This rule is enabled in the ✅ `recommended` config.

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule requires every Firestore `DocumentReference`, `CollectionReference`, and `CollectionGroup` to declare the document shape via their generic type and rejects generics that are `any` or `{}` (and flags nested `any`/`{}` where they can be statically detected). Firestore does not enforce schemas at runtime; without a typed generic, TypeScript treats the data as loose `DocumentData`, so field typos and missing properties compile and ship to production unchecked.

## Rule Details

- Provide a concrete document interface or type whenever you create a Firestore reference or call `doc`, `collection`, or `collectionGroup`.
- Calls on an already typed `CollectionReference<T>` may omit the generic on `collectionRef.doc(...)` because the collection supplies the document shape.
- Generics that use `any` or `{}` erase the schema and disable compile-time checks; nested `any`/`{}` are flagged when the rule can see them inline or via same-file types.

Examples of **incorrect** code for this rule:

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

Examples of **correct** code for this rule:

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
