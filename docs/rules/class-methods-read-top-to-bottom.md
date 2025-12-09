# Ensures classes read linearly from top to bottom (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Classes should read like a top-to-bottom story: fields establish state, the constructor introduces the entry path, and each caller appears before the helper it relies on. When members appear out of that sequence, readers must jump backward to rediscover dependencies and control flow. This rule keeps the class layout linear so callers lead into the helpers they rely on.

## Rule Details

- Fields belong at the top, ordered by static and accessibility priority.
- Constructors come before other methods.
- Callers stay above the methods they invoke so readers can scan downward without backtracking.

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

In the correct version, properties lead, the constructor sets the initial flow, and each caller appears before the helper it relies on, allowing the class to be read straight down. When the rule reports a violation, move the reported dependency above the caller so the class flows from state, to constructor, to callers, and finally to helpers—no backward scrolling required.
