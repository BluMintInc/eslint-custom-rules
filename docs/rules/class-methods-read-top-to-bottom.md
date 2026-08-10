# Enforces a top-to-bottom class layout so callers lead into the helpers they rely on (`@blumintinc/blumint/class-methods-read-top-to-bottom`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Your classes should read like a top-to-bottom story: your fields (properties) establish state, your constructor introduces the entry path, and each caller appears before the helper it relies on. When members fall out of that sequence, you force readers to jump backward to rediscover dependencies and control flow. This rule keeps your class layout linear so callers lead into the helpers they rely on.

## Rule Details

- Keep your fields at the top so state is established first.
- Place the constructor before other methods.
- Keep callers above the methods they invoke so you can scan downward without backtracking.

### Member ranking

Fields come first, then the constructor, then methods ordered so that each caller precedes the helpers it invokes. Members that no other member calls—and members with no calls of their own—are ranked by their modifiers instead:

1. `static` members before instance members.
2. Within each group, `public`, then members with no accessibility modifier, then `protected`, then `private`. That is the conventional TypeScript layout: the public API leads, the extension points a subclass overrides follow, and the internals sit last.

### What counts as a dependency

A member is a dependency of a method when the method reads it through `this.<member>`, or through `<ClassName>.<member>` for a static. The enclosing syntax is irrelevant: a call inside `try`/`catch`/`finally`, a `switch`, any loop, a labeled block, a template literal, an optional chain (`this?.helper()`, `this.helper?.()`) or a nested arrow function counts exactly as much as one written at the top of the body. A method referenced without being called—passed as a callback, for instance—counts too.

Names alone never create a dependency. A local variable, a parameter, a destructured binding, a `catch` binding or an imported function that merely shares a member's name is a different binding, so it does not pull that member anywhere. For the same reason, `this` inside a nested non-arrow `function () {}` denotes that function's own receiver rather than the instance, and `super.helper()` names the base class's member, so neither creates a dependency on this class's member.

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

The rewrite also preserves the class body's existing whitespace: the newline and indentation after `{`, the blank lines separating members, and the newline before `}` are all carried over verbatim rather than collapsed. Each member keeps its own leading comments, so documentation travels with the member it describes.

Blank lines are preserved positionally—the gap between the first and second member stays between the first and second member, whatever ends up in those slots. This keeps a body's visual rhythm and its total blank-line count intact. Preserving them matters because Prettier keeps existing blank lines but never inserts new ones, so a blank line the autofix deleted could not be restored by reformatting.
