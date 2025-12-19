# Prefer nullish coalescing over logical OR, but allow logical OR in boolean contexts (`@blumintinc/blumint/prefer-nullish-coalescing-boolean-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule prevents the `@typescript-eslint/prefer-nullish-coalescing` rule from incorrectly flagging logical OR (`||`) operators inside boolean props of React components or other boolean contexts.

## Rule Details

In boolean contexts, using logical OR is semantically correct because `||` returns the first truthy operand and the consuming position coerces the result to a boolean. Replacing `||` with nullish coalescing (`??`) changes behavior for falsy-but-not-nullish values like `0`, `''`, or `false`, which `??` would pass through.

This rule works alongside the `@typescript-eslint/prefer-nullish-coalescing` rule to prevent it from suggesting incorrect replacements in boolean contexts.

### Examples of correct code

```tsx
// Boolean props in JSX
<LoadingButton
  disabled={
    !isValidated.phoneNumber ||
    !hasUserTyped.phoneNumber ||
    isLoading ||
    !isPhoneInputLoaded
  }
  id="phone-dialog-recaptcha"
  size="large"
  type="submit"
  variant="contained"
>
  Send Code
</LoadingButton>

<Button disabled={isLoading || !isValid}>Submit</Button>
<Input required={hasValue || isRequired} />
<Checkbox checked={isSelected || defaultSelected} />

// Boolean contexts in conditions
if (isLoading || !isValid) {
  return null;
}

// Boolean variable assignments
const isDisabled = !isValidated.phoneNumber || !hasUserTyped.phoneNumber || isLoading;
```

### Examples of incorrect code

This rule doesn't report diagnostics on its own; it exists to prevent `@typescript-eslint/prefer-nullish-coalescing` from suggesting `??` in boolean contexts.

## When Not To Use It

If you don't use the `@typescript-eslint/prefer-nullish-coalescing` rule, you don't need this rule.

## Further Reading

- [TypeScript ESLint prefer-nullish-coalescing rule](https://typescript-eslint.io/rules/prefer-nullish-coalescing/)
- [Nullish coalescing operator (??)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Logical OR operator (||)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
