# Avoid getter methods that only re-expose nested properties on constructor-injected objects without adding behavior (`@blumintinc/blumint/no-passthrough-getters`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule flags getters that only forward a constructor-injected object property (for example `this.settings.uid`) without adding logic. Passthrough getters expand your public API without adding behavior, hide where state actually lives, and force you to keep extra names in sync. You should prefer direct property access or add meaningful logic (validation, memoization, fallbacks, transformation) that justifies the getter.

### Why it matters

- A passthrough getter hides the real state location (`this.settings.uid`) behind another name, which slows down your debugging and code navigation.
- Every extra getter increases your class surface area; you and your callers must learn both `otherResults` and `settings.otherResults` even though only one is real data.
- Indirection invites drift: if invariants change on the constructor parameter, the passthrough getter can mask that your data source changed.

### How to fix

- Access the constructor parameter directly where you use it.
- If indirection is valuable, add logic that earns the getter: memoization, validation, transformations, or defensive defaults.

## Examples

### ❌ Incorrect

The following example shows a class with passthrough getters that simply return properties from the constructor-injected `settings` object without adding any logic or transformation:

```typescript
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // Unnecessary getter that just returns a property from settings
  private get otherResults() {
    return this.settings.otherResults;
  }

  // Another unnecessary getter
  private get uid() {
    return this.settings.uid;
  }

  public doSomething() {
    // Using the getter
    const results = this.otherResults;
    // ...
  }
}
```

### ✅ Correct

Here's the same class refactored to access the `settings` properties directly, eliminating the unnecessary indirection:

```typescript
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  public doSomething() {
    // Directly accessing the property
    const results = this.settings.otherResults;
    // ...
  }
}
```

### ✅ Correct (Valid getter use cases)

```typescript
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // Getter with memoization decorator - allowed
  @Memoize()
  private get computedResults() {
    return this.settings.otherResults.filter(result => result.isValid);
  }

  // Getter with null/undefined handling - allowed
  private get safeResults() {
    return this.settings.otherResults || [];
  }

  // Getter with type assertion - allowed (provides a safer, narrowed API surface)
  private get typedResults(): ValidResult[] {
    return this.settings.otherResults as ValidResult[];
  }

  // Getter accessing parent class property - allowed
  // (override for access control or to normalize/validate parent value)
  private get parentProperty() {
    return super.parentProperty;
  }

  // Getter with conditional logic - allowed
  private get processedResults() {
    return this.settings.otherResults?.length > 0
      ? this.settings.otherResults
      : this.getDefaultResults();
  }
}
```

## When to Use Getters

Use a getter only when it adds behavior beyond simple property access, for example:

1. **Perform calculations or transformations**
1. **Apply conditional logic**
1. **Provide memoization** (with `@Memoize` decorator)
1. **Encapsulate more complex property access**
1. **Handle null/undefined values**
1. **Include type assertions or casting**
1. **Access parent class properties** (using `super`)

Simple property access alone does not justify a getter.

## Edge Cases the Rule Ignores

The rule intentionally allows getters that already add meaningful handling:

- Decorated getters (for memoization or other behaviors)
- Null/undefined handling with logical operators or conditional expressions
- Type assertions or casting
- Access to parent class properties via `super`
- Optional chaining
- Any getter whose body contains anything besides a single bare `return` statement
