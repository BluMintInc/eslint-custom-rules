# Avoid object patterns that only spread an existing object, since they clone the whole value without selecting properties (`@blumintinc/blumint/no-unnecessary-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Using `{ ...obj }` inside an object pattern clones the entire object without selecting any fields. That shallow copy allocates memory, changes the reference identity, and suggests that properties are being filtered when they are not.

## Rule Details

This rule reports object destructuring patterns that contain only a single rest element, such as `{ ...source }`. In these cases every property is kept, so the destructuring adds no value beyond creating a new object reference. The rule prefers direct assignment to preserve readability and avoid unnecessary allocations.

### Examples of **incorrect** code for this rule:

```ts
const { ...config } = getConfiguration();

let obj;
({ ...obj } = source);
```

### Examples of **correct** code for this rule:

```ts
const config = getConfiguration();
const clone = { ...config }; // explicit clone with an object literal

let obj;
obj = source;
```

## Autofix

The fix replaces the pattern with the rest binding's name and keeps the declarator's type annotation verbatim. Because a lone rest element binds every property, the annotation describes the new binding exactly, so it stays correct after the collapse:

```ts
// Before
const { ...rest }: Readonly<Foo & Bar> = obj;

// After
const rest: Readonly<Foo & Bar> = obj;
```

Generics, intersections, function types, and multi-line object types all survive unchanged. Declarators without an annotation still fix to a bare name (`const rest = obj;`), and a declarator with no initializer (such as `for (const { ...entry } of entries)`) is reported without a fix.

An assignment statement is written parenthesized — `({ ...obj } = source);` —
only because a statement opening with `{` would parse as a block. Collapsing the
pattern to a plain target removes that reason, so the fix drops the pair with it
and emits `obj = source;`. Leaving it behind would be text a formatter removes on
its next run, which churns the file on every pass.

The pair is kept where it is not the statement's own wrapper — parentheses
grouping the assignment as a condition (`if ((obj = source))`) are load-bearing —
and where a comment sits inside it, since dropping the pair would move the
comment out of the group it was written into.

## Why this matters

- `{ ...source }` in a destructuring pattern hints that properties are being picked, but it keeps everything, which misleads readers and reviewers.
- The shallow copy allocates a new object and drops the original reference identity, which can trigger avoidable re-renders or cache misses when the clone is passed through a component tree.
- Direct assignment communicates intent: you want the same object, not a hidden clone.

## When Not To Use It

If you explicitly want a shallow clone for identity separation, use an object literal (`const clone = { ...source };`) instead of destructuring with a rest pattern.
