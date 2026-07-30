# Enforce usage of utility functions for Realtime Database paths (`@blumintinc/blumint/enforce-realtimedb-path-utils`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Inline Realtime Database paths scatter string literals throughout the codebase and make schema changes risky. This rule requires using helper functions (named `to*Path`) when building paths for `ref()` or `child()` so that path construction stays centralized and type-safe.

## Rule Details

This rule reports when:

- A call to `firebase.database().ref(...)` / `admin.database().ref(...)` or `.child(...)` (including chained `ref().child()`) uses a string or template literal as the first argument. The `.database()` receiver must be an explicit member access in the call chain; a bare `database()` call is not recognized, so a local helper of that name is never flagged.
- The offending call is not already using a `to*Path` helper.
- The file is not a test or mock file (it skips `__tests__`, `.test.`, `.spec.`, and `mocks`).

The rule allows:

- Path arguments produced by helper functions like `toUserPath(userId)`.
- Non-literal expressions (variables, results of other functions) because they already provide indirection.
- Concatenated expressions such as `'users/' + userId`, because the rule only inspects string and template literals.

### Examples of **incorrect** code for this rule:

```ts
// Direct literals
firebase.database().ref(`users/${userId}/settings/${settingId}`);
admin.database().ref('users/123');

// Using child with inline strings
firebase.database().ref('users').child(userId).child('posts');
```

### Examples of **correct** code for this rule:

```ts
const toUserPath = (id: string) => `users/${id}`;
const toUserSettingsPath = (userId: string, settingId: string) =>
  `users/${userId}/settings/${settingId}`;

firebase.database().ref(toUserPath(userId));
firebase.database().ref(toUserSettingsPath(userId, settingId));
firebase.database().ref(toUsersPath()).child(userId);
```

## When Not To Use It

- One-off scripts where centralizing RTDB paths provides little value.
- Projects that already enforce path helpers through other means (schema mappers, ORMs).
