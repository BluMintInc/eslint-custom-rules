import { ruleTesterTs } from '../utils/ruleTester';
import { preferNullishCoalescingBooleanProps } from '../rules/prefer-nullish-coalescing-boolean-props';

ruleTesterTs.run(
  'prefer-nullish-coalescing-boolean-props',
  preferNullishCoalescingBooleanProps,
  {
    valid: [
      // Valid cases: Boolean props in JSX should allow logical OR
      {
        code: `
        function Component() {
          return (
            <LoadingButton
              disabled={
                !isValidated.phoneNumber ||
                !hasUserTyped.phoneNumber ||
                isLoading ||
                !isPhoneInputLoaded
              }
              id="phone-dialog-recaptcha"
              size="large"
              sx={{ width: '100%' }}
              type="submit"
              variant="contained"
              onClick={attemptSubmit}
            >
              Send Code
            </LoadingButton>
          );
        }
      `,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      // Other boolean props
      {
        code: `function Component() { return <Button disabled={isLoading || !isValid}>Submit</Button>; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Input required={hasValue || isRequired} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      {
        code: `function Component() { return <Checkbox checked={isSelected || defaultSelected} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // Non-JSX boolean contexts should also be valid
      `const isDisabled = !isValidated.phoneNumber || !hasUserTyped.phoneNumber || isLoading;`,
      `if (isLoading || !isValid) { return null; }`,
      `while (isLoading || hasError) { break; }`,
      `for (let i = 0; isLoading || i < 10; i++) { }`,

      // Regular nullish coalescing usage should be valid
      `const value = data ?? defaultValue;`,
      `const config = options?.settings ?? DEFAULT_SETTINGS;`,

      // Logical OR with non-nullish literals should be valid
      `const result = false || true;`,
      `const result = 0 || 1;`,
      `const result = '' || 'default';`,
    ],
    invalid: [
      // Cases where nullish coalescing should be preferred over logical OR
      {
        code: `const value = data || defaultValue;`,
        errors: [{ messageId: 'preferNullishCoalescing' }],
        output: `const value = data ?? defaultValue;`,
      },
      {
        code: `const config = options || {};`,
        errors: [{ messageId: 'preferNullishCoalescing' }],
        output: `const config = options ?? {};`,
      },
      {
        code: `const name = user.name || 'Anonymous';`,
        errors: [{ messageId: 'preferNullishCoalescing' }],
        output: `const name = user.name ?? 'Anonymous';`,
      },
      {
        code: `function getValue() { return param || fallback; }`,
        errors: [{ messageId: 'preferNullishCoalescing' }],
        output: `function getValue() { return param ?? fallback; }`,
      },
      // JSX props that are NOT boolean should still be flagged
      {
        code: `function Component() { return <Form autoComplete={value || 'off'} />; }`,
        parserOptions: { ecmaFeatures: { jsx: true } },
        errors: [{ messageId: 'preferNullishCoalescing' }],
        output: `function Component() { return <Form autoComplete={value ?? 'off'} />; }`,
      },
    ],
  },
);
