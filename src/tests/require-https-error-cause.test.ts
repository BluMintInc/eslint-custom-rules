import { ruleTesterTs } from '../utils/ruleTester';
import { requireHttpsErrorCause } from '../rules/require-https-error-cause';

ruleTesterTs.run('require-https-error-cause', requireHttpsErrorCause, {
  valid: [
    `
      try {
        await doWork();
      } catch (error) {
        throw new HttpsError('internal', 'Operation failed', undefined, error);
      }
    `,
    `
      try {
        await doWork();
      } catch (err) {
        throw new HttpsError('internal', 'Operation failed', { context: 123 }, err);
      }
    `,
    `
      try {
        await doWork();
      } catch (e) {
        throw new HttpsError('internal', 'Operation failed', undefined, e);
      }
    `,
    `
      try {
        await doWork();
      } catch (err) {
        throw new HttpsError('internal', 'Operation failed', { context: 123 }, err, 'stack override');
      }
    `,
    `
      const https = { HttpsError };
      try {
        await doWork();
      } catch (error) {
        throw new https.HttpsError('internal', 'Operation failed', undefined, error);
      }
    `,
    `
      try {
        await doWork();
      } catch (error) {
        const shouldThrow = true;
        if (shouldThrow) {
          throw new HttpsError('internal', 'Operation failed', undefined, error);
        }
      }
    `,
    `
      try {
        await doWork();
      } catch (error) {
        const buildError = () =>
          new HttpsError('internal', 'Operation failed', undefined, error);
        throw buildError();
      }
    `,
    `
      try {
        await doWork();
      } catch (outerError) {
        try {
          await doOtherWork();
        } catch (innerError) {
          throw new HttpsError('internal', 'Operation failed', undefined, innerError);
        }
      }
    `,
    `
      function buildError() {
        return new HttpsError('internal', 'Operation failed');
      }
    `,
    `
      try {
        await doWork();
      } catch (error) {
        throw new HttpsError('internal', 'Operation failed', void 0, error);
      }
    `,
    `
      try {
        await doWork();
      } catch (error) {
        throw HttpsError('internal', 'Operation failed', undefined, error);
      }
    `,
  ],
  invalid: [
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw HttpsError('internal', 'Operation failed');
        }
      `,
      errors: [{ messageId: 'missingCause' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw HttpsError('internal', 'Operation failed', undefined, new Error('other'));
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw new HttpsError('internal', 'Operation failed');
        }
      `,
      errors: [{ messageId: 'missingCause' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (e) {
          throw new HttpsError('internal', 'Operation failed', { e });
        }
      `,
      errors: [{ messageId: 'missingCause' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (err) {
          throw new HttpsError('internal', 'Operation failed', { context: 123 });
        }
      `,
      errors: [{ messageId: 'missingCause' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          const otherError = new Error('other');
          throw new HttpsError('internal', 'Operation failed', undefined, otherError);
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw new HttpsError('internal', 'Operation failed', undefined, error.cause);
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw new HttpsError('internal', 'Operation failed', undefined, sanitize(error));
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          const error = new Error('shadowed');
          throw new HttpsError('internal', 'Operation failed', undefined, error);
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch {
          throw new HttpsError('internal', 'Operation failed');
        }
      `,
      errors: [{ messageId: 'missingCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch ({ message }) {
          throw new HttpsError('internal', 'Operation failed', undefined, message);
        }
      `,
      errors: [{ messageId: 'missingCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch {
          throw new HttpsError('internal', 'Operation failed', undefined, new Error('placeholder'));
        }
      `,
      errors: [{ messageId: 'missingCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          throw new HttpsError('internal', 'Operation failed', undefined, null);
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
    {
      code: `
        try {
          await doWork();
        } catch (error) {
          const cause = new Error('upstream');
          throw new HttpsError('internal', 'Operation failed', undefined, cause);
        }
      `,
      errors: [{ messageId: 'causeNotCatchBinding' }],
    },
  ],
});
