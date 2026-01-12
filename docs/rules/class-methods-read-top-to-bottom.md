# Suggest a top-to-bottom class layout so callers lead into the helpers they rely on (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keeping class members organized in a top-to-bottom layout (fields → constructor → callers → helpers) enables local reasoning. This rule suggests an order where you can verify each caller without scrolling back up the file.

## Why this rule?

- Top-down flow enables local reasoning: you can verify each caller without scrolling back.
- Upward jumps make code reviews harder because you must verify call chains in reverse.
- Consistent member ordering obscures which fields a helper assumes are initialized.

## Examples

### ❌ Incorrect

```ts
class TestClass {
  methodA() {
    this.methodB();
  }
  
  constructor() {
    this.methodA();
  }
  
  methodB() {}
}
```

Example message:

```text
In TestClass, methodA appears before constructor. This rule suggests a top-to-bottom class layout for better readability. Architectural preference for member ordering can vary. If this layout is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/class-methods-read-top-to-bottom comment. Otherwise, consider moving constructor above methodA.
```

### ✅ Correct

```ts
class TestClass {
  constructor() {
    this.methodA();
  }
  
  methodA() {
    this.methodB();
  }
  
  methodB() {}
}
```

### ✅ Correct (With disable comment if layout is intentional)

```ts
class CustomLayout {
  // eslint-disable-next-line @blumintinc/blumint/class-methods-read-top-to-bottom
  helperFirst() {}
  
  mainMethod() {
    this.helperFirst();
  }
}
```

## When Not To Use It

Disable this rule if you prefer a different class layout (e.g., public members before private members regardless of call order) or if the rule's suggestions conflict with your project's architectural style. Use an `// eslint-disable-next-line @blumintinc/blumint/class-methods-read-top-to-bottom` comment for local exceptions.

## Further Reading

- [Clean Code: Vertical Distance](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter05.html#ch5lev1sec5)
- [Refactoring: Replace Constructor with Factory Function](https://refactoring.com/catalog/replaceConstructorWithFactoryFunction.html)
