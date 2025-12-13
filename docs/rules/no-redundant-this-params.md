# Disallow redundant `this` arguments in class methods (`@blumintinc/blumint/no-redundant-this-params`)

💼 This rule is enabled in the ✅ `recommended` config.  
🔧 Not fixable with `--fix`.  
💭 No type information required.

<!-- end auto-generated rule header -->

## Rule Details

Passing `this.foo` into a class method duplicates instance state that the method already owns. It turns a shared class contract into parameter plumbing, inflates signatures, and makes refactors brittle. This rule reports any call to a method defined on the same class where an argument (directly or inside an object/array) is an instance member accessed via `this`.

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

- `this.method(this.config)` when `method` is defined on the same class (private/protected/public/abstract/field arrow methods).
- Redundant members inside objects/arrays passed to a class method, e.g. `this.request({ url: this.baseUrl })`.
- Calls from constructors and regular methods alike.
- Passing getters as arguments, e.g. `this.handle(this.userId)`.
- Multiple redundant arguments are reported separately.

## What the rule allows

- Parent method calls (`super.method(...)`).
- Methods not declared on the current class (inherited/external utilities).
- Invocations inside callbacks or nested functions (e.g. within `map`/`reduce` lambdas).
- Computed member access (`this[key]`) and other dynamic lookups.
- Passing `this` members to external libraries or static methods.
- Passing transformed values derived from `this` members (e.g. `JSON.stringify(this.config)`), since the method receives the derived value rather than the raw instance state.

## Notes

- No options are available; the rule always reports redundant instance arguments.
- Fixing requires removing the parameter from the method signature and reading the member via `this` inside the method body.
