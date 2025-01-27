import { ruleTesterTs } from '../utils/ruleTester';
import requireHttpsError from '../rules/require-https-error';

ruleTesterTs.run('require-https-error', requireHttpsError, {
  valid: [
    // Should allow throw new HttpsError
    {
      code: 'import { HttpsError } from "@our-company/errors"; throw new HttpsError("INVALID_ARGUMENT", "test error");',
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
    // Should not allow throw new Error in type assertion functions
    {
      code: `
export function assertPositiveInteger(value: number): asserts value is PositiveInteger {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(\`Value \${value} must be a positive integer\`);
  }
}`,
      filename: 'functions/src/test.ts',
      errors: [{ messageId: 'useHttpsError' }],
    },
    // Should not allow throw new Error with multiple arguments in functions/src
    {
      code: 'throw new Error("test error", "additional info");',
      filename: 'functions/src/test.ts',
      errors: [{ messageId: 'useHttpsError' }],
    },
    // Should not allow firebase-admin HttpsError import
    {
      code: 'import { HttpsError } from "firebase-admin"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        { messageId: 'useProprietaryHttpsError' },
        { messageId: 'useProprietaryHttpsError' },
      ],
    },
    // Should not allow firebase-admin/lib/https-error import
    {
      code: 'import { HttpsError } from "firebase-admin/lib/https-error"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        { messageId: 'useProprietaryHttpsError' },
        { messageId: 'useProprietaryHttpsError' },
      ],
    },
    // Should not allow firebase-admin https.HttpsError usage
    {
      code: 'import { https } from "firebase-admin"; throw new https.HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        { messageId: 'useProprietaryHttpsError' },
        { messageId: 'useProprietaryHttpsError' },
      ],
    },
    // Should not allow renamed firebase-admin https import
    {
      code: 'import { https as firebaseHttps } from "firebase-admin"; throw new firebaseHttps.HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        { messageId: 'useProprietaryHttpsError' },
        { messageId: 'useProprietaryHttpsError' },
      ],
    },
  ],
});
