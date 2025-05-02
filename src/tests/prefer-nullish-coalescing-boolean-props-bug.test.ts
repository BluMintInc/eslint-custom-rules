import { ruleTesterTs } from '../utils/ruleTester';
import { preferNullishCoalescingBooleanProps } from '../rules/prefer-nullish-coalescing-boolean-props';

/**
 * This test specifically tests the bug case mentioned in the issue:
 * The `@typescript-eslint/prefer-nullish-coalescing` rule incorrectly flags logical OR (`||`)
 * operators inside boolean props of React components.
 */
ruleTesterTs.run('prefer-nullish-coalescing-boolean-props-bug', preferNullishCoalescingBooleanProps, {
  valid: [
    // The exact example from the bug report
    {
      code: `
        function PhoneDialog() {
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
    }
  ],
  invalid: []
});
