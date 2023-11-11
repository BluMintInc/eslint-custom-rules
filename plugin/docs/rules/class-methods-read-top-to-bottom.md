# Try to keep classes reading top to bottom (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

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
