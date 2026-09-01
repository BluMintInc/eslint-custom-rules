# Enforce generic argument for Firestore DocumentReference, CollectionReference and CollectionGroup (`@blumintinc/blumint/enforce-firestore-doc-ref-generic`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule requires every Firestore `DocumentReference`, `CollectionReference`, and `CollectionGroup` to declare the document shape via their generic type and rejects generics that are `any` or `{}` (and flags nested `any`/`{}` where they can be statically detected). Firestore does not enforce schemas at runtime; without a typed generic, TypeScript treats the data as loose `DocumentData`, so field typos and missing properties compile and ship to production unchecked.

## Rule Details

- Provide a concrete document interface or type whenever you create a Firestore reference or call `doc`, `collection`, or `collectionGroup`.
- Calls on an already typed `CollectionReference<T>` may omit the generic on `collectionRef.doc(...)` because the collection supplies the document shape. This holds whether the collection is chained (`db.collection<T>('x').doc('y')`) or first stored in a `const`.
- An optional link anywhere in the receiver (`db?.collection<T>('x')`) is looked through. It changes the reference's nullability, not its schema: the type is `CollectionReference<T> | undefined`, still carrying `T`, so the derived `doc(...)` inherits a shape and needs no generic. The inverse holds too — `db?.collection('x')` supplies nothing and is reported exactly as `db.collection('x')` is.
- Resolving a stored collection is deliberately shallow: only a `const` whose initializer is a `collection<T>(...)` call, whose annotation is `CollectionReference<T>`, or which asserts that type is followed, and only one hop. An alias of an alias, a `let`, a parameter, or an import cannot be proven typed, so `doc(...)` on those still requires its own generic.
- A type assertion counts when it states a document schema — when the asserted type names `DocumentReference`, `CollectionReference`, `CollectionGroup`, or `Query` at any depth. An assertion that names none of them, `as const` above all, states nothing about the reference and does not silence the report. See [What a type assertion states](#what-a-type-assertion-states).
- A class member reached as `this.member` or `this.member()` is resolved through its return type annotation when it has one, and otherwise through the expression it returns. See [Where the schema evidence must live](#where-the-schema-evidence-must-live).
- Both privacy spellings are resolved the same way. `this.#member` reads the schema its `#member` declaration states exactly as `this.member` reads `private member`'s, for a property, a method and a getter alike. The spelling still identifies the member, though: `#settings` and a sibling public `settings` are two different members that may hold different schemas, so each is answered from its own declaration.
- A return type annotation states the schema whichever function spelling carries it — a declaration, a function expression, an arrow with a block body or with a concise one, a class method, a getter, or an object-literal member — and on every return path, not only a `return` written directly in the function body. What it does not cover is a reference the function never hands back: a reference built and stored inside an annotated function is described by nothing and is still reported.
- Generics that use `any` or `{}` erase the schema and disable compile-time checks; nested `any`/`{}` are flagged when the rule can see them inline or via same-file types. See [How a named generic is resolved](#how-a-named-generic-is-resolved).
- Receivers that trace back to `@firebase/rules-unit-testing` are exempt. See [Compat Firestore from `@firebase/rules-unit-testing`](#compat-firestore-from-firebaserules-unit-testing).
- The reference type is recognized however it is namespaced. `FirebaseFirestore.DocumentReference`, `admin.firestore.DocumentReference` and a namespace-import alias such as `fs.DocumentReference` are the same type as the bare `DocumentReference` and are checked identically. Matching keys on the last segment of the name, because the namespace alias is chosen by the importer while `DocumentReference` / `CollectionReference` / `CollectionGroup` are specific enough that an unrelated module's type of the same name is not a realistic collision.

## How a named generic is resolved

`DocumentReference<User>` is checked for a nested `any`/`{}` only when the rule can read the fields `User` declares. The name is resolved lexically within the same file: the search runs from the reference outward through every enclosing scope, and the nearest declaration wins, so an inner declaration shadows a same-named outer one. A declaration written at file scope, inside a function or block, in a `switch` case, or in a namespace all resolve, in either spelling, and the `export` keyword is looked through:

```ts
// All of these are reported: the declared fields are read, and one is `any`.
type User = { data: any };
interface LegacyUser {
  data: any;
}
export type ExportedUser = { data: any };

function load() {
  type LocalUser = { data: any };
  return db.collection('users').doc<LocalUser>('1');
}
```

Both spellings count because `prefer-type-over-interface` ships in the same `recommended` config and is fixable: a single `eslint --fix` pass rewrites every interface into a type alias, so a lookup that reads interfaces alone resolves nothing on a codebase that follows the config.

`export` is looked through for the same reason a nested scope is searched: `export type User = ...` is the same declaration one AST node deeper, and the fields it lists are unambiguous. Letting the keyword decide whether a schema is checked would silently switch the nested-`any` check off for essentially every shared type.

An alias resolves when it declares a type literal, including one wrapped in a single `Readonly<...>`. That wrapper preserves every field the document declares, and the type-argument recursion already looks through it when it is written at the reference itself (`DocumentReference<Readonly<{ data: any }>>`), so both spellings agree.

Everything else stays **unresolved**, and an unresolved generic is never reported: the rule prefers a missed nested `any` to a report it cannot justify syntactically. Unresolved cases are

- an alias **to** a union, an intersection, a mapped type, or another named or imported type (`type User = UserData`) — an intersection written at the reference (`DocumentReference<User & Timestamps>`) is still read, one side at a time;
- a wrapper that can drop fields, such as `Omit<...>` or `Pick<...>`, whose members are not the document's members;
- a name declared in a scope the reference is not inside, which is not the name the reference means;
- a name bound by an enclosing **type parameter** (`function getUserRef<User>(...)`), which is an opaque generic rather than the outer declaration of the same name — the search stops at the type parameter instead of reaching past it. Only type-space binders shadow this way: a value named `User`, such as a parameter or a `catch` binding, leaves the declaration resolvable;
- a type declared in another file, which this rule does not open — the search widens through enclosing scopes, never across an `import`;
- a named empty declaration (`type Empty = {}`, `interface Empty {}`), because the empty-object check targets the `{}` written at the reference.

## Where the schema evidence must live

A return type annotation is not a durable place to declare a Firestore document schema. `no-explicit-return-type` ships in the same `recommended` config and is fixable, so a single `eslint --fix` deletes the annotation. Whatever schema only the annotation described is gone from the program afterwards — the reference widens to `DocumentData` — and this rule reports it.

This rule therefore reads the **expression** a class member returns, not just its annotation. A collection whose type argument is written at the call site keeps supplying the document shape after the annotation is stripped:

```ts
class ConfigService {
  // Correct: the generic is at the call site, so nothing can strip it.
  private getSettingsCollection() {
    return db.collection<Settings>('settings');
  }

  getSettingsDoc(id: string) {
    return this.getSettingsCollection().doc(id);
  }
}
```

Both a method and a getter are resolved this way, an explicit annotation still wins where it is present, and a member chain that never reaches a typed collection keeps reporting:

```ts
class ConfigService {
  // Incorrect: no annotation and no call-site generic — no schema anywhere.
  private getSettingsCollection() {
    return db.collection('settings');
  }

  getSettingsDoc(id: string) {
    return this.getSettingsCollection().doc(id);
  }
}
```

Which privacy spelling declares the member makes no difference to any of this. `#member` and `private member` express the same privacy and are mutually exclusive — `private #member` is a TypeScript error (TS18010) — so an author on the `#` side could not opt into resolution by adding the modifier even if that were the intent:

```ts
class ConfigService {
  // Correct: read exactly as the `private getSettingsCollection()` above.
  #getSettingsCollection() {
    return db.collection<Settings>('settings');
  }

  getSettingsDoc(id: string) {
    return this.#getSettingsCollection().doc(id);
  }
}
```

The spelling does identify the member, so a `#member` and a public `member` of the same name are never read for one another:

```ts
class ConfigService {
  settings: CollectionReference<Settings> = db.collection<Settings>('settings');

  // Reported: the typed public `settings` above says nothing about `#settings`,
  // which states no schema of its own.
  #settings = db.collection('settings');

  getSettingsDoc(id: string) {
    return this.#settings.doc(id);
  }
}
```

The same applies outside a class. If a function's return annotation is the only place the schema appears, moving the generic to the call site is the fix that survives `--fix`:

```ts
// Fragile: `--fix` removes the annotation and the schema goes with it.
async function getRef(): Promise<DocumentReference<User>> {
  return db.collection('users').doc(userId);
}

// Durable: the generic lives on the expression.
async function getRef() {
  return db.collection<User>('users').doc(userId);
}
```

While an annotation lasts, it counts the same in every spelling. Which keyword introduces the function, and whether the returned expression travels through a `return` statement or is a concise arrow body, are decisions about layout that say nothing about the document shape:

```ts
// All three state the same schema, and all three are silent.
const getRefArrow = async (): Promise<DocumentReference<User>> => {
  return db.collection('users').doc(userId);
};

const getRefConcise = (id: string): DocumentReference<User> =>
  db.collection('users').doc(id);

class UserService {
  getRef(id: string): DocumentReference<User> {
    return db.collection('users').doc(id);
  }
}
```

The boundary is what the annotation describes, which is the value the function returns. A reference the function only builds is reported, however the enclosing function is annotated:

```ts
// Reported: `string` describes the id, not the reference the body constructs.
const getUserId = (): string => {
  const ref = db.collection('users').doc(userId);
  return ref.id;
};
```

## What a type assertion states

An assertion supplies the schema when the type it asserts names a Firestore reference — `db.collection('users') as CollectionReference<User>` is as complete a statement as the annotation `const usersCollection: CollectionReference<User> = ...`. What earns the exemption is the type named, not the assertion's position: an assertion types the references inside the literal it wraps, so `[db.collection('a'), db.collection('b')] as CollectionReference<User>[]` and `{ users: db.collection('users') } as Record<string, CollectionReference<User>>` both state the schema several type nodes away from the call. `Query` counts alongside the three reference types because `.where(...)` narrows a collection to it while keeping the same document generic. A local declaration is resolved first, so `type UsersCollection = CollectionReference<User>` states what it stands for. An interface is read the same way and just as deeply: both what it inherits through `extends` and what its own members declare count, so a reference type held by a member is stated by an assertion that names that member.

```ts
// Silent: the member `Schema['user']` names `DocumentReference<User>`, which
// states the schema as completely as writing that type at the assertion would.
interface Schema {
  user: DocumentReference<User>;
}
const userRef = db.doc('users/1') as Schema['user'];

// Reported: no member of `Config` names a reference type, so it states nothing
// about the document shape and earns no exemption.
interface Config {
  retries: number;
}
const usersCollection = db.collection('users') as unknown as Config;
```

Reading only the `extends` clause would make the two spellings disagree about the same declaration. `prefer-type-over-interface` ships in the same `recommended` config and is fixable, so one `eslint --fix` pass rewrites that interface into the type alias whose members were always read — moving a file from reporting to silent without changing anything it states.

`as const` states no type at all. It preserves whatever the expression already infers to and adds `readonly`, so a reference under one keeps the loose `DocumentData` schema this rule exists to reject:

```ts
// Reported: `as const` freezes the array, it does not type the references.
const COLLECTIONS = [db.collection('users'), db.collection('posts')] as const;

// Silent: the asserted type names the reference type and carries the schema.
const TYPED_COLLECTIONS = [
  db.collection('users'),
  db.collection('posts'),
] as CollectionReference<User>[];
```

This distinction is load-bearing rather than pedantic. `global-const-style` ships in the same `recommended` config and is fixable, and its fix appends exactly ` as const` to a module-scope literal. Crediting any assertion in the enclosing chain would let one `eslint --fix` pass silence every reference inside that literal without changing a byte of the violation.

The same question decides a receiver. `.doc(...)` inherits the schema from a collection asserted as `CollectionReference<T>` — asking for a generic there is uncompilable, since `CollectionReference<T>.doc(path)` declares zero type parameters — while a receiver asserted to something that states no schema hands none on:

```ts
// Silent: the receiver states `Mapping`, and `.doc()` inherits it.
const mappingRef = (
  matchRef.collection('mappings') as CollectionReference<Mapping>
).doc(matchId);

// Reported: `any` states no schema, so the document reference has none.
const untypedRef = (matchRef.collection('mappings') as any).doc(matchId);
```

## Compat Firestore from `@firebase/rules-unit-testing`

`RulesTestContext.firestore()` returns the compat (v8-style) `Firestore`, whose `doc`, `collection`, and `collectionGroup` declare **zero** type parameters. Supplying a generic there is `error TS2558: Expected 0 type arguments, but got 1`, so on that surface every fix this rule suggests is uncompilable. Security-rules tests therefore get an exemption: a `doc`/`collection`/`collectionGroup` call whose receiver traces syntactically back to a value from `@firebase/rules-unit-testing` is not reported.

The trace follows awaits, calls, member access, optional chaining, and type assertions, and it recognizes every import form (named, aliased, default, namespace, and type-only). It also follows two indirections the documented test layout depends on:

- **A local helper**, through what it returns — `const getDb = () => testEnv.authenticatedContext('u').firestore()`, whether written as an arrow, an expression body, or a hoisted `function`.
- **The `withSecurityRulesDisabled` callback parameter**, annotated or not. The seeding block in the Firebase docs writes `async (context) => ...` with no annotation, so the call the callback belongs to is the only evidence of the surface.
- **A provisioner shared through another module of the project**, named by a relative specifier (`'./util/rulesTestEnvironment'`, `'../util/rulesTestEnvironment'`). Extracting the provisioner does not change what it hands back — the handle is the same compat Firestore and `doc<T>(...)` is still `TS2558` — but this rule opens no other file, so the specifier alone cannot say so. Two gates therefore have to hold together, and neither counts on its own:
  - **a relative specifier**, which names a module of the project under lint. A bare specifier names a package, and every published Firestore reached that way (`firebase/firestore`, `firebase-admin/firestore`) does accept the generic, so those roots keep reporting;
  - **the `RulesTestEnvironment` context signature** on the chain itself: `authenticatedContext(...)`/`unauthenticatedContext(...)` followed by `.firestore()`, or the `context.firestore()` handed to a `withSecurityRulesDisabled` callback whose environment traces to such a root.

The exemption is deliberately limited:

- **An unannotated `let`/`var` initializer is refused**, because a later assignment can swap in an Admin SDK handle where the generic is both supportable and valuable. A **declared type is honoured on any binding kind**, including `let`: the environment handle is created in `beforeAll` and so cannot be `const`, and `let testEnv: RulesTestEnvironment` constrains every assignment in a way an initializer alone does not.
- **The receiver decides, not the file.** An Admin SDK reference in a rules test is still reported.
- **Crossing a module boundary is not itself a reason to exempt.** A handle imported from a project module and used without the context signature is reported, and so is a chain that carries the signature but roots in a package. The same `let`/`const` limit applies across the boundary as within the file.
- **The modular `doc(db, path)` function is untouched.** It accepts the generic, so it still requires one.
- **An explicit `DocumentReference` annotation is untouched.** The annotation is written by hand and can carry its generic regardless of the runtime surface.

```ts
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getFirestore } from 'firebase-admin/firestore';

// Declared, not initialized: the annotation is what proves the surface.
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    // Correct: the callback parameter needs no annotation to be recognized.
    await context.firestore().doc('User/owner-uid').set({ username: 'owner' });
  });
});

it('reads', async () => {
  // Correct: the compat surface accepts no type argument.
  const compatDb = testEnv.authenticatedContext('owner-uid').firestore();
  await compatDb.doc('User/uid/OverlaySettings/uid').get();

  // Incorrect: the receiver is an Admin SDK Firestore, which does accept one.
  const adminDb = getFirestore();
  await adminDb.doc('User/uid').get();
});
```

The cross-module carve-out, with both of its gates and the shape each one refuses:

```ts
import { provisionRulesTestEnvironment } from './util/rulesTestEnvironment';
import { adminDb } from './util/adminFirestore';

const getTestEnv = provisionRulesTestEnvironment('demo-project');

export const seed = async () => {
  await getTestEnv().withSecurityRulesDisabled(async (context) => {
    // Correct: the compat handle is the same whichever module built the environment.
    await context.firestore().doc('Tournament/t1').set({ ownerUserId: 'u' });
  });
};

export const probe = async () => {
  // Correct: the chain carries the context signature back to a project module.
  await getTestEnv().authenticatedContext('u').firestore().doc('Tournament/t1').get();

  // Incorrect: a relative import proves nothing on its own, and an Admin SDK
  // handle reached through one accepts the generic like any other.
  await adminDb.doc('Tournament/t1').get();
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

// Nested `any` still erases the document type, in either declaration spelling
type UserProfile = {
  name: string;
  metadata: { audit: any };
};
const userProfileDocRef: DocumentReference<UserProfile> = db.doc('users/123');

interface LegacyProfile {
  metadata: { audit: any };
}
const legacyProfileDocRef: DocumentReference<LegacyProfile> = db.doc('users/456');

// The `export` keyword does not change the fields, so this is reported too
export type SharedProfile = {
  metadata: { audit: any };
};
const sharedProfileDocRef: DocumentReference<SharedProfile> = db.doc('users/789');

// Overriding a typed collection with an unsafe generic
const customerCollection = db.collection<UserProfile>('customers');
const unsafeCustomerDoc = customerCollection.doc<any>('cust123');

// A const assertion freezes the literal without typing what is inside it
const ROOT_COLLECTIONS = [db.collection('users'), db.collection('posts')] as const;
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

// An optional link changes nullability, not the schema
const guardedUsersCollection = db?.collection<UserData>('users');
const guardedUserDoc = guardedUsersCollection.doc('123');

// Using intersection types keeps the schema intact
type BaseData = { id: string; createdAt: Date };
type UserWithBase = UserData & BaseData;
const userWithBaseDoc: DocumentReference<UserWithBase> = db.doc('users/123');

// A return annotation counts on an arrow exactly as it does on a declaration
const getUserDoc = (id: string): DocumentReference<UserData> =>
  db.collection('users').doc(id);

// An assertion naming the reference type states the schema at any depth
const rootCollections = [
  db.collection('users'),
  db.collection('posts'),
] as CollectionReference<UserData>[];

// So does an assertion on the receiver the document reference is built from
const memberDoc = (
  db.collection('members') as CollectionReference<UserData>
).doc('123');

// An ECMA-private member states the schema exactly as a `private` one does
class UserService {
  #usersCollection() {
    return db.collection<UserData>('users');
  }

  getUserDoc(id: string) {
    return this.#usersCollection().doc(id);
  }
}
```

## When Not To Use It

Only disable this rule when you intentionally work with dynamic collections whose shape is unknown and you accept the loss of type safety. Even then, prefer modeling the uncertainty explicitly (e.g., with `unknown` plus runtime validation) instead of relying on `any` or `{}`.
