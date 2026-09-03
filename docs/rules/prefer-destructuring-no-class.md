# Enforce destructuring when accessing object properties, except for class instances (`@blumintinc/blumint/prefer-destructuring-no-class`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule?

- For plain objects, dot assignments scatter property reads and hide the dependency between a variable and its source object. Destructuring declares the dependency once and keeps aliases aligned when object shapes change.
- Destructuring avoids duplicating property names and makes renames explicit, which reduces drift when refactoring.
- Class instances are exempt because destructuring methods or fields can unbind `this` or copy mutable instance state in ways that diverge from the class semantics. An instance is recognized syntactically: a `new X()` initializer in the same file, or an identifier whose type annotation (parameter or variable) names a class **declared in the same file**. An identifier typed with an imported class cannot be resolved without type information and is still reported — rephrase with destructuring or use an inline `eslint-disable-next-line` with the class named in the justification.

## Options

This rule accepts an options object with the following properties:

```ts
{
  // Enable object destructuring enforcement
  object?: boolean;
  // Enforce destructuring even when property needs to be renamed
  enforceForRenamedProperties?: boolean;
}
```

### `object`

When set to `true` (default), enforces object destructuring for property access. This helps make code more concise and maintainable.

### `enforceForRenamedProperties`

When set to `false` (default), only enforces destructuring when the property name matches the variable name. The match ignores case and underscores, so a variable name that only differs from the property by a naming-convention shift (`FOO` reading `.foo`, `MY_VALUE` reading `.myValue`) still counts as matching — a tool such as `global-const-style` rewriting a module-scope `const` to `SCREAMING_SNAKE_CASE` changes only the binding's spelling, not which property it reads. A variable name that differs beyond case and underscores (`total` reading `.count`) is still treated as a rename and is not reported. When set to `true`, enforces destructuring even when the property needs to be renamed.

## Examples

### ❌ Incorrect

```ts
// With default options
const user = { name: 'John', age: 30 };
const name = user.name;
const age = user.age;

// With enforceForRenamedProperties: true
const userName = user.name;

// Assignment expressions also need destructuring
let role;
const user = { role: 'admin' };
role = user.role;

// A binding that only case/underscore-shifts the property name still
// matches under the default options — this is still reported
const OBJ = { foo: 123 };
const FOO = OBJ.foo;
```

### ✅ Correct

```ts
// With default options
const user = { name: 'John', age: 30 };
const { name, age } = user;
```

```ts
// With enforceForRenamedProperties: true
// eslint-options: {"enforceForRenamedProperties": true}
const user = { name: 'John' };
const { name: userName } = user;
```

```ts
// A case/underscore-only difference is still fixed with an alias, so the
// binding name (FOO) is preserved rather than reading a property that
// doesn't exist
const OBJ = { foo: 123 };
const { foo: FOO } = OBJ;
```

```ts
// A name that differs beyond case/underscores is a genuine rename and stays
// exempt under the default options
const OBJ = { count: 123 };
const total = OBJ.count;
```

```ts
// Assignment expressions
let role;
const user = { role: 'admin' };
({ role } = user);
```

```ts
// Class instances are always exempt
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}
const user = new User('John');
const name = user.name; // Allowed for class instances
```

```ts
// `super.x` has no destructuring form at all: `const { BASE } = super;` is a
// syntax error, because `super` must be followed by a call or a member
// access. The rule stays silent whatever the binding is called.
class Derived extends Base {
  private static get config() {
    const base = super.BASE;
    return base;
  }
}
```

## Auto-fix

The fixer rewrites the declaration as a destructuring pattern (for example, `const name = user.name;` becomes `const { name } = user;`) and rewrites assignments as `({ name } = user);`.

When the binding's spelling differs from the property's — whether from `enforceForRenamedProperties: true`, or from the case/underscore-only difference the default gate tolerates — the fixer emits the aliased form (`const { foo: FOO } = OBJ;`) so the binding name is preserved. Emitting the plain form (`const { FOO } = OBJ;`) would read a property named `FOO`, which may not exist on the object at all.

The fix is withheld when the declared variable carries a type annotation:

```ts
const alpha: string = obj.alpha;
let alpha: Wide = obj.alpha;
```

The emitted `const { alpha } = obj;` has nowhere to carry the annotation. Moving it to the pattern (`const { alpha }: { alpha: string } = obj;`) asserts something different — a structural constraint on the source object rather than the variable's declared type — and can shift inference, so these cases are reported and left for you to rewrite by hand.

An annotation on a separate declaration is untouched, so assignments still auto-fix:

```ts
let alpha: string;
({ alpha } = obj); // fixed from `alpha = obj.alpha;`
```
