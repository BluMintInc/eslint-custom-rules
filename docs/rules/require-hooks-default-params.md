# Enforce React hooks with optional parameters to default to an empty object (`@blumintinc/blumint/require-hooks-default-params`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React hooks with a single parameter where all properties are optional should default to an empty object. This prevents potential runtime errors from accessing properties of undefined and makes the hook's API more predictable.

React hooks often receive a single "options" object. When every property on that object is optional, callers naturally expect to be able to omit the argument. If the hook does not default the parameter, the hook receives `undefined`, destructuring throws, and the API implies the object itself is required even though each field is optional. Defaulting to `{}` keeps the hook safe to call with no arguments and makes the contract explicit.

## Why this matters
- Avoids runtime crashes from destructuring `undefined` when a caller omits the options argument.
- Communicates that the options bag is optional even when its properties are optional.
- Keeps hook APIs consistent and easy to use across the codebase.

## How to fix
- If a hook takes one object parameter and all properties are optional, add a default empty object: `({ foo, bar }: Options = {})`.
- If you want to enforce that the object itself is required, add at least one required property instead of relying on this rule.

## Examples

### ❌ Incorrect

```ts
type Settings = {
  theme?: string;
  language?: string;
};

function useSettings({ theme, language }: Settings) {
  // Destructuring throws if the caller omits the argument
  return { theme, language };
}

interface Config {
  debug?: boolean;
  timeout?: number;
}

const useConfig = ({ debug, timeout }: Config) => {
  // The object itself is treated as required even though its fields are optional
  return { debug, timeout };
};
```

### ✅ Correct

```ts
type Settings = {
  theme?: string;
  language?: string;
};

function useSettings({ theme, language }: Settings = {}) {
  // Safe to omit the argument; destructuring receives {}
  return { theme, language };
}

interface Config {
  debug?: boolean;
  timeout?: number;
}

const useConfig = ({ debug, timeout }: Config = {}) => {
  return { debug, timeout };
};
```

## When Not To Use It

- You want the options object itself to be required; in that case, add at least one required field instead of defaulting to `{}`.
- The hook accepts multiple parameters or the first parameter is not an object; this rule only targets a single object parameter with all-optional fields.
