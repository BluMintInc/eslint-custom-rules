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

### Visibility is what makes a getter redundant

The rule compares the getter's accessibility against the accessibility of the
member it forwards, and only reports when the getter reaches no further than
that member. A `private get` over a `private readonly settings` is redundant
because every caller it has already reads `this.settings.uid`; the same holds
for `protected` over `protected` and `public` over `public`.

A getter that reaches **further** than its root is the encapsulation boundary
rather than indirection over it, and is not reported:

```typescript
export class WalletTokenFormatter {
  constructor(private readonly props: WalletTokenFormatterProps) {}

  // Allowed: `props` is private, so this getter is the only read path
  // an external caller — or a subclass — has for the ticker.
  public get ticker() {
    return this.props.metadata.ticker;
  }
}
```

Neither remedy above exists in that shape. An external caller cannot write
`formatter.props.metadata.ticker`, and TypeScript rejects `this.props` outright
inside a subclass of a class that declares `props` private, so the only way to
follow "access the constructor parameter directly" is to widen the parameter
itself and expose the whole injected object.

The root is resolved whether it is a constructor parameter property, a
separately declared field, an accessor, an `#`-private field, or a member
inherited from a base class.

#### `#`-private members rank as `private`

An `#`-prefixed member carries no accessibility modifier while reaching no
further than the class body — the same reach TypeScript's `private` has — so
both sides of the comparison score it as `private`. This applies to the
**getter** as well as to the root:

```typescript
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // Reported: `#uid` reaches no further than `settings`. Every caller it has
  // sits in this class body, where `this.settings.uid` is already readable.
  get #uid() {
    return this.settings.uid;
  }
}
```

`private #uid` is a TypeScript error (TS18010, "An accessibility modifier
cannot be used with a private identifier"), so `get #uid()` is the only way to
spell this member — there is no modifier spelling that opts it into or out of
the rule.

The mirror case is still exempt: a `protected` or `public` getter over an
`#`-private root reaches an audience (a subclass, an external caller) that
cannot read `this.#settings` at all, so that getter is the boundary.

`#settings` and `settings` are separate members that may coexist in one class,
and the rule scores whichever one the getter actually forwards.

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
1. **Expose a less visible member to a wider audience** (a `public` getter over a `private` field)

Simple property access alone does not justify a getter, unless the getter is the
audience's only access path.

## Edge Cases the Rule Ignores

The rule intentionally allows getters that already add meaningful handling:

- Decorated getters (for memoization or other behaviors)
- Null/undefined handling with logical operators or conditional expressions
- Type assertions or casting
- Access to parent class properties via `super`
- Optional chaining
- Any getter whose body contains anything besides a single bare `return` statement
- Getters required to satisfy an implemented interface or an inherited member
- Getters that are more visible than the member they forward
