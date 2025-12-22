# Enforce using a settings object for functions with multiple parameters (`@blumintinc/blumint/prefer-settings-object`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule details

Positional argument lists stop conveying meaning once they grow or repeat types. Swapping two values of the same type compiles but produces subtle bugs, and long lists force callers to remember the exact order instead of naming what each value represents. Passing a single settings object keeps call sites self-documenting, allows optional fields, and makes it safer to evolve a function signature without breaking every usage.

The rule reports when a function:
- Exceeds the configured parameter limit (defaults to 3).
- Accepts multiple parameters of the same type, which encourages accidental swaps.

Use a settings object so each argument is labeled and harder to mis-order.

### Examples

#### ❌ Incorrect

```ts
function createUser(name: string, age: number, isAdmin: boolean) {
  return { name, age, isAdmin };
}

function sendEmail(to: string, from: string) {
  return mailer.send({ to, from });
}
```

#### ✅ Correct

```ts
type CreateUserOptions = { name: string; age: number; isAdmin: boolean };
function createUser({ name, age, isAdmin }: CreateUserOptions) {
  return { name, age, isAdmin };
}

type SendEmailOptions = { to: string; from: string };
function sendEmail({ to, from }: SendEmailOptions) {
  return mailer.send({ to, from });
}
```

## Options

This rule accepts an options object:

```ts
{
  /**
   * Minimum number of parameters before requiring a settings object.
   * Defaults to 3 and must be at least 2.
   */
  minimumParameters?: number;

  /**
   * When true (default), flag functions that accept multiple parameters
   * of the same type because those call sites are easy to swap.
   */
  checkSameTypeParameters?: boolean;

  /**
   * When true (default), ignore bound methods such as Express handlers
   * where the signature is dictated by the framework.
   */
  ignoreBoundMethods?: boolean;

  /**
   * When true (default), ignore variadic functions that legitimately
   * accept flexible argument counts.
   */
  ignoreVariadicFunctions?: boolean;
}
```
