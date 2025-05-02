import { ruleTesterTs } from '../utils/ruleTester';
import { preferNullishCoalescingBooleanProps } from '../rules/prefer-nullish-coalescing-boolean-props';

ruleTesterTs.run('prefer-nullish-coalescing-boolean-props', preferNullishCoalescingBooleanProps, {
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
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    // Other boolean props
    {
      code: `function Component() { return <Button disabled={isLoading || !isValid}>Submit</Button>; }`,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    {
      code: `function Component() { return <Input required={hasValue || isRequired} />; }`,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    {
      code: `function Component() { return <Checkbox checked={isSelected || defaultSelected} />; }`,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    {
      code: `function Component() { return <Form autoComplete={isAutoComplete || 'off'} />; }`,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },

    // Non-JSX boolean contexts should also be valid
    `const isDisabled = !isValidated.phoneNumber || !hasUserTyped.phoneNumber || isLoading;`,
    `if (isLoading || !isValid) { return null; }`,

    // Regular nullish coalescing usage (not in boolean context) should still be valid
    `const value = data ?? defaultValue;`,
    `const config = options?.settings ?? DEFAULT_SETTINGS;`,
  ],
  invalid: [
    // We're not marking anything as invalid since we're just preventing the base rule
    // from incorrectly flagging logical OR in boolean contexts
  ],
});
