# Enforce abstraction of private static methods into utility functions (`@blumintinc/blumint/prefer-utility-function-over-private-static`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Private static methods that do not use class state are often better represented as standalone utility functions. This rule suggests extracting such logic to improve reusability and testability.

## Why this rule?

- Standalone utility functions are easier to reuse across different modules.
- Utility functions can be unit tested independently of the class.
- Removing class-agnostic logic reduces the size and complexity of class definitions.

## Examples

### ❌ Incorrect

```ts
export class DataProcessor {
  // Private static method does not use class state
  private static processData(data: any[]) {
    const filtered = data.filter((item) => item.active);
    return filtered.map((item) => item.value);
  }

  public run(data: any[]) {
    return DataProcessor.processData(data);
  }
}
```

Example message:

```text
Private static method "processData" in class "DataProcessor" does not use class state and might be better as a standalone utility function. This rule is a suggestion; architectural placement of logic can be subjective. If you prefer keeping this helper within the class, please use an // eslint-disable-next-line @blumintinc/blumint/prefer-utility-function-over-private-static comment. Otherwise, consider extracting it to a utility function for better reusability and testability.
```

### ✅ Correct

```ts
// Extracted to a utility function
function processData(data: any[]) {
  const filtered = data.filter((item) => item.active);
  return filtered.map((item) => item.value);
}

export class DataProcessor {
  public run(data: any[]) {
    return processData(data);
  }
}
```

### ✅ Correct (With disable comment if class placement is preferred)

```ts
export class DataProcessor {
  // eslint-disable-next-line @blumintinc/blumint/prefer-utility-function-over-private-static
  private static internalHelper(data: any) {
    return /* ... */;
  }
}
```

## When Not To Use It

Disable this rule if you prefer keeping all related logic within the class for better encapsulation or if the class is designed to be a self-contained unit of functionality. Use an `// eslint-disable-next-line @blumintinc/blumint/prefer-utility-function-over-private-static` comment for local exceptions.

## Further Reading

- [Refactoring: Extract Function](https://refactoring.com/catalog/extractFunction.html)
- [Class-based vs Functional Utilities](https://stackoverflow.com/questions/4311111/static-methods-vs-instance-methods)
