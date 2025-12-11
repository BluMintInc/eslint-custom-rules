# Avoid using entire objects in React hook dependency arrays when only specific fields are used, as this can cause unnecessary re-renders. When a hook only uses obj.name but obj is in the deps array, any change to obj.age will trigger the hook. Use individual fields (obj.name) instead of the entire object. Requires TypeScript and `parserOptions.project` to be configured (`@blumintinc/blumint/no-entire-object-hook-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Prerequisites

This rule requires type information to work correctly. Make sure to:

1. Use TypeScript
2. Configure `parserOptions.project` in your ESLint configuration:

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  }
}
```

## Rule Details

This rule warns when an entire object is used in a React hook dependency array when only specific fields from that object are actually used within the hook. This helps prevent unnecessary re-renders and ensures more precise dependency tracking.

### Examples

❌ Incorrect:

```typescript
function Component({ user }) {
  useEffect(() => {
    console.log(user.name);
  }, [user]); // Using entire user object when only user.name is needed
}
```

✅ Correct:

```typescript
function Component({ user }) {
  useEffect(() => {
    console.log(user.name);
  }, [user.name]); // Using only the specific field that's needed
}
```

### When Not To Use It

If you're not using TypeScript or if you have cases where you intentionally want to track entire objects in your dependencies (e.g., for memoization purposes), you might want to disable this rule.
