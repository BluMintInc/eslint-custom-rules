# Enforce typing variables before returning them, rather than using type assertions or explicit return types (`@blumintinc/blumint/no-type-assertion-returns`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Returning a type assertion or relying on an explicit return type for an untyped expression hides whether the value you return actually matches the declared shape. This rule makes you assign the value to a typed variable (or narrow it) before returning so TypeScript validates the structure instead of trusting a cast.

## Rule Details

- Flags `as` or angle-bracket assertions in return positions and arrow expression bodies.
- Flags explicit return annotations when the returned expression is untyped (for example, an object literal or function call), because the annotation can mask missing or wrong fields.
- Allows type predicates and `as const` only when explicitly configured.

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
