# Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup (`@blumintinc/blumint/enforce-firestore-doc-ref-generic`)

💼 This rule is enabled in the ✅ `recommended` config.

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

This rule enforces that all `DocumentReference` types from Firestore must specify a generic type argument and that the generic type is not `any` or an empty object type `{}`.

## Rule Details

Using properly typed `DocumentReference` helps catch type errors early and provides better type safety when working with Firestore documents.

Examples of **incorrect** code for this rule:

```ts
// Missing generic type argument
const docRef: DocumentReference = db.doc('users/123');

// Using 'any' as generic type
const docRef: DocumentReference<any> = db.doc('users/123');

// Using empty object type
const docRef: DocumentReference<{}> = db.doc('users/123');

// Using interface with any properties
interface UserData {
  name: any;
  age: any;
}
const docRef: DocumentReference<UserData> = db.doc('users/123');
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

// Using intersection types
type BaseData = {
  id: string;
  createdAt: Date;
};
type UserWithBase = UserData & BaseData;
const docRef: DocumentReference<UserWithBase> = db.doc('users/123');
```

## Options

This rule has no configurable options.

## When Not To Use It

If you're working with untyped Firestore documents or if you need to temporarily work with unknown document types during development/prototyping phases. However, it's recommended to always properly type your Firestore documents in production code.
