# Detect conditions that are always truthy or always falsy (`@blumintinc/blumint/no-always-true-false-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Conditions that the linter can prove are always true or always false create unreachable branches and redundant guards. The rule reports the specific constant expression in each lint message so you can see which part of the condition is ineffective and simplify the control flow.

## Rule Details

The rule reports when the condition result is known at lint time, including:

- Literal booleans (`if (true)`, `while (false)`), empty strings, `null`, `undefined`, `NaN`, and `Infinity`.
- Literal comparisons such as `3 > 5`, `'a' === 'a'`, bitwise results that are constant, and `typeof` checks against literals.
- Always truthy values like object/array literals used directly as conditions.
- Switch cases whose test literal can never match (or always matches) the discriminant literal.
- Constant results from simple calls (`/[a]/.test('b')`, `[1, 2].includes(3)`, `Math.max(1, 2) === 0`, `Object.keys({}).length > 0`, `JSON.stringify({ a: 1 }) === '{}'`).

The rule intentionally ignores common default-value patterns to avoid false positives:

- Logical fallbacks (`foo || {}`, `bar ?? defaultValue`).
- Ternaries used as defaults (`status ? status : 'offline'`).
- Destructuring fallbacks (`const { name = 'Unknown' } = user || {};`) and optional chaining checks (`maybe?.length`).

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

switch (42) {
  case 99:
    break; // always false
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
```

## How to fix

- Replace the constant guard with a runtime check (variables, function calls, or comparisons).
- Remove unreachable branches when no runtime path can enter them.
- For defaults, use the standard fallback patterns above instead of wrapping them in constant conditions.

## When Not To Use It

- Generated code or tests that deliberately use constant conditions.
- Codebases that rely on explicit compile-time constants and prefer to keep them; disable locally for those cases.
