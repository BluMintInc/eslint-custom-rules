# Enforce React hooks with optional parameters to default to an empty object (`@blumintinc/blumint/require-hooks-default-params`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React hooks with a single parameter where all properties are optional should default to an empty object. This prevents potential runtime errors from accessing properties of undefined and makes the hook's API more predictable.

React hooks often receive a single "options" object. When every property on that object is optional, callers naturally expect to omit the argument. If the hook does not default the parameter, the parameter is `undefined`, so destructuring or property access throws even though each field is optional. Defaulting to `{}` keeps the hook safe to call with no arguments and makes the contract explicit.

## Why this matters

- Avoids runtime crashes from destructuring `undefined` when a caller omits the options argument.
- Communicates that the options bag is optional even when its properties are optional.
- Keeps hook APIs consistent and easy to use across the codebase.

## How to fix

- If a hook takes one object parameter and all properties are optional, add a default empty object: `({ foo, bar }: Options = {})`.

## Fix layout at the print width

Appending ` = {}` lengthens the signature by five columns, so a line that fit before the fix may not after it. Measured against prettier (print width 80), a signature the append pushes past the width is one prettier answers by expanding the destructuring pattern — one property per line at one indent step, trailing comma, the close brace back at the statement's column — while the type annotation and everything after the parameter stay on the closing line. The fix emits that shape directly, so its output is a fixed point of prettier rather than a diff that reflows on the next format:

```ts
export function useData({ url, options }: { url?: string; options?: object }) {
  return null;
}
```

becomes

```ts
export function useData({
  url,
  options,
}: { url?: string; options?: object } = {}) {
  return null;
}
```

The width is measured the way prettier measures it: through the body's `{` (or, for an expression-bodied arrow or an empty body, through the end of the statement). A trailing line comment never counts; a block comment counts exactly where prettier counts it — before the body's `{` it occupies columns, after it prettier moves it into the body. On prettier's head-break arrow shape (the line ends with `=>` and the body sits below), the expanded pattern frees the closing line, and the fix rejoins the body there whenever it fits. Property spans are sliced between the source's own separators, so a comment written beside a property rides along verbatim.

Wherever the post-break layout cannot be read off the source — a signature already spanning several lines, a second declarator or statement sharing the line, a property too long for its own line, a closing line that would still exceed the width — the fix keeps the flat append rather than guessing at prettier's answer.

## How the parameter type is resolved

A named options type is resolved lexically, from the hook outward through each enclosing statement container to module scope. Every container that can hold a declaration counts — a function body, a `namespace`, a class `static {}` block, a `switch` case consequent — so how deeply the type is nested never decides whether the rule can see it. That covers a type declared beside the hook, one declared in an enclosing function, and an exported declaration — `export type Props = { ... }` is a type alias inside an `export` statement, and both spellings resolve the same way. The nearest declaration answers, so an inner type shadows a same-named outer one, and a matching type in a scope that does not enclose the hook is never consulted. A name that also has a value binding of the same name nearby still resolves to the type.

A type this rule cannot read is left alone rather than guessed at, so a hook whose options type is **imported from another module** is never reported. The rule does not open other files, and treating an unknown shape as all-optional would produce a fix that changes behaviour. Declare the type in the same file if you want it checked.

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
- The hook accepts multiple parameters, or the first parameter is not an object.
