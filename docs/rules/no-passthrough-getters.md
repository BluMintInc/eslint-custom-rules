# Avoid getter methods that only re-expose nested properties on constructor-injected objects without adding behavior (`@blumintinc/blumint/no-passthrough-getters`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Creating getters that only forward nested properties from objects provided via the constructor adds unnecessary indirection and expands the class API without adding value. This rule suggests reading the injected object directly or adding behavior to the getter.

## Why this rule?

- Direct property access is clearer and faster than a passthrough getter.
- Indirection hides the real source of state, making it harder to trace data flow.
- A proliferation of passthrough getters bloats the class interface.

## Examples

### ❌ Incorrect

```ts
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // Passthrough getter adds no behavior
  private get otherResults() {
    return this.settings.otherResults;
  }
}
```

Example message:

```text
Getter "otherResults" only forwards "this.settings.otherResults" from a constructor-injected object. This rule is a suggestion; simple delegation can sometimes be a valid design choice for API stability or internal readability. If this passthrough is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/no-passthrough-getters comment. Otherwise, consider reading the injected object directly or adding behavior to this getter.
```

### ✅ Correct

```ts
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // Getter with calculation adds value
  private get calculatedResults() {
    return this.settings.otherResults.filter(result => result.isValid);
  }

  // Using decorator for memoization justifies the getter
  @Memoize()
  private get otherResults() {
    return this.settings.otherResults;
  }
}
```

### ✅ Correct (With disable comment if passthrough is intentional)

```ts
export class MatchAdmin {
  constructor(private readonly settings: MatchAdminProps) {}

  // eslint-disable-next-line @blumintinc/blumint/no-passthrough-getters
  get publicAlias() {
    return this.settings.internalProperty;
  }
}
```

## When Not To Use It

Disable this rule if you are intentionally using passthrough getters to maintain API compatibility, hide internal object structures, or follow a specific architectural pattern that requires getters. Use an `// eslint-disable-next-line @blumintinc/blumint/no-passthrough-getters` comment for local exceptions.
