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
    // Issue #1264: a Windows backslash filename OUTSIDE functions/src stays
    // exempt after separator normalization — the rule only applies to
    // functions/src, so a frontend file throwing Error is not flagged.
    {
      code: 'throw new Error("test error");',
      filename: 'C:\\repo\\src\\components\\Foo.tsx',
    },
    // Issue #1380: Jest test files under functions/src are never invoked as a
    // Cloud Function and never return an HTTP response, so a plain Error in
    // test setup/fixtures is correct and must not require HttpsError.
    {
      code: `
describe('exampleGuard', () => {
  beforeAll(() => {
    if (!process.env.REQUIRED_ENV_VAR) {
      throw new Error('REQUIRED_ENV_VAR not set');
    }
  });
});`,
      filename: 'functions/src/util/example.test.ts',
    },
    // Multi-part suffixes (*.integration.test.ts) are test files too.
    {
      code: `
class FailureProcessor extends WebhookEventProcessor {
  protected async execute(): Promise<void> {
    throw new Error('Failure processor error');
  }
}`,
      filename: 'functions/src/util/webhook/EventRegistry.integration.test.ts',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/foo.integration.spec.ts',
    },
    // Every test/spec extension variant is exempt.
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/foo.spec.ts',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/components/Widget.test.tsx',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/components/Widget.spec.tsx',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/legacy/foo.test.js',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/foo.test.mts',
    },
    // Jest convention directories hold test-only modules.
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/__tests__/example.ts',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/__tests__/helpers/fixtures.ts',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/__mocks__/firebase-admin.ts',
    },
    // The exemption also covers the import visitor: a test may exercise
    // firebase-admin's HttpsError directly without violating the rule.
    {
      code: 'import { HttpsError } from "firebase-admin"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/util/foo.test.ts',
    },
    {
      code: 'import { https } from "firebase-admin"; throw new https.HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/util/foo.integration.test.ts',
    },
    // Windows separators must not defeat the test-file exemption.
    {
      code: 'throw new Error("test error");',
      filename: 'C:\\repo\\functions\\src\\util\\example.test.ts',
    },
    {
      code: 'throw new Error("test error");',
      filename: 'C:\\repo\\functions\\src\\__tests__\\example.ts',
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
    // Should track sources separately when multiple HttpsError imports exist
    {
      code: `
import { HttpsError as AdminHttpsError } from "firebase-admin";
import { HttpsError as FunctionsHttpsError } from "firebase-admin/lib/https-error";
throw new AdminHttpsError("failed-precondition", "test error");
throw new FunctionsHttpsError("failed-precondition", "test error");
      `,
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(proprietaryMessage('AdminHttpsError', 'firebase-admin')),
        expectMessage(
          proprietaryMessage(
            'FunctionsHttpsError',
            'firebase-admin/lib/https-error',
          ),
        ),
        expectMessage(proprietaryMessage('AdminHttpsError', 'firebase-admin')),
        expectMessage(
          proprietaryMessage(
            'FunctionsHttpsError',
            'firebase-admin/lib/https-error',
          ),
        ),
      ],
    },
    // Should track sources separately for multiple https imports
    {
      code: `
import { https as adminHttps } from "firebase-admin";
import { https as functionsHttps } from "firebase-admin/lib/https-error";
throw new adminHttps.HttpsError("failed-precondition", "test error");
throw new functionsHttps.HttpsError("failed-precondition", "test error");
      `,
      filename: 'functions/src/test.ts',
      errors: [
        expectMessage(
          proprietaryMessage('adminHttps.HttpsError', 'firebase-admin'),
        ),
        expectMessage(
          proprietaryMessage(
            'functionsHttps.HttpsError',
            'firebase-admin/lib/https-error',
          ),
        ),
        expectMessage(
          proprietaryMessage('adminHttps.HttpsError', 'firebase-admin'),
        ),
        expectMessage(
          proprietaryMessage(
            'functionsHttps.HttpsError',
            'firebase-admin/lib/https-error',
          ),
        ),
      ],
    },
    // Issue #1264: a Windows backslash filename inside functions/src must be
    // enforced. Before separator normalization the forward-slash `functions/src`
    // fragment never matched, so the rule silently no-op'd on Windows.
    {
      code: 'throw new Error("test error");',
      filename: 'C:\\repo\\functions\\src\\util\\foo.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // Issue #1380: the test-file exemption must stay narrow. Production
    // modules keep their enforcement, including realistic Cloud Function
    // entry points.
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/example.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/callable/tournament/respondToPending.f.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // Near misses: filenames merely CONTAINING "test"/"spec" are production
    // code, not Jest test files, so they stay enforced.
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/testUtils.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/latest.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/test-helpers.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/specification.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // A ".test." fragment in the middle of the name is not a test-file
    // suffix; a naive substring check would wrongly exempt this.
    {
      code: 'throw new Error("test error");',
      filename: 'functions/src/util/foo.test.helper.ts',
      errors: [expectMessage(useHttpsErrorMessage)],
    },
    // The import visitor also stays enforced in near-miss production files.
    {
      code: 'import { HttpsError } from "firebase-admin"; throw new HttpsError("failed-precondition", "test error");',
      filename: 'functions/src/util/testUtils.ts',
      errors: [
        expectMessage(proprietaryMessage('HttpsError', 'firebase-admin')),
        expectMessage(proprietaryMessage('HttpsError', 'firebase-admin')),
      ],
    },
  ],
});
