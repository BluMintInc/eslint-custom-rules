# Enforce usage of utility functions for Realtime Database paths (`@blumintinc/blumint/enforce-realtimedb-path-utils`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Inline Realtime Database paths scatter string literals throughout the codebase and make schema changes risky. This rule requires using helper functions (named `to*Path`) when building paths for `ref()` or `child()` so that path construction stays centralized and type-safe.

## Rule Details

This rule reports when:

- A call to `database().ref(...)` or `.child(...)` (including chained `ref().child()`) uses a string or template literal as the first argument.
- The offending call is not already using a `to*Path` helper.
- The file is not a test or mock file (it skips `__tests__`, `.test.`, `.spec.`, and `mocks`).

The rule allows:

- Path arguments produced by helper functions like `toUserPath(userId)`.
- Non-literal expressions (variables, results of other functions) because they already provide indirection.

### Examples of **incorrect** code for this rule:

```ts
// Direct literals
database().ref('users/' + userId);
database().ref(`users/${userId}/settings/${settingId}`);

// Using child with inline strings
database().ref('users').child(userId).child('posts');
```

### Examples of **correct** code for this rule:

```ts
const toUserPath = (id: string) => `users/${id}`;
const toUserSettingsPath = (userId: string, settingId: string) =>
  `users/${userId}/settings/${settingId}`;

database().ref(toUserPath(userId));
database().ref(toUserSettingsPath(userId, settingId));
database().ref(toUsersPath()).child(userId);
```

## Options

This rule does not have any options.

## When Not To Use It

- One-off scripts where centralizing RTDB paths provides little value.
- Projects that already enforce path helpers through other means (schema mappers, ORMs).
