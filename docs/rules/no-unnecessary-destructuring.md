# Avoid object patterns that only spread an existing object, since they clone the whole value without selecting properties (`@blumintinc/blumint/no-unnecessary-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Using `{ ...obj }` inside an object pattern clones the entire object without selecting any fields. That shallow copy allocates memory, changes the reference identity, and suggests that properties are being filtered when they are not.

## Rule Details

This rule reports object destructuring patterns that contain only a single rest element, such as `{ ...source }`. In these cases every property is kept, so the destructuring adds no value beyond creating a new object reference. The rule prefers direct assignment to preserve readability and avoid unnecessary allocations.

Examples of **incorrect** code for this rule:

```ts
const { ...config } = getConfiguration();

let obj;
({ ...obj } = source);
```

Examples of **correct** code for this rule:

```ts
const config = getConfiguration();
const clone = { ...config }; // explicit clone with an object literal

let obj;
obj = source;
```

## Why this matters

- `{ ...source }` in a destructuring pattern hints that properties are being picked, but it keeps everything, which misleads readers and reviewers.
- The shallow copy allocates a new object and drops the original reference identity, which can trigger avoidable re-renders or cache misses when the clone is passed through a component tree.
- Direct assignment communicates intent: you want the same object, not a hidden clone.

## When Not To Use It

If you explicitly want a shallow clone for identity separation, use an object literal (`const clone = { ...source };`) instead of destructuring with a rest pattern.
