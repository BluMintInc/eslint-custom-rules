# Detect conditions that are always truthy or always falsy (`@blumintinc/blumint/no-always-true-false-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Unreachable branches and dead code often come from conditions that can never change (e.g., `if (true)`, `while (0)`, `'foo' === 'foo'`). This rule flags conditions that the rule can prove are always truthy or always falsy so you can simplify control flow or fix likely bugs.

## Rule Details

The rule evaluates many constant patterns and reports when the result is known at lint time, including:

- Literal booleans (`if (true)`, `while (false)`), empty strings, `null`, `undefined`, `NaN`, and `Infinity`.
- Literal comparisons such as `3 > 5`, `'a' === 'a'`, bitwise results that are constant, and `typeof` checks against literals.
- Always truthy values like object/array literals used directly as conditions.
- Switch cases whose test literal can never match (or always matches) the discriminant literal.
- Constant results from simple calls (`/[a]/.test('b')`, `[1,2].includes(3)`, `Math.max(1,2) === 0`, `Object.keys({}).length > 0`, `JSON.stringify({ a: 1 }) === '{}'`).

The rule intentionally **ignores** common default-value patterns to avoid false positives:

- Logical fallbacks (`foo || {}`, `bar ?? defaultValue`).
- Ternaries used as defaults (`status ? status : 'offline'`).
- Destructuring fallbacks (`const { x } = obj || {}`) and optional chaining in similar contexts.

### Examples of **incorrect** code for this rule:

```ts
if (true) { doWork(); }
while (0) { retry(); }
if ('a' === 'a') { /* always */ }
const result = 5 > 10 ? 'yes' : 'no'; // condition always false
if (/foo/.test('bar')) { /* never runs */ }
switch (42) {
  case 99: /* always false */ break;
}
```

### Examples of **correct** code for this rule:

```ts
if (count > 0) log(count);
while (shouldRetry()) retry();
const label = status ? status : 'offline';      // default value pattern allowed
const options = config || {};                   // fallback allowed
if (value?.length) show(value);
```

## Options

This rule does not have any options.

## When Not To Use It

- Generated code or tests that deliberately use constant conditions.
- Codebases that rely heavily on compile-time constants and prefer to keep them explicit; disable locally for those cases.
