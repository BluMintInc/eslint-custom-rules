# Enforce using a settings object for functions with multiple parameters (`@blumintinc/blumint/prefer-settings-object`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Options

This rule accepts an options object with the following properties:

```ts
{
  // Minimum number of parameters before requiring a settings object
  minimumParameters?: number;
  // Check for multiple parameters of the same type
  checkSameTypeParameters?: boolean;
  // Ignore bound methods (e.g., class methods)
  ignoreBoundMethods?: boolean;
  // Ignore functions with rest parameters
  ignoreVariadicFunctions?: boolean;
}
```

### `minimumParameters`

The minimum number of parameters a function can have before requiring a settings object. Defaults to `3`. Must be at least `2`.

### `checkSameTypeParameters`

When set to `true` (default), checks for functions that have multiple parameters of the same type. This helps identify cases where parameter order might be confusing and a settings object would provide better clarity.

### `ignoreBoundMethods`

When set to `true` (default), ignores bound methods (like class methods). This is useful when you want to maintain method chaining or when the method parameters are part of a well-defined interface.

### `ignoreVariadicFunctions`

When set to `true` (default), ignores functions that use rest parameters. This is useful for functions that need to accept a variable number of arguments.
