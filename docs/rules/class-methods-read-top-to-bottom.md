# Enforces a top-to-bottom class layout so callers lead into the helpers they rely on (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Your classes should read like a top-to-bottom story: your fields (properties) establish state, your constructor introduces the entry path, and each caller appears before the helper it relies on. When members fall out of that sequence, you force readers to jump backward to rediscover dependencies and control flow. This rule keeps your class layout linear so callers lead into the helpers they rely on.

## Rule Details

- Keep your fields at the top so state is established first.
- Place the constructor before other methods.
- Keep callers above the methods they invoke so you can scan downward without backtracking.

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

In the correct version, fields lead, the constructor sets the initial flow, and each caller appears before the helper it relies on, allowing the class to be read straight down. When the rule reports a violation, move the reported dependency above the caller so the class flows from state, to constructor, to callers, and finally to helpers—no backward scrolling required.
