# Enforce using a settings object for functions with multiple parameters (`@blumintinc/blumint/prefer-settings-object`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Functions with long lists of positional parameters are hard to read and easy to mis-call. This rule suggests replacing them with a single settings object so each argument is labeled at the call site.

## Why this rule?

- Positional arguments hide intent (what does `true, false, null` mean?).
- Callers can easily swap arguments of the same type without a type error.
- Adding or removing parameters is safer with a settings object.

## Examples

### ❌ Incorrect

```ts
function createUser(name: string, age: number, isAdmin: boolean) {
  return { name, age, isAdmin };
}

function sendEmail(to: string, from: string) {
  return mailer.send({ to, from });
}
```

Example message:

```text
Function accepts 3 positional parameters (limit 3). This rule suggests using a settings object for better readability and to prevent mis-ordered arguments. If positional arguments are clearer for this specific utility, please use an // eslint-disable-next-line @blumintinc/blumint/prefer-settings-object comment. Otherwise, consider a single settings object.
```

### ✅ Correct

```ts
type UserSettings = { name: string; age: number; isAdmin: boolean };
function createUser({ name, age, isAdmin }: UserSettings) {
  return { name, age, isAdmin };
}

type EmailParams = { to: string; from: string };
function sendEmail({ to, from }: EmailParams) {
  return mailer.send({ to, from });
}
```

### ✅ Correct (With disable comment if positional is clearer)

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-settings-object
function point(x: number, y: number, z: number) {
  return { x, y, z };
}
```

## Options

This rule accepts an options object:

- `minimumParameters`: (Default: `3`) Minimum number of parameters before triggering the rule.
- `checkSameTypeParameters`: (Default: `true`) Whether to flag functions with multiple parameters of the same type even if they are below the minimum count.
- `ignoreBoundMethods`: (Default: `true`) Whether to ignore methods that are likely part of a framework (e.g., Express handlers).
- `ignoreVariadicFunctions`: (Default: `true`) Whether to ignore functions with rest parameters.

## When Not To Use It

Disable this rule for simple mathematical or geometric utilities where positional arguments are the standard convention. Use an `// eslint-disable-next-line @blumintinc/blumint/prefer-settings-object` comment for local exceptions.

## Further Reading

- [Clean Code: Function Arguments](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter03.html#ch3lev1sec4)
- [Refactoring: Parameter Object](https://refactoring.guru/introduce-parameter-object)
