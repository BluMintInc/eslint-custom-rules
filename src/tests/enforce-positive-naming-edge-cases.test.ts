import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming-edge-cases', enforcePositiveNaming, {
  valid: [
    // Edge case: Type parameter with negative name from external library
    `
    import { ErrorType } from 'error-lib';

    function processError<T extends ErrorType>(error: T) {
      console.error(error);
    }
    `,

    // Edge case: Destructured import with negative naming
    `
    import { errors } from 'api-lib';
    const { InvalidRequestError, UnauthorizedError } = errors;

    function handleApiErrors(error: InvalidRequestError | UnauthorizedError) {
      console.error(error.message);
    }
    `,

    // Edge case: Re-exporting types with negative naming
    `
    import { ValidationError } from 'validation-lib';
    export { ValidationError };

    // This should not trigger the rule
    export function validateInput(input: string): ValidationError | null {
      return input ? null : { message: 'Invalid input' };
    }
    `,

    // Edge case: Dynamic import with negative naming
    `
    async function loadErrorHandler() {
      const { ErrorHandler } = await import('error-lib');
      return new ErrorHandler();
    }
    `,

    // Edge case: Type assertion with imported type
    `
    import { ErrorResponse } from 'api-lib';

    function handleResponse(response: unknown) {
      const errorResponse = response as ErrorResponse;
      console.error(errorResponse.message);
    }
    `,

    // Edge case: Using imported type in JSX component props
    `
    import { ErrorProps } from 'ui-lib';
    import React from 'react';

    function ErrorComponent(props: ErrorProps) {
      return <div>{props.message}</div>;
    }
    `,

    // Edge case: Using imported type in class implements clause
    `
    import { ErrorHandler } from 'error-lib';

    class CustomErrorHandler implements ErrorHandler {
      handleError(error: Error): void {
        console.error(error);
      }
    }
    `,

    // Edge case: Using imported type in mapped type
    `
    import { ErrorCodes } from 'error-lib';

    type ErrorMessages = {
      [K in keyof ErrorCodes]: string;
    };

    const messages: ErrorMessages = {
      NOT_FOUND: 'Resource not found',
      UNAUTHORIZED: 'Unauthorized access',
    };
    `,

    // Edge case: Using imported type in conditional type
    `
    import { ErrorResult } from 'result-lib';

    type ExtractError<T> = T extends ErrorResult ? T['error'] : never;

    function getErrorMessage<T extends ErrorResult>(result: T): string {
      return result.error.message;
    }
    `,

    // Edge case: Using imported type in indexed access type
    `
    import { ErrorMap } from 'error-lib';

    type ValidationError = ErrorMap['validation'];

    function handleValidationError(error: ValidationError) {
      console.error(error.message);
    }
    `,

    // Edge case: Using imported namespace in type declaration
    `
    import * as Errors from 'error-lib';

    type AppError = Errors.ValidationError | Errors.NetworkError;

    function logError(error: AppError) {
      console.error(error.message);
    }
    `,

    // Edge case: Using imported type with negative name in array/promise type
    `
    import { ErrorResponse } from 'api-lib';

    async function fetchErrors(): Promise<ErrorResponse[]> {
      return [];
    }
    `,

    // Edge case: Using imported type with negative name in function overloads
    `
    import { ErrorCallback, ErrorEvent } from 'event-lib';

    function addEventListener(type: 'error', callback: ErrorCallback): void;
    function addEventListener(type: string, callback: Function): void {
      // Implementation
    }
    `
  ],
  invalid: [
    // Edge case: Local variable with negative name using imported type (should still be invalid)
    {
      code: `
      import { Error } from 'error-lib';

      // Local variable with negative naming
      const invalidData: Error = { message: 'Something went wrong' };
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'invalidData',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Edge case: Local type extending imported type with negative name (should still be invalid)
    {
      code: `
      import { BaseError } from 'error-lib';

      // Local type with negative naming
      interface InvalidInputError extends BaseError {
        field: string;
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'InvalidInputError',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Edge case: Local function with negative name using imported type (should still be invalid)
    {
      code: `
      import { ErrorResponse } from 'api-lib';

      // Local function with negative naming
      function handleInvalidResponse(response: ErrorResponse) {
        console.error(response);
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'handleInvalidResponse',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Edge case: Local class with negative method using imported type (should still be invalid)
    {
      code: `
      import { ErrorEvent } from 'event-lib';

      class EventHandler {
        // Method with negative naming
        public handleInvalidEvent(event: ErrorEvent) {
          console.error(event);
        }
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'handleInvalidEvent',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Edge case: Local variable with negative name in destructuring (should still be invalid)
    {
      code: `
      import { Response } from 'api-lib';

      function processResponse(response: Response) {
        const { error: invalidData } = response;
        console.error(invalidData);
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'invalidData',
            alternatives: 'isValid',
          },
        },
      ],
    }
  ],
});
