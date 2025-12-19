# Enforce that functions with an assert prefix must throw an error or call process.exit(1), and functions that call assert-prefixed methods should themselves be assert-prefixed (`@blumintinc/blumint/enforce-assert-throws`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Assert-prefixed helpers are meant to be fail-fast guards: they signal invariants, throw when those invariants break, and stop execution so the caller cannot proceed in an invalid state. If an assert helper silently returns, it hides the failure. Likewise, when a function calls an assert helper but does not carry the `assert-` prefix, callers cannot tell it will terminate on failure and may keep running after an assertion aborts. This rule enforces both sides of that contract so assertion failures are explicit and predictable.

## Rule Details

- Assert-prefixed functions must throw an error, call `process.exit(1)`, or delegate to another assert helper to stop execution on failure.
- Any function that calls an assert-prefixed helper must itself use the `assert-` prefix to communicate that it can terminate execution.

### Examples of **incorrect** code for this rule:

```typescript
function assertValidUser(user: User) {
  return Boolean(user); // Fails to throw or exit, so the assert prefix misleads callers.
}
```

```typescript
function validateInput(input: unknown) {
  assertNotNull(input); // Calls a fail-fast helper but the name does not signal it may terminate.
}
```

```typescript
class SessionManager {
  assertSessionActive() {
    const result = this.checkAuth(); // No throw/exit/delegation to an assert helper.
    return result;
  }
}
```

### Examples of **correct** code for this rule:

```typescript
function assertValidUser(user: User) {
  if (!user) {
    throw new Error('User is required');
  }
}
```

```typescript
function assertInputPresent(input: unknown) {
  assertNotNull(input); // Delegates to another assert helper; naming matches behavior.
}
```

```typescript
function assertSessionActive() {
  if (!isAuthenticated()) {
    process.exit(1);
  }
}
```

```typescript
function canDeleteUser(user: User) {
  return isAdmin(user); // No assert helpers invoked, so no assert- prefix is needed.
}
```

## When Not To Use It

If your project does not treat `assert-` as a fail-fast naming convention or you prefer non-terminating validation helpers, you can disable this rule and rely on other patterns to signal control-flow expectations.
