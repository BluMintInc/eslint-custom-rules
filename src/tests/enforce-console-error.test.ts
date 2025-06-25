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

    // Valid: Destructuring with different patterns
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const dialog = useAlertDialog('DIALOG');
          const { open } = dialog;

          const showError = useCallback(() => {
            console.error('Error with different destructuring');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Spread operator with severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const errorConfig = { severity: 'error' };

          const showError = useCallback(() => {
            console.error('Error with spread operator');
            open({
              title: 'Error',
              description: 'Error occurred',
              ...errorConfig,
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Async function with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(async () => {
            console.error('Async error');
            await someAsyncOperation();
            open({
              title: 'Error',
              description: 'Async error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Generator function with error severity
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          function* showError() {
            console.error('Generator error');
            yield open({
              title: 'Error',
              description: 'Generator error occurred',
              severity: 'error',
            });
          }

          return { showError };
        };
      `,
    },

    // Valid: Class method with error severity
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        class DialogManager {
          constructor() {
            const { open } = useAlertDialog('DIALOG');
            this.open = open;
          }

          showError() {
            console.error('Class method error');
            this.open({
              title: 'Error',
              description: 'Class error occurred',
              severity: 'error',
            });
          }
        }
      `,
    },

    // Valid: Try-catch block with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            try {
              riskyOperation();
            } catch (error) {
              console.error('Caught error');
              open({
                title: 'Error',
                description: 'Operation failed',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Loop with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showErrors = useCallback(() => {
            for (let i = 0; i < errors.length; i++) {
              console.error('Loop error');
              open({
                title: 'Error',
                description: 'Loop error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showErrors };
        };
      `,
    },

    // Valid: Conditional with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((condition) => {
            if (condition) {
              console.error('Conditional error');
              open({
                title: 'Error',
                description: 'Conditional error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: IIFE with error severity
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const result = (() => {
            console.error('IIFE error');
            open({
              title: 'Error',
              description: 'IIFE error occurred',
              severity: 'error',
            });
            return 'done';
          })();

          return { result };
        };
      `,
    },

    // Valid: Higher-order function with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const createErrorHandler = useCallback(() => {
            return () => {
              console.error('HOF error');
              open({
                title: 'Error',
                description: 'HOF error occurred',
                severity: 'error',
              });
            };
          }, [open]);

          return { createErrorHandler };
        };
      `,
    },

    // Valid: Promise chain with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            Promise.resolve()
              .then(() => {
                console.error('Promise error');
                open({
                  title: 'Error',
                  description: 'Promise error occurred',
                  severity: 'error',
                });
              });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Multiple useAlertDialog instances
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open: openError } = useAlertDialog('ERROR_DIALOG');
          const { open: openWarning } = useAlertDialog('WARNING_DIALOG');

          const showError = useCallback(() => {
            console.error('Multiple instance error');
            openError({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [openError]);

          const showWarning = useCallback(() => {
            console.warn('Multiple instance warning');
            openWarning({
              title: 'Warning',
              description: 'Warning occurred',
              severity: 'warning',
            });
          }, [openWarning]);

          return { showError, showWarning };
        };
      `,
    },

    // Valid: Object shorthand property (treated as dynamic)
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const severity = 'error';

          const showError = useCallback(() => {
            console.error('Object shorthand error');
            console.warn('Object shorthand warning');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity,
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Template literal severity (treated as dynamic)
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const type = 'error';

          const showError = useCallback(() => {
            console.error('Template literal error');
            console.warn('Template literal warning');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: \`\${type}\`,
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Recursive function with error severity
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          function recursiveError(count) {
            if (count > 0) {
              console.error('Recursive error');
              open({
                title: 'Error',
                description: 'Recursive error occurred',
                severity: 'error',
              });
              recursiveError(count - 1);
            }
          }

          return { recursiveError };
        };
      `,
    },

    // Valid: Event handler with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const handleError = useCallback((event) => {
            console.error('Event handler error');
            open({
              title: 'Error',
              description: 'Event error occurred',
              severity: 'error',
            });
          }, [open]);

          return { handleError };
        };
      `,
    },

    // Valid: Closure with error severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const errorMessage = 'Closure error';

          const showError = useCallback(() => {
            const innerFunction = () => {
              console.error('Closure error');
              open({
                title: 'Error',
                description: errorMessage,
                severity: 'error',
              });
            };
            return innerFunction;
          }, [open, errorMessage]);

          return { showError };
        };
      `,
    },

    // Valid: Arrow function with expression body
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = () => (
            console.error('Arrow expression error'),
            open({
              title: 'Error',
              description: 'Arrow error occurred',
              severity: 'error',
            })
          );

          return { showError };
        };
      `,
    },

    // Valid: Function with multiple console calls
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.log('Starting error process');
            console.error('Error occurred');
            console.debug('Debug info');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Nested object with severity
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('Nested object error');
            const config = {
              dialog: {
                title: 'Error',
                description: 'Error occurred',
                severity: 'error',
              }
            };
            open(config.dialog);
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Complex destructuring patterns
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open: showDialog, close } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('Complex destructuring error');
            showDialog({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [showDialog]);

          return { showError };
        };
      `,
    },

    // Valid: Mixed import patterns
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog as useDialog } from '../useAlertDialog';

        export const useErrorHandler = () => {
          const { open } = useDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('Aliased import error');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Conditional console calls
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((shouldLog) => {
            if (shouldLog) {
              console.error('Conditional error logging');
            }
            console.error('Always log error');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Multiple severity types in same function
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showDialog = useCallback((type) => {
            console.error('Error logging for all cases');
            console.warn('Warning logging for all cases');

            if (type === 'error') {
              open({
                title: 'Error',
                description: 'Error occurred',
                severity: 'error',
              });
            } else {
              open({
                title: 'Warning',
                description: 'Warning occurred',
                severity: 'warning',
              });
            }
          }, [open]);

          return { showDialog };
        };
      `,
    },

    // Valid: Computed property with literal
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('Computed property error');
            open({
              title: 'Error',
              description: 'Error occurred',
              ['severity']: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Function with early return
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((condition) => {
            if (!condition) return;

            console.error('Early return error');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
    },

    // Valid: Async/await with error handling
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(async () => {
            try {
              await riskyAsyncOperation();
            } catch (error) {
              console.error('Async error caught');
              open({
                title: 'Error',
                description: 'Async error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
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
        { messageId: 'missingConsoleError' },
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
        { messageId: 'missingConsoleWarn' },
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

    // Invalid: Async function without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(async () => {
            await someAsyncOperation();
            open({
              title: 'Error',
              description: 'Async error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Generator function without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          function* showError() {
            yield open({
              title: 'Error',
              description: 'Generator error occurred',
              severity: 'error',
            });
          }

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Class method without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        class DialogManager {
          constructor() {
            const { open } = useAlertDialog('DIALOG');
            this.open = open;
          }

          showError() {
            this.open({
              title: 'Error',
              description: 'Class error occurred',
              severity: 'error',
            });
          }
        }
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Try-catch block without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            try {
              riskyOperation();
            } catch (error) {
              open({
                title: 'Error',
                description: 'Operation failed',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Loop without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showErrors = useCallback(() => {
            for (let i = 0; i < errors.length; i++) {
              open({
                title: 'Error',
                description: 'Loop error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showErrors };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Conditional without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((condition) => {
            if (condition) {
              open({
                title: 'Error',
                description: 'Conditional error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: IIFE without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const result = (() => {
            open({
              title: 'Error',
              description: 'IIFE error occurred',
              severity: 'error',
            });
            return 'done';
          })();

          return { result };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Higher-order function without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const createErrorHandler = useCallback(() => {
            return () => {
              open({
                title: 'Error',
                description: 'HOF error occurred',
                severity: 'error',
              });
            };
          }, [open]);

          return { createErrorHandler };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Promise chain without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            Promise.resolve()
              .then(() => {
                open({
                  title: 'Error',
                  description: 'Promise error occurred',
                  severity: 'error',
                });
              });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Object shorthand property without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const severity = 'error';

          const showError = useCallback(() => {
            open({
              title: 'Error',
              description: 'Error occurred',
              severity,
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Template literal severity without both console statements
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const type = 'error';

          const showError = useCallback(() => {
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: \`\${type}\`,
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Recursive function without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          function recursiveError(count) {
            if (count > 0) {
              open({
                title: 'Error',
                description: 'Recursive error occurred',
                severity: 'error',
              });
              recursiveError(count - 1);
            }
          }

          return { recursiveError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Event handler without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const handleError = useCallback((event) => {
            open({
              title: 'Error',
              description: 'Event error occurred',
              severity: 'error',
            });
          }, [open]);

          return { handleError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Closure without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');
          const errorMessage = 'Closure error';

          const showError = useCallback(() => {
            const innerFunction = () => {
              open({
                title: 'Error',
                description: errorMessage,
                severity: 'error',
              });
            };
            return innerFunction;
          }, [open, errorMessage]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Arrow function with expression body without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = () => (
            open({
              title: 'Error',
              description: 'Arrow error occurred',
              severity: 'error',
            })
          );

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Multiple console calls but wrong type
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.log('Starting error process');
            console.warn('This should be console.error');
            console.debug('Debug info');
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Multiple useAlertDialog instances with missing console
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open: openError } = useAlertDialog('ERROR_DIALOG');
          const { open: openWarning } = useAlertDialog('WARNING_DIALOG');

          const showError = useCallback(() => {
            openError({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [openError]);

          const showWarning = useCallback(() => {
            openWarning({
              title: 'Warning',
              description: 'Warning occurred',
              severity: 'warning',
            });
          }, [openWarning]);

          return { showError, showWarning };
        };
      `,
      errors: [
        { messageId: 'missingConsoleError' },
        { messageId: 'missingConsoleWarn' },
      ],
    },

    // Invalid: Switch statement without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showDialog = useCallback((type) => {
            switch (type) {
              case 'error':
                open({
                  title: 'Error',
                  description: 'Error occurred',
                  severity: 'error',
                });
                break;
              case 'warning':
                open({
                  title: 'Warning',
                  description: 'Warning occurred',
                  severity: 'warning',
                });
                break;
            }
          }, [open]);

          return { showDialog };
        };
      `,
      errors: [
        { messageId: 'missingConsoleError' },
        { messageId: 'missingConsoleWarn' },
      ],
    },

    // Invalid: Ternary operator without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showDialog = useCallback((isError) => {
            open({
              title: isError ? 'Error' : 'Warning',
              description: isError ? 'Error occurred' : 'Warning occurred',
              severity: isError ? 'error' : 'warning',
            });
          }, [open]);

          return { showDialog };
        };
      `,
      errors: [{ messageId: 'missingConsoleBoth' }],
    },

    // Invalid: Logical AND operator without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((shouldShow) => {
            shouldShow && open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Logical OR operator without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            const result = someOperation() || open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Array method callback without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showErrors = useCallback(() => {
            errors.forEach(() => {
              open({
                title: 'Error',
                description: 'Error occurred',
                severity: 'error',
              });
            });
          }, [open]);

          return { showErrors };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: setTimeout callback without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            setTimeout(() => {
              open({
                title: 'Error',
                description: 'Delayed error occurred',
                severity: 'error',
              });
            }, 1000);
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: setInterval callback without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            setInterval(() => {
              open({
                title: 'Error',
                description: 'Interval error occurred',
                severity: 'error',
              });
            }, 1000);
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: requestAnimationFrame callback without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            requestAnimationFrame(() => {
              open({
                title: 'Error',
                description: 'Animation error occurred',
                severity: 'error',
              });
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Object method without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const dialogManager = {
            showError() {
              open({
                title: 'Error',
                description: 'Object method error occurred',
                severity: 'error',
              });
            }
          };

          return { dialogManager };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Getter method without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const dialogManager = {
            get errorDialog() {
              open({
                title: 'Error',
                description: 'Getter error occurred',
                severity: 'error',
              });
              return 'error';
            }
          };

          return { dialogManager };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Setter method without console.error
    {
      code: `
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const dialogManager = {
            set errorDialog(value) {
              open({
                title: 'Error',
                description: 'Setter error occurred',
                severity: 'error',
              });
            }
          };

          return { dialogManager };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Destructuring assignment without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const dialog = useAlertDialog('DIALOG');
          const { open } = dialog;

          const showError = useCallback(() => {
            open({
              title: 'Error',
              description: 'Destructuring error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Rest parameters without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((...args) => {
            open({
              title: 'Error',
              description: 'Rest params error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Default parameters without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((message = 'Default error') => {
            open({
              title: 'Error',
              description: message,
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Complex destructuring without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open: showDialog, close } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            showDialog({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [showDialog]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Aliased import without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog as useDialog } from '../useAlertDialog';

        export const useErrorHandler = () => {
          const { open } = useDialog('DIALOG');

          const showError = useCallback(() => {
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Early return without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((condition) => {
            if (!condition) return;

            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Async/await without console.error
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(async () => {
            try {
              await riskyAsyncOperation();
            } catch (error) {
              open({
                title: 'Error',
                description: 'Async error occurred',
                severity: 'error',
              });
            }
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Multiple severity types without proper console calls
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showDialog = useCallback((type) => {
            console.log('Only log, not error or warn');

            if (type === 'error') {
              open({
                title: 'Error',
                description: 'Error occurred',
                severity: 'error',
              });
            } else {
              open({
                title: 'Warning',
                description: 'Warning occurred',
                severity: 'warning',
              });
            }
          }, [open]);

          return { showDialog };
        };
      `,
      errors: [
        { messageId: 'missingConsoleError' },
        { messageId: 'missingConsoleWarn' },
      ],
    },

    // Invalid: Conditional console but missing required type
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback((shouldLog) => {
            if (shouldLog) {
              console.warn('Wrong console type');
            }
            open({
              title: 'Error',
              description: 'Error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Nested function without console in correct scope
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const outerFunction = useCallback(() => {
            console.error('Error in outer function');
            const innerFunction = () => {
              // Missing console.error in this scope
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
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Promise chain without console in correct scope
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showError = useCallback(() => {
            console.error('Error in outer scope');
            Promise.resolve()
              .then(() => {
                // Missing console.error in this scope
                open({
                  title: 'Error',
                  description: 'Promise error occurred',
                  severity: 'error',
                });
              });
          }, [open]);

          return { showError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },

    // Invalid: Mixed valid and invalid in same file
    {
      code: `
        import { useCallback } from 'react';
        import { useAlertDialog } from '../useAlertDialog';

        export const useDialog = () => {
          const { open } = useAlertDialog('DIALOG');

          const showValidError = useCallback(() => {
            console.error('Valid error');
            open({
              title: 'Error',
              description: 'Valid error occurred',
              severity: 'error',
            });
          }, [open]);

          const showInvalidError = useCallback(() => {
            // Missing console.error
            open({
              title: 'Error',
              description: 'Invalid error occurred',
              severity: 'error',
            });
          }, [open]);

          return { showValidError, showInvalidError };
        };
      `,
      errors: [{ messageId: 'missingConsoleError' }],
    },
  ],
});
