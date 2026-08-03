# Enforce typing variables before returning them, rather than using type assertions or explicit return types (`@blumintinc/blumint/no-type-assertion-returns`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Returning a type assertion or relying on an explicit return type for an untyped expression hides whether the value you return actually matches the declared shape. This rule makes you assign the value to a typed variable (or narrow it) before returning so TypeScript validates the structure instead of trusting a cast.

## Rule Details

- Flags `as` or angle-bracket assertions in return positions and arrow expression bodies.
- Reports a chained assertion (`x as unknown as T`) once, on the outermost link, so the message names the type that actually reaches the caller instead of an intermediate `unknown`. The count is the same whether the value is returned from a block body or an arrow expression body.
- Flags explicit return annotations when the returned expression is untyped (for example, an object literal or function call), because the annotation can mask missing or wrong fields.
- Allows type predicates and `as const` only when explicitly configured.

## What is not flagged

The rule targets the value a function hands back to its caller. An assertion that merely sits somewhere inside the returned expression, without becoming part of what the caller receives, is exempt:

- **Call and `new` arguments** — `return fn(x as T)` returns the call's result, and TypeScript already checks the argument against the parameter type.
- **JSX props, in both spellings** — `return <C prop={x as T} />` and `return <C {...(x as T)} />`. The function returns a `JSXElement`, never the asserted value, and the object is re-checked against the receiving component's prop types at the JSX call site. The named and spread forms are treated identically because they have identical semantics.
- **Object properties** — an assertion on a property value inside a returned object literal.
- **Variable declarations, conditions, and logical expressions** — the assertion is consumed locally rather than returned.

An object or array **spread** is deliberately not exempt, even though it looks like the JSX spread:

```ts
function probe(x: unknown) {
  return { ...(x as Record<string, unknown>) }; // reported
}
```

Spreading an asserted value into a returned object or array splices its own members into the return value, so the unvalidated data reaches the caller directly. Nothing re-checks it the way a component's prop types re-check a JSX spread.

## Why this matters

- Type assertions bypass TypeScript’s structural checks and let incomplete data escape a function without warnings.
- Annotated return types on untyped expressions upcast silently, so callers see the declared type even if the value is incompatible.
- Forcing a typed variable or narrowing step keeps return values validated and documents how the value satisfies the expected shape.

## Examples

### ❌ Incorrect

```ts
function getSettings() {
  return { theme: 'dark' } as UserSettings;
}

function getTournamentRef() {
  return docRef as unknown as DocumentReference<Tournament>; // one report, naming DocumentReference<Tournament>
}

const createUser = (): User => ({
  id: 1,
  name: 'Ava',
});
```

### ✅ Correct

```ts
function getSettings() {
  const settings: UserSettings = { theme: 'dark' }; // TypeScript enforces the full UserSettings shape here
  return settings;
}

const createUser = () => {
  const user: User = {
    id: 1,
    name: 'Ava',
  }; // TS checks this object matches User before returning
  return user;
};
```

```tsx
function Field({ rest }: { rest: unknown }) {
  // The return value is a JSX.Element; Select validates the spread against its own props
  return <Select {...(rest as SelectProps)} />;
}
```

## Options

This rule accepts an options object:

```js
{
  // Allows 'as const' assertions in return positions when true (default: true)
  "allowAsConst": true,
  // Allows type predicate return annotations (e.g., `value is Type`) when true (default: true)
  "allowTypePredicates": true
}
```
