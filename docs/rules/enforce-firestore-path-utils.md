# Enforce usage of utility functions for Firestore paths to ensure type safety, maintainability, and consistent path construction. This prevents errors from manual string concatenation and makes path changes easier to manage (`@blumintinc/blumint/enforce-firestore-path-utils`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Manually concatenating Firestore collection or document paths leads to brittle strings and easy mistakes when schemas change. This rule requires using path helper functions (named `to*Path`) instead of string literals or template literals when calling `firestore.doc()` or `firestore.collection()`.

## Rule Details

This rule reports when:

- The first argument of `firestore.doc(...)` or `firestore.collection(...)` is a string or template literal instead of a path helper.
- The first argument is a `+` concatenation containing a string or template literal anywhere in the chain (for example `'teams/' + teamId + '/members'`), because that assembles a hard-coded path fragment inline.
- The call lives outside of tests (`.test.`, `.spec.`, or `__tests__` paths are ignored).

The rule allows:

- Calls whose path argument is already produced by a helper named like `toUserPath(...)`.
- Path expressions that hide construction behind a name (variables, function calls, or other expressions) because those are likely already indirection helpers.
- Concatenations of opaque operands only (for example `basePath + userId`), since no path fragment is written inline.
- Bare calls with no receiver. The `doc`/`collection` callee must be an explicit member access, so `db.doc('users/1')` is reported while a bare `doc(db, 'users/1')` is not. This keeps unrelated functions named `doc` or `collection` out of scope, and means the modular SDK (whose path is the second argument) is not covered.

### Examples of **incorrect** code for this rule:

```ts
// Inline strings
firestore.doc('users/' + userId);
firestore.doc(`users/${userId}/posts/${postId}`);
firestore.collection('users');

// Template literal computed inline
const ref = firestore.doc(`${prefix}/${id}`);

// Concatenation, including nested chains and mixed template literals
firestore.collection('teams/' + teamId + '/members');
firestore.doc(`users/${userId}` + '/settings');
firestore.doc(userId + '/settings');
```

### Examples of **correct** code for this rule:

```ts
// Use dedicated helpers
const toUserPath = (id: string) => `users/${id}`;
const toPostPath = (userId: string, postId: string) =>
  `users/${userId}/posts/${postId}`;

firestore.doc(toUserPath(userId));
firestore.doc(toPostPath(userId, postId));
firestore.collection(toUsersCollectionPath());

// Non-literal expressions are allowed
firestore.doc(nextPathFromState(state));

// Concatenation without an inline path fragment is allowed
firestore.doc(basePath + userId);
```

## When Not To Use It

- Prototype scripts or quick migrations where path helper churn is not a concern.
- Projects that already enforce path generation via other tooling (e.g., Firestore ORM) and do not call `doc`/`collection` directly.

## Further Reading

- [Firestore best practices: avoid hard-coded paths](https://firebase.google.com/docs/firestore/manage-data/structure-data)
