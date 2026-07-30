# Enforce destructuring when accessing object properties, except for class instances (`@blumintinc/blumint/prefer-destructuring-no-class`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Why this rule?

- For plain objects, dot assignments scatter property reads and hide the dependency between a variable and its source object. Destructuring declares the dependency once and keeps aliases aligned when object shapes change.
- Destructuring avoids duplicating property names and makes renames explicit, which reduces drift when refactoring.
- Class instances are exempt because destructuring methods or fields can unbind `this` or copy mutable instance state in ways that diverge from the class semantics.

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

When set to `false` (default), only enforces destructuring when the property name matches the variable name. When set to `true`, enforces destructuring even when the property needs to be renamed.

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

## Auto-fix

The fixer rewrites the declaration as a destructuring pattern (for example, `const name = user.name;` becomes `const { name } = user;`) and rewrites assignments as `({ name } = user);`.

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
