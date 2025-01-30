# Ensures classes read linearly from top to bottom (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces an ordering of class methods according to BluMint's code style.

## Rule Details

This rule warns for classes that don't follow the 'top to bottom' ordering - such that properties appear at the top of the class, the constructor (if present) follows, and other methods follow in a top-to-bottom order.

### Examples of incorrect code for this rule:

```typescript
class IncorrectlyOrdered {
    field1: string;
    field2: number;
    methodA() {
    this.methodB();
    }
    constructor() {
    this.methodA();
    this.methodC();
    }
    methodB() {}
    methodC() {}
}
```

### Examples of correct code for this rule:
```typescript
class CorrectlyOrdered {
    field1: string;
    field2: number;
    constructor() {
        this.methodA();
    }
    methodA() {
        this.methodB();
    }
    methodB() {}
}
```
