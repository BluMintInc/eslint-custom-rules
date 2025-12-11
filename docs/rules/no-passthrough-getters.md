# Disallow passthrough getters that merely mirror constructor params

Rule ID: `@blumintinc/blumint/no-passthrough-getters`

💼 Enabled in ✅ `recommended` config • 🔧 Not fixable • 💭 No type info required

<!-- end auto-generated rule header -->

## Rule Details

This rule identifies and discourages the use of unnecessary getter methods that simply return properties from a class's constructor parameters (like `this.settings.property`). These redundant getters add complexity without providing value, make the code harder to maintain, and introduce potential for errors when developers mistakenly access the wrong field. The rule promotes direct access to constructor parameters when appropriate, resulting in more maintainable and less error-prone code.

## Examples

### ❌ Incorrect

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

Getters should be used when they provide value beyond simple property access, such as when they:

1. **Perform calculations or transformations**
2. **Apply conditional logic**
3. **Provide memoization** (with `@Memoize` decorator)
4. **Encapsulate more complex property access**
5. **Handle null/undefined values**
6. **Include type assertions or casting**
7. **Access parent class properties** (using `super`)

Simple property access doesn't warrant the additional abstraction layer of a getter.

## Edge Cases

The rule automatically exempts getters in the following scenarios:

- **Memoization**: Getters decorated with `@Memoize()` or other decorators
- **Null/undefined handling**: Getters using logical operators (`||`, `??`) or conditional expressions
- **Type assertions**: Getters that include type casting (`as Type`)
- **Parent class access**: Getters that use the `super` keyword
- **Optional chaining**: Getters using optional chaining (`?.`)
- **Complex logic**: Getters with more than a simple return statement

## Why This Rule Exists

This rule helps prevent code bloat and maintains clarity by discouraging unnecessary abstraction. It encourages developers to:

- Write more direct and readable code
- Reduce the cognitive overhead of understanding class interfaces
- Minimize potential points of failure
- Avoid creating unnecessary indirection layers
- Focus getter usage on cases where they provide actual value

By following this rule, codebases become more maintainable and less prone to errors caused by accessing the wrong property or method.
