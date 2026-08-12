# Detect conditions that are always truthy or always falsy (`@blumintinc/blumint/no-always-true-false-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Conditions that the linter can prove are always true or always false create unreachable branches and redundant guards. The rule reports the specific constant expression in each lint message so you can see which part of the condition is ineffective and simplify the control flow.

## Rule Details

The rule reports when the condition result is known at lint time, including:

- Literal booleans (`if (true)`, `while (false)`), empty strings, `null`, `undefined`, `NaN`, and `Infinity`.
- Literal comparisons such as `3 > 5`, `'a' === 'a'`, bitwise results that are constant, and `typeof` checks against literals.
- Always truthy values like object/array literals used directly as conditions.
- Switch cases whose test literal can never match (or always matches) the discriminant literal, including a case test bound to a `const` literal.
- Constant results from simple calls (`/[a]/.test('b')`, `[1, 2].includes(3)`, `Math.max(1, 2) === 0`, `Object.keys({}).length > 0`, `JSON.stringify({ a: 1 }) === '{}'`).
- Optional chaining off an object the rule can pin to an object literal, where the `?.` guard is dead and the property it reads is the literal one the declaration gives it.

`Math.max`/`Math.min` resolve only when the call passes at least two numeric literal arguments, and a comparison against such a call is reported only when its other operand is a number the rule can resolve too. `Math.max(count, 2) === 0`, `Math.max(...values) === 0`, and `Math.max(1, 2) === threshold` all stay untouched.

### How constants are resolved

Resolution follows the declaration, whatever the binding and the property are named, and looks through type and non-null assertions (`as const`, `satisfies`, `!`, `<T>x`). An assertion only describes a value — `'a' as const` is more certain than `'a'`, never less — so it never hides a constant.

Resolution stops, and nothing is reported, whenever the declaration leaves the value open:

- The binding is not a `const`, carries no initializer, or is initialized with anything other than a literal (`const thing = getThing()`).
- The object literal cannot answer for the property: a spread contributes unknown keys, the key is computed at runtime, the property is an accessor, or the property is absent (a missing own property can still resolve through the prototype).
- A `const` binds the reference and not the object, so any write through the binding (`thing.prop = value`, `delete thing.prop`, `counters.count++`) or any use that hands the object to other code makes the property values unknowable.

The rule intentionally ignores common default-value patterns to avoid false positives:

- Logical fallbacks (`foo || {}`, `bar ?? defaultValue`).
- Ternaries used as defaults (`status ? status : 'offline'`).
- Destructuring fallbacks (`const { name = 'Unknown' } = user || {};`) and optional chaining on values that really can be nullish (`maybe?.length`).

### Examples of incorrect code for this rule:

```ts
if (true) {
  doWork();
}

while (0) {
  retry();
}

if ('a' === 'a') {
  // always
}

const result = 5 > 10 ? 'yes' : 'no'; // condition always false

if (/foo/.test('bar')) {
  // never runs
}

if (Math.max(1, 2) === 0) {
  // never runs
}

switch (42) {
  case 99:
    break; // always false
}

const thing = { prop: 'value' };
if (thing?.prop) {
  // the optional guard is dead and the property is always the literal 'value'
}

const mode = 'dark' as const;
switch ('dark') {
  case mode:
    break; // always true
}
```

### Examples of correct code for this rule:

```ts
if (shouldStart) {
  startJob();
}

while (shouldRetry()) {
  retry();
}

const label = status ? status : 'offline'; // default value pattern allowed
const options = config || {}; // fallback allowed

if (value?.length) {
  show(value);
}

const settings = loadSettings();
if (settings?.mode) {
  apply(settings.mode); // the object comes from a call, so nothing is known
}

const defaults = { retries: 3 };
if (defaults?.timeout) {
  wait(); // the property is absent from the literal, so the outcome is open
}

// A loop whose exit is only known mid-body: the literal is deliberate
let cursor = null;
while (true) {
  const { nextCursor } = await fetchPage(cursor);
  if (!nextCursor) break;
  cursor = nextCursor;
}
```

### Loops that exit from the body

A literal `true` loop test is not reported when the body can leave the loop — cursor pagination and retry loops are written this way, and `for (;;)` says the same thing. `break`, `return` and `throw` all count, and the exit has to be one the loop can take: a `break` a nested `switch` or inner loop consumes does not free the outer loop, and a `return` inside a nested function belongs to that function. A labelled `break outer` counts for the loop it names.

A literal-`true` loop whose body has no way out is still reported, because that loop really does run forever.

## How to fix

- Replace the constant guard with a runtime check (variables, function calls, or comparisons).
- Remove unreachable branches when no runtime path can enter them.
- For defaults, use the standard fallback patterns above instead of wrapping them in constant conditions.

## When Not To Use It

- Generated code or tests that deliberately use constant conditions.
- Codebases that rely on explicit compile-time constants and prefer to keep them; disable locally for those cases.
