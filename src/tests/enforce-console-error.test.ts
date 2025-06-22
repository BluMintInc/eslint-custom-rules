import { ruleTesterTs } from '../utils/ruleTester';
import { enforceConsoleError } from '../rules/enforce-console-error';

ruleTesterTs.run('enforce-console-error', enforceConsoleError, {
  valid: [
    // Valid: Error severity with console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useErrorDialog = () => {
          const { open } = useAlertDialog('ERROR_DIALOG');

          const openErrorDialog = useCallback(() => {
            console.error('Error dialog shown to user: An error occurred.');
            open({
              title: 'Error Occurred',
              description: 'An error occurred. Please try again.',
              severity: 'error',
            });
          }, [open]);

          return { openErrorDialog };
        };
      `,
    },

    // Valid: Warning severity with console.warn
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useWarningDialog = () => {
          const { open } = useAlertDialog('WARNING_DIALOG');

          const openWarningDialog = useCallback(() => {
            console.warn('Warning dialog shown to user: This action may have consequences.');
            open({
              title: 'Warning',
              description: 'This action may have consequences.',
              severity: 'warning',
            });
          }, [open]);

          return { openWarningDialog };
        };
      `,
    },

    // Valid: Info severity (no console required)
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useInfoDialog = () => {
          const { open } = useAlertDialog('INFO_DIALOG');

          const openInfoDialog = useCallback(() => {
            open({
              title: 'Information',
              description: 'This is just information.',
              severity: 'info',
            });
          }, [open]);

          return { openInfoDialog };
        };
      `,
    },

    // Valid: Multiple severities with appropriate console statements
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useMixedDialog = () => {
          const { open } = useAlertDialog('MIXED_DIALOG');

          const openErrorDialog = useCallback(() => {
            console.error('Error dialog shown');
            open({
              title: 'Error',
              description: 'This is an error',
              severity: 'error',
            });
          }, [open]);

          const openWarningDialog = useCallback(() => {
            console.warn('Warning dialog shown');
            open({
              title: 'Warning',
              description: 'This is a warning',
              severity: 'warning',
            });
          }, [open]);

          const openInfoDialog = useCallback(() => {
            open({
              title: 'Info',
              description: 'This is information',
              severity: 'info',
            });
          }, [open]);

          return { openErrorDialog, openWarningDialog, openInfoDialog };
        };
      `,
    },

    // Valid: Dynamic severity with both console statements
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDynamicDialog = () => {
          const { open } = useAlertDialog('DYNAMIC_DIALOG');

          const openDialog = useCallback((message, severity) => {
            console.error('Error might be shown');
            console.warn('Warning might be shown');
            open({
              title: 'Alert',
              description: message,
              severity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
    },

    // Valid: Console statements before open call
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('About to show error dialog');
            const result = someOperation();
            open({
              title: 'Error',
              description: 'Something went wrong',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Console statements after open call
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            open({
              title: 'Error',
              description: 'Something went wrong',
              severity: 'error',
            });
            console.error('Error dialog was shown');
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: No useAlertDialog usage
    {
      code: `
        import { useCallback } from 'react';

        export const useRegularFunction = () => {
          const doSomething = useCallback(() => {
            console.log('Doing something');
          }, []);

          return { doSomething };
        };
      `,
    },

    // Valid: useAlertDialog without open calls
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          // Just getting the dialog, not using it
          return { open };
        };
      `,
    },

    // Valid: Nested functions with proper scoping
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const outerFunction = useCallback(() => {
            const innerFunction = () => {
              console.error('Error in inner function');
              open({
                title: 'Error',
                description: 'Inner error',
                severity: 'error',
              });
            };
            innerFunction();
          }, [open]);

          return { outerFunction };
        };
      `,
    },
  ],

  invalid: [
    // Invalid: Error severity without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useErrorDialog = () => {
          const { open } = useAlertDialog('ERROR_DIALOG');

          const openErrorDialog = useCallback(() => {
            open({
              title: 'Error Occurred',
              description: 'An error occurred. Please try again.',
              severity: 'error',
            });
          }, [open]);

          return { openErrorDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Warning severity without console.warn
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useWarningDialog = () => {
          const { open } = useAlertDialog('WARNING_DIALOG');

          const openWarningDialog = useCallback(() => {
            open({
              title: 'Warning',
              description: 'This action may have consequences.',
              severity: 'warning',
            });
          }, [open]);

          return { openWarningDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleWarn' }],
    },

    // Invalid: Error severity with wrong console method
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useErrorDialog = () => {
          const { open } = useAlertDialog('ERROR_DIALOG');

          const openErrorDialog = useCallback(() => {
            console.warn('This should be console.error');
            open({
              title: 'Error Occurred',
              description: 'An error occurred. Please try again.',
              severity: 'error',
            });
          }, [open]);

          return { openErrorDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Warning severity with wrong console method
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useWarningDialog = () => {
          const { open } = useAlertDialog('WARNING_DIALOG');

          const openWarningDialog = useCallback(() => {
            console.error('This should be console.warn');
            open({
              title: 'Warning',
              description: 'This action may have consequences.',
              severity: 'warning',
            });
          }, [open]);

          return { openWarningDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleWarn' }],
    },

    // Invalid: Multiple error dialogs, missing console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useMultipleErrorDialogs = () => {
          const { open } = useAlertDialog('ERROR_DIALOG');

          const openFirstError = useCallback(() => {
            open({
              title: 'First Error',
              description: 'First error occurred',
              severity: 'error',
            });
          }, [open]);

          const openSecondError = useCallback(() => {
            open({
              title: 'Second Error',
              description: 'Second error occurred',
              severity: 'error',
            });
          }, [open]);

          return { openFirstError, openSecondError };
        };
      `,
      errors: [
        { messageId: 'missingConsoleError' },
        { messageId: 'missingConsoleError' }
      ],
    },

    // Invalid: Mixed severities, missing console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useMixedDialog = () => {
          const { open } = useAlertDialog('MIXED_DIALOG');

          const openErrorDialog = useCallback(() => {
            console.warn('Warning is here but error console is missing');
            open({
              title: 'Error',
              description: 'This is an error',
              severity: 'error',
            });
          }, [open]);

          const openWarningDialog = useCallback(() => {
            open({
              title: 'Warning',
              description: 'This is a warning',
              severity: 'warning',
            });
          }, [open]);

          return { openErrorDialog, openWarningDialog };
        };
      `,
      errors: [
        { messageId: 'missingConsoleError' },
        { messageId: 'missingConsoleWarn' }
      ],
    },

    // Invalid: Mixed severities, missing console.warn
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useMixedDialog = () => {
          const { open } = useAlertDialog('MIXED_DIALOG');

          const openErrorDialog = useCallback(() => {
            console.error('Error console is here');
            open({
              title: 'Error',
              description: 'This is an error',
              severity: 'error',
            });
          }, [open]);

          const openWarningDialog = useCallback(() => {
            open({
              title: 'Warning',
              description: 'This is a warning',
              severity: 'warning',
            });
          }, [open]);

          return { openErrorDialog, openWarningDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleWarn' }],
    },

    // Invalid: Dynamic severity without both console statements
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDynamicDialog = () => {
          const { open } = useAlertDialog('DYNAMIC_DIALOG');

          const openDialog = useCallback((message, severity) => {
            open({
              title: 'Alert',
              description: message,
              severity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Dynamic severity with only console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDynamicDialog = () => {
          const { open } = useAlertDialog('DYNAMIC_DIALOG');

          const openDialog = useCallback((message, severity) => {
            console.error('Only error console present');
            open({
              title: 'Alert',
              description: message,
              severity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Dynamic severity with only console.warn
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDynamicDialog = () => {
          const { open } = useAlertDialog('DYNAMIC_DIALOG');

          const openDialog = useCallback((message, severity) => {
            console.warn('Only warn console present');
            open({
              title: 'Alert',
              description: message,
              severity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Severity from variable
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useVariableDialog = () => {
          const { open } = useAlertDialog('VARIABLE_DIALOG');
          const errorSeverity = 'error';

          const openDialog = useCallback(() => {
            open({
              title: 'Alert',
              description: 'Something happened',
              severity: errorSeverity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Severity from object property
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useObjectDialog = () => {
          const { open } = useAlertDialog('OBJECT_DIALOG');
          const config = { severity: 'error' };

          const openDialog = useCallback(() => {
            open({
              title: 'Alert',
              description: 'Something happened',
              severity: config.severity,
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Computed property for severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useComputedDialog = () => {
          const { open } = useAlertDialog('COMPUTED_DIALOG');

          const openDialog = useCallback(() => {
            open({
              title: 'Alert',
              description: 'Something happened',
              ['severity']: 'error',
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Function call result as severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useFunctionDialog = () => {
          const { open } = useAlertDialog('FUNCTION_DIALOG');

          const getSeverity = () => 'error';

          const openDialog = useCallback(() => {
            open({
              title: 'Alert',
              description: 'Something happened',
              severity: getSeverity(),
            });
          }, [open]);

          return { openDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Arrow function without useCallback
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useSimpleDialog = () => {
          const { open } = useAlertDialog('SIMPLE_DIALOG');

          const openErrorDialog = () => {
            open({
              title: 'Error',
              description: 'An error occurred',
              severity: 'error',
            });
          };

          return { openErrorDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Regular function declaration
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useRegularDialog = () => {
          const { open } = useAlertDialog('REGULAR_DIALOG');

          function openErrorDialog() {
            open({
              title: 'Error',
              description: 'An error occurred',
              severity: 'error',
            });
          }

          return { openErrorDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Inline function call
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useInlineDialog = () => {
          const { open } = useAlertDialog('INLINE_DIALOG');

          return {
            openError: () => {
              open({
                title: 'Error',
                description: 'An error occurred',
                severity: 'error',
              });
            }
          };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },
  ],
});
