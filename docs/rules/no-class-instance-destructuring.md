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

When the source is a `new` expression and more than one member is extracted, the fixer binds the instance once and reads the members off that binding, so the constructor still runs exactly once:

```ts
// Before
const { name, age } = new Person('John', 30);

// After
const person = new Person('John', 30);
const name = person.name;
const age = person.age;
```

The binding is named after the constructor and is numbered (`person2`, `person3`, …) when that name is already visible, so it can never shadow or redeclare an existing one. When the source is already an identifier there is nothing to bind, and a lone member read constructs only once, so neither case introduces a binding:

```ts
const b = inst.b;
const cohorts = new BracketChunker(data).cohorts;
```

Exported members stay exported while the instance binding stays private:

```ts
// export const { a, b } = new Holder(1);
const holder = new Holder(1);
export const a = holder.a;
export const b = holder.b;
```

The fix is withheld when the destructuring pattern carries a type annotation:

```ts
const { b }: { b: number } = inst;
const { b, c }: SomeType = inst;
```

An annotation types the destructured object as a whole, so it cannot be split across the per-property declarations the fixer emits, and deriving a type for each property would require type information the rule does not have. These cases are reported but left for you to rewrite by hand (for example, `const b: number = inst.b;`).

The fix is withheld in these cases too, each reported for you to rewrite by hand:

```ts
const { a, ...rest } = new Holder(); // a rest element collects members the rule cannot enumerate
const { a = 1, b } = new Holder(); // a default applies only when the member is undefined
const { a, b } = new Holder(), y = 2; // a sibling declarator would have to be hoisted past the instance binding
for (const { a, b } = new Holder(); ; ) {} // a `for` initializer holds exactly one statement
```
