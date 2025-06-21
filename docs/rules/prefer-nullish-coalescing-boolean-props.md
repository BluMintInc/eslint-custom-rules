# prefer-nullish-coalescing-boolean-props

This rule prevents the `@typescript-eslint/prefer-nullish-coalescing` rule from incorrectly flagging logical OR (`||`) operators inside boolean props of React components or other boolean contexts.

## Rule Details

In boolean contexts, using logical OR is semantically correct and intentional as it converts falsy values (like `false`, `0`, `''`, `null`, and `undefined`) to `false`. Replacing these with nullish coalescing (`??`) would change the component's behavior since `??` only handles `null` and `undefined` values.

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

This rule doesn't mark any code as incorrect. It's designed to prevent the `@typescript-eslint/prefer-nullish-coalescing` rule from incorrectly flagging logical OR in boolean contexts.

## When Not To Use It

If you don't use the `@typescript-eslint/prefer-nullish-coalescing` rule, you don't need this rule.

## Further Reading

- [TypeScript ESLint prefer-nullish-coalescing rule](https://typescript-eslint.io/rules/prefer-nullish-coalescing/)
- [Nullish coalescing operator (??)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [Logical OR operator (||)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR)
