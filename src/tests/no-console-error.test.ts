import { ruleTesterTs } from '../utils/ruleTester';
import { noConsoleError } from '../rules/no-console-error';

ruleTesterTs.run('no-console-error', noConsoleError, {
  valid: [
    `
      import { HttpsError } from 'firebase-functions/v2';

      async function submit() {
        throw new HttpsError('internal', 'fail');
      }
    `,
    {
      code: `
        import { logger } from 'firebase-functions/v2';
        logger.error('structured', { err: new Error('fail') });
      `,
      filename: 'functions/src/handler.ts',
    },
    `
      const { warn } = console;
      warn('warn once');
    `,
    `
      const log = console.log;
      log('info path');
    `,
    `
      console.warn('warn okay');
      console.info('info okay');
    `,
    `
      const logger = { error: () => {} };
      logger.error('structured');
    `,
    {
      code: `
        console.error('ignore in tests');
      `,
      filename: 'src/__tests__/example.test.ts',
    },
    {
      code: `
        console.error('ignore in mocks');
      `,
      filename: 'src/__mocks__/logger.ts',
    },
    {
      code: `
        console.error('ignore in playwright');
      `,
      filename: '__playwright__/setup.ts',
    },
    {
      code: `
        console.error('ignore in scripts');
      `,
      filename: 'scripts/build.ts',
    },
    {
      code: `
        console.error('tooling opt-out');
      `,
      filename: 'tools/temp.ts',
      options: [{ ignorePatterns: ['**/tools/**'] }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = () => {
            console.error('Error dialog shown to user');
            open({
              title: 'Error',
              description: 'Something went wrong',
              severity: 'error',
            });
          };

          return { showError };
        };
      `,
      options: [{ allowWithUseAlertDialog: true }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const dialog = useAlertDialog('DIALOG');

          const showError = () => {
            console.error('Error dialog shown to user');
            dialog.open({
              title: 'Error',
              description: 'Something went wrong',
              severity: 'error',
            });
          };

          return { showError };
        };
      `,
      options: [{ allowWithUseAlertDialog: true }],
    },
    `
      const structuredLogger = { error: () => {} };
      let err = console.error;
      err = structuredLogger.error;
      err('structured');
    `,
    `
      const console = { error: () => {} };
      console.error('shadowed console is allowed');
    `,
  ],
  invalid: [
    {
      code: `
        console.error('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        useAlertDialog('DIALOG');

        const open = (options) => {
          return options;
        };

        export const run = () => {
          console.error('boom');
          open({ severity: 'error' });
        };
      `,
      options: [{ allowWithUseAlertDialog: true }],
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        useAlertDialog('DIALOG');

        export const run = () => {
          const modal = {
            open: (options) => options,
          };
          console.error('boom');
          modal.open({ severity: 'error' });
        };
      `,
      options: [{ allowWithUseAlertDialog: true }],
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        console.error('boom')();
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        console?.error('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        console['error']('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const { error } = console;
        error('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const { error: logError } = console;
        logError('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const c = console;
        c.error('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const err = console.error;
        err('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const c = console;
        const err = c.error;
        err('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const c = console;
        c['error']('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const err = console?.error;
        err?.('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        let alias;
        ({ error: alias } = console);
        alias('boom');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        const structuredLogger = { error: () => {} };
        let err = console.error;
        err('boom');
        err = structuredLogger.error;
        err('structured');
      `,
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const severity = 'error';

          const showError = () => {
            console.error('Error dialog shown to user');
            open({
              title: 'Error',
              description: 'Something went wrong',
              severity, // Dynamic severity should be invalid
            });
          };

          return { showError };
        };
      `,
      options: [{ allowWithUseAlertDialog: true }],
      errors: [{ messageId: 'noConsoleError' }],
    },
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        function outer() {
          const { open } = useAlertDialog('DIALOG');
          console.error('allowed here');
          open({ severity: 'error' });
        }

        function unrelated() {
          const open = () => {}; // unrelated open
          console.error('should be invalid here');
          open({ severity: 'error' });
        }
      `,
      options: [{ allowWithUseAlertDialog: true }],
      errors: [{ messageId: 'noConsoleError' }],
    },
  ],
});
