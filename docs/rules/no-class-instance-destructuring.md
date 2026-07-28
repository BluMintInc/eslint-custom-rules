# Disallow destructuring of class instances to prevent loss of `this` context (`@blumintinc/blumint/no-class-instance-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Destructuring a class instance pulls methods and getters into standalone variables. Once detached, those members lose their implicit `this` context and getters become one-time snapshots. This leads to runtime errors or stale reads when they are invoked later. This rule keeps member access tied to the originating instance so the dependency on `this` stays obvious. Bind methods explicitly when you need to pass them around.

### ❌ Incorrect

```ts
class Example {
  constructor(public name: string) {}

  getName() {
    return this.name;
  }
}
const example = new Example('Ada');
const { getName } = example;

const { cohorts } = new BracketChunker(data);
```

### ✅ Correct

```ts
const example = new Example('Ada');
const getName = example.getName.bind(example);
// Or call through the instance when you do not need to pass it around:
// const name = example.getName();

const cohorts = new BracketChunker(data).cohorts;
```

### Auto-fix

The fixer rewrites destructuring into direct property access (for example, `const { value } = holder;` becomes `const value = holder.value;`). Bind methods yourself if you need to invoke them away from the instance.

The fix is withheld when the destructuring pattern carries a type annotation:

```ts
const { b }: { b: number } = inst;
const { b, c }: SomeType = inst;
```

An annotation types the destructured object as a whole, so it cannot be split across the per-property declarations the fixer emits, and deriving a type for each property would require type information the rule does not have. These cases are reported but left for you to rewrite by hand (for example, `const b: number = inst.b;`).
