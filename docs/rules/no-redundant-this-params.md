# Disallow passing class instance members (this.foo) into class instance methods; access the member from this inside the method instead (`@blumintinc/blumint/no-redundant-this-params`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Passing `this.foo` into a class method duplicates instance state that the method already owns. It turns a shared class contract into parameter plumbing, inflates signatures, and makes refactors brittle. This rule reports a call to a method defined on the same class where an argument (directly or inside an object/array) is an instance member accessed via `this`.

Two conditions must also hold, so that removing the parameter is provably safe. Both are described under [What the rule allows](#what-the-rule-allows): the method must not be reachable from outside the file, and every visible call site must pass the same member in that argument slot. In practice the rule fires on `private` methods and on classes that are neither exported nor `abstract`.

### ✅ Correct

```typescript
class CoinflowProcessorPropsExtractor {
  constructor(private readonly event: CoinflowEvent) {}

  public extract() {
    if (isPurchaseEvent(this.event)) {
      return this.buildProps();
    }
  }

  private buildProps() {
    return {
      [this.event.eventType]: {
        event: this.event,
      },
    };
  }
}
```

### ❌ Incorrect

```typescript
class CoinflowProcessorPropsExtractor {
  constructor(private readonly event: CoinflowEvent) {}

  public extract() {
    if (isPurchaseEvent(this.event)) {
      return this.buildProps(this.event); // Passing this.event is redundant
    }
  }

  private buildProps(event: CoinflowEvent) {
    return {
      [event.eventType]: { event },
    };
  }
}
```

### Why this matters

- Keeps class methods aligned with the shared `this` contract instead of parameter drilling.
- Simplifies signatures and avoids refactors that touch every call site when instance state changes.
- Prevents the refactoring mistake of carrying over function-style parameters after moving logic into classes.

## What the rule flags

- `this.method(this.config)` when `method` is defined on the same class (private/protected/public/field arrow methods).
- Redundant members inside objects/arrays passed to a class method, e.g. `this.request({ url: this.baseUrl })`.
- Calls from constructors and regular methods alike.
- Passing getters as arguments, e.g. `this.handle(this.userId)`.
- Multiple redundant arguments are reported separately.

## What the rule allows

- **Externally reachable methods.** A non-`private` method of an exported or `abstract` class is never reported: a subclass or caller in another file may thread a different `this.<member>` through that parameter, so dropping it would be unsafe (issue #1309). The exemption keys on the method, not the class — a `private` (or `#name`) method is still reported inside an exported or abstract class, because private methods are never inherited and all of their call sites live in the declaring body. An `abstract` method can never be reported, since it cannot be `private` and its class is extensible by definition.
- **Methods whose visible call sites disagree.** A report requires that *every* call to the method in the file passes the same `this.<member>` in that argument slot. A single call site passing something else means the parameter genuinely varies, so the method is left alone.
- Parent method calls (`super.method(...)`).
- Methods not declared on the current class (inherited/external utilities).
- Invocations inside callbacks or nested functions (e.g. within `map`/`reduce` lambdas).
- Computed member access (`this[key]`) and other dynamic lookups.
- Passing `this` members to external libraries or static methods.
- Invoking the return value of a `get`/`set` accessor, e.g. `this.callback(this.event)` where `callback` is a getter — the call evaluates the accessor (with no arguments) and invokes its returned value, which may be an external function that has no access to `this` and legitimately needs instance state passed in.
- Passing transformed values derived from `this` members (e.g. `JSON.stringify(this.config)`), since the method receives the derived value rather than the raw instance state.

## Notes

- No options are available. A redundant instance argument is reported only when both conditions above hold — the method is not externally reachable, and every visible call site passes the same member in that slot.
- Exporting a class silences the rule for its non-`private` methods. To keep the check on an exported class, mark the callee `private`, which is what the redundant-parameter shape usually calls for anyway.
- Fixing requires removing the parameter from the method signature and reading the member via `this` inside the method body.
