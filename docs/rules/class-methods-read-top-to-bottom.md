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

  methodA() { // ❌ methodA appears before constructor
    this.methodB();
  }

  constructor() {
    this.methodA();
    this.methodC(); // ℹ️ methodC is a helper defined later
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

## Abstract classes

Abstract member signatures—abstract methods (`protected abstract foo(): number;`), abstract properties, and abstract accessors—participate in the ordering exactly like concrete members: a caller still precedes the abstract helper it invokes, and the autofix relocates the signature rather than dropping it.

## Non-destructive autofix

The autofix rewrites the class body from the members the rule tracks. To guarantee it never removes source it does not track, it bails when the class contains a member it cannot safely relocate—such as a `static {}` initialization block or a computed-key method—leaving the class untouched instead of emitting a body that would omit that member.
