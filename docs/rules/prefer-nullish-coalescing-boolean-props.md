# Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts (`@blumintinc/blumint/prefer-nullish-coalescing-boolean-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule keeps logical OR (`||`) available inside boolean contexts (JSX boolean props, conditions, boolean-returning helpers) while requiring the nullish coalescing operator (`??`) for defaulting non-boolean values. Logical OR treats any falsy value (`false`, `0`, `''`, `NaN`) as missing and will override intentional states; `??` only falls back on `null` or `undefined`, preserving explicit falsy inputs.

## Rule Details

**Why**: Defaulting with `||` hides legitimate falsy values—feature flags set to `false`, counts that are `0`, empty strings that are intentional—and replaces them with fallbacks. That makes components render with the wrong values and masks real bugs.

**What the rule enforces**:
- Use `??` instead of `||` when providing default values to non-boolean expressions (props, variables, arguments, array/object literals, template literals, etc.).
- Keep `||` in boolean contexts where coercing any falsy value to `false` is intentional (boolean props, conditions, loop tests, boolean-returning helpers).

**How to fix**: Replace `left || right` with `left ?? right` unless the expression is strictly boolean. The fixer applies this automatically.

### Examples of correct code

Boolean props keep logical OR:

```tsx
<LoadingButton
  disabled={
    !isValidated.phoneNumber ||
    !hasUserTyped.phoneNumber ||
    isLoading ||
    !isPhoneInputLoaded
  }
>
  Send Code
</LoadingButton>
```

```tsx
<Button disabled={isLoading || !isValid}>Submit</Button>
```

```tsx
<Input required={hasValue || isRequired} />
```

```tsx
<Checkbox checked={isSelected || defaultSelected} />
```

Conditions keep logical OR:

```tsx
if (isLoading || !isValid) {
  return null;
}
```

Nullish coalescing for defaulting values:

```tsx
const value = data ?? defaultValue;
const placeholder = text ?? 'Enter text';
const { title = data.title ?? 'Untitled' } = props;
```

### Examples of incorrect code

```tsx
// Non-boolean defaults overwrite intentional falsy values
const value = data || defaultValue;
function Component() {
  return <Input placeholder={text || 'Enter text'} />;
}

// Template literals and nested expressions
const str = `Hello ${name || 'World'}`;
const result = (data.field || defaultField).toString();
```

These cases should use `??` so the fallback only applies when the left side is `null` or `undefined`.

## When Not To Use It

If you don't use the `@typescript-eslint/prefer-nullish-coalescing` rule, you don't need this rule.

## Further Reading

- [TypeScript ESLint prefer-nullish-coalescing rule](https://typescript-eslint.io/rules/prefer-nullish-coalescing/)
- [Nullish coalescing operator (??)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Logical OR operator (||)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
