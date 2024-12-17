import { ruleTesterTs } from '../utils/ruleTester';
import requireHttpsError from '../rules/require-https-error';

ruleTesterTs.run('require-https-error', requireHttpsError, {
  valid: [
    // Should allow throw new Error outside functions/src
    {
      code: 'throw new Error("test error");',
      filename: 'src/components/test.ts',
    },
    // Should allow throw new HttpsError in functions/src
    {
      code: 'throw new HttpsError("INVALID_ARGUMENT", "test error");',
      filename: 'functions/src/test.ts',
    },
    // Should allow throw new CustomError in functions/src
    {
      code: 'throw new CustomError("test error");',
      filename: 'functions/src/test.ts',
    },
  ],
  invalid: [
    // Should not allow throw new Error in functions/src
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/test.ts',
      errors: [{ messageId: 'useHttpsError' }],
    },
    // Should not allow throw new Error with multiple arguments in functions/src
    {
      code: 'throw new Error("test error", "additional info");',
      filename: 'functions/src/test.ts',
      errors: [{ messageId: 'useHttpsError' }],
    },
  ],
});
