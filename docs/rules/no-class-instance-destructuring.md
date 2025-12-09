# Disallow destructuring of class instances to prevent loss of `this` context (`@blumintinc/blumint/no-class-instance-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Destructuring a class instance pulls methods and getters into standalone variables. Once detached, those members lose their implicit `this` context and getters become one-time snapshots, which leads to runtime errors or stale reads when they are invoked later. This rule keeps member access tied to the originating instance so the dependency on `this` stays obvious and you can bind methods explicitly when you need to pass them around.

### ❌ Incorrect

```ts
class Example {
  getName() {
    return this.name;
  }
}
const example = new Example();
const { getName } = example;

const { cohorts } = new BracketChunker(data);
```

### ✅ Correct

```ts
const example = new Example();
const getName = example.getName; // bind when passing around: example.getName.bind(example)

const cohorts = new BracketChunker(data).cohorts;
```

### Auto-fix

The fixer rewrites destructuring into direct property access (for example, `const { value } = holder;` becomes `const value = holder.value;`). Bind methods yourself if you need to invoke them away from the instance.
