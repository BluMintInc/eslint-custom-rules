import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import requireHttpsError from '../rules/require-https-error';

type MessageIds = 'useHttpsError' | 'useProprietaryHttpsError';

const useHttpsErrorMessage =
  'Throwing "Error" in Cloud Functions returns a generic 500 and drops the structured status code clients rely on. Throw the proprietary HttpsError instead so responses include the correct status, sanitized message, and logging context.';

const proprietaryMessage = (reference: string, source: string) =>
  `${reference} comes from ${source} and bypasses our proprietary HttpsError wrapper, so responses skip standardized status codes, logging, and client-safe payloads. Import and throw HttpsError from @our-company/errors to keep errors consistent.`;

const expectMessage = (message: string) =>
  ({ message } as unknown as TSESLint.TestCaseError<MessageIds>);

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
    // Should allow non-HttpsError imports from firebase-admin
    {
      code: 'import { auth } from "firebase-admin";',
      filename: 'functions/src/test.ts',
    },
    // Should allow renamed non-HttpsError imports from firebase-admin
    {
      code: 'import { auth as authDefault } from "firebase-admin";',
      filename: 'functions/src/test.ts',
    },
  ],
  invalid: [
    // Should not allow throw new Error in functions/src
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/test.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
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
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // Should not allow throw new Error with multiple arguments in functions/src
    {
      code: 'throw new Error("test error", "additional info");',
      filename: 'functions/src/test.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // Should not allow firebase-admin HttpsError import
    {
      code: 'import { HttpsError } from "firebase-admin"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(proprietaryMessage('HttpsError', 'firebase-admin')),
        expectMessage(proprietaryMessage('HttpsError', 'firebase-admin')),
      ],
    },
    // Should use original source when later import lacks HttpsError
    {
      code: `
import { HttpsError } from "firebase-admin/lib/https-error";
import { auth } from "firebase-admin";
throw new HttpsError("failed-precondition", "test error");
      `,
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(
          proprietaryMessage('HttpsError', 'firebase-admin/lib/https-error'),
        ),
        expectMessage(
          proprietaryMessage('HttpsError', 'firebase-admin/lib/https-error'),
        ),
      ],
    },
    // Should not allow firebase-admin/lib/https-error import
    {
      code: 'import { HttpsError } from "firebase-admin/lib/https-error"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(
          proprietaryMessage('HttpsError', 'firebase-admin/lib/https-error'),
        ),
        expectMessage(
          proprietaryMessage('HttpsError', 'firebase-admin/lib/https-error'),
        ),
      ],
    },
    // Should not allow firebase-admin https.HttpsError usage
    {
      code: 'import { https } from "firebase-admin"; throw new https.HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(proprietaryMessage('https.HttpsError', 'firebase-admin')),
        expectMessage(proprietaryMessage('https.HttpsError', 'firebase-admin')),
      ],
    },
    // Should not allow renamed firebase-admin https import
    {
      code: 'import { https as firebaseHttps } from "firebase-admin"; throw new firebaseHttps.HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(
          proprietaryMessage('firebaseHttps.HttpsError', 'firebase-admin'),
        ),
        expectMessage(
          proprietaryMessage('firebaseHttps.HttpsError', 'firebase-admin'),
        ),
      ],
    },
  ],
});
