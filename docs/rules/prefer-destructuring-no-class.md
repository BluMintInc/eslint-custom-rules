# Enforce destructuring when accessing object properties, except for class instances (`@blumintinc/blumint/prefer-destructuring-no-class`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

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
```

### ✅ Correct

```ts
// With default options
const user = { name: 'John', age: 30 };
const { name, age } = user;

// With enforceForRenamedProperties: true
const { name: userName } = user;

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
