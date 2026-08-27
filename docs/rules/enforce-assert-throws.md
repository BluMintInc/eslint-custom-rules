# Enforce that functions with an assert prefix must throw an error or call process.exit(1), and functions that call assert-prefixed methods should themselves be assert-prefixed (`@blumintinc/blumint/enforce-assert-throws`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Assert-prefixed helpers are meant to be fail-fast guards: they signal invariants, throw when those invariants break, and stop execution so the caller cannot proceed in an invalid state. If an assert helper silently returns, it hides the failure. Likewise, when a function calls an assert helper but does not carry the `assert-` prefix, callers cannot tell it will terminate on failure and may keep running after an assertion aborts. This rule enforces both sides of that contract so assertion failures are explicit and predictable.

## Rule Details

- Assert-prefixed functions must throw an error, call `process.exit(1)`, or delegate to another assert helper to stop execution on failure.
- Any function that calls an assert-prefixed helper must itself use the `assert-` prefix to communicate that it can terminate execution.
- A class member is checked by its name alone, whichever way its privacy is spelled. `#assertFoo`, `private assertFoo` and a public `assertFoo` are all assert helpers, and `this.#assertFoo()` counts as calling one: the `#` sigil marks privacy, not the name. A `#` member is reported under the name as written (`#assertFoo`), which keeps it distinct from a sibling of the same name.
- A member is also checked by its name alone whichever way the member itself is spelled. `assertFoo = () => {}` and `assertFoo = async function () {}` declare the same member as `assertFoo() {}`, so writing `=` in front of it changes nothing this rule judges: the assert- contract is about the control flow a caller of `this.assertFoo()` can expect, which reads the same whether the function sits on the prototype or on the instance. A key with no static name is checked in neither spelling — a computed key (`[key] = () => {}`) names an expression rather than a member, and a `declare` field states a type with no body to inspect.

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

```typescript
class SessionManager {
  #assertSessionActive() {
    return this.checkAuth(); // An ECMA private member is still an assert helper.
  }
}
```

```typescript
class SessionManager {
  private endSession() {
    this.#assertSessionActive(); // Calls an assert helper without the assert- prefix.
  }

  #assertSessionActive() {
    throw new Error('Session is not active');
  }
}
```

```typescript
class SessionManager {
  assertSessionActive = (id: string) => {
    return this.checkAuth(id); // A field holding the function is the same member as a method.
  };
}
```

```typescript
class SessionManager {
  public endSession = async (id: string) => {
    this.assertSessionActive(id); // Calls an assert helper without the assert- prefix.
  };

  assertSessionActive(id: string) {
    throw new Error('Session is not active');
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

```typescript
class SessionManager {
  private assertSessionActive(id: string) {
    return this.#assertKnownSession(id); // Delegating to a `#` assert helper is still delegation.
  }

  #assertKnownSession(id: string) {
    throw new Error('Unknown session');
  }
}
```

```typescript
class SessionManager {
  assertSessionActive = (id: string) => {
    if (!this.checkAuth(id)) {
      throw new Error('Session is not active');
    }
  };

  endSession = (id: string) => {
    this.close(id); // Invokes no assert helper, so no assert- prefix is needed.
  };
}
```

## When Not To Use It

If your project does not treat `assert-` as a fail-fast naming convention or you prefer non-terminating validation helpers, you can disable this rule and rely on other patterns to signal control-flow expectations.
