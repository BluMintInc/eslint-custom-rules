import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming-imported-types', enforcePositiveNaming, {
  valid: [
    // This should be valid because ResponseError is imported from an external library
    `
    import { ResponseError } from 'external-lib';

    function handleError(error: ResponseError) {
      console.error(error.message);
    }
    `,

    // This should be valid because it's using an imported type with negative naming
    `
    import { ValidationError } from 'validation-lib';
    import { NotFoundError } from 'http-errors';

    function processErrors(validationError: ValidationError, notFoundError: NotFoundError) {
      // Process errors
    }
    `,

    // This should be valid because it's using a qualified import with negative naming
    `
    import * as Errors from 'error-lib';

    function handleApiError(error: Errors.InvalidRequestError) {
      console.error(error.message);
    }
    `,

    // This should be valid because it's using a type from a namespace import
    `
    import * as API from 'api-client';

    function handleFailure(error: API.Errors.FailureResponse) {
      console.error(error.message);
    }
    `,

    // This should be valid because it's using a renamed import with negative naming
    `
    import { ResponseError as ApiError } from 'external-lib';

    function handleApiError(error: ApiError) {
      console.error(error.message);
    }
    `,

    // This should be valid because it's using a type from a default import
    `
    import axios from 'axios';

    function handleAxiosError(error: axios.AxiosError) {
      console.error(error.message);
    }
    `,

    // This should be valid because it's extending an imported type with negative naming
    `
    import { ErrorResponse } from 'api-lib';

    interface CustomErrorResponse extends ErrorResponse {
      customField: string;
    }

    function handleCustomError(error: CustomErrorResponse) {
      console.error(error.customField);
    }
    `,

    // This should be valid because it's using an imported type in a type alias
    `
    import { ValidationError } from 'validation-lib';

    type AppError = ValidationError | Error;

    function handleAppError(error: AppError) {
      console.error(error);
    }
    `,

    // This should be valid because it's using an imported type in a function return type
    `
    import { ErrorResult } from 'result-lib';

    function validateInput(input: string): ErrorResult | null {
      if (!input) {
        return { error: 'Input is required' };
      }
      return null;
    }
    `,

    // This should be valid because it's using an imported type in a class property
    `
    import { ErrorCallback } from 'callback-lib';

    class ErrorHandler {
      private onError: ErrorCallback;

      constructor(callback: ErrorCallback) {
        this.onError = callback;
      }
    }
    `,

    // This should be valid because it's using an imported type in a generic
    `
    import { FailureResponse } from 'api-lib';

    function processResult<T extends FailureResponse>(result: T) {
      console.error(result.message);
    }
    `,

    // This should be valid because it's using an imported type in an intersection type
    `
    import { ErrorDetails } from 'error-lib';

    type EnhancedError = Error & ErrorDetails;

    function logEnhancedError(error: EnhancedError) {
      console.error(error.code, error.message);
    }
    `,

    // This should be valid because it's using an imported type in a union type
    `
    import { ValidationError, NotFoundError } from 'error-lib';

    type ApplicationError = ValidationError | NotFoundError | Error;

    function handleApplicationError(error: ApplicationError) {
      console.error(error);
    }
    `
  ],
  invalid: [
    // This should still be invalid because it's a locally defined type with negative naming
    {
      code: `
      // Local type definition with negative naming
      type InvalidRequest = {
        message: string;
      };

      function processRequest(request: InvalidRequest) {
        console.log(request.message);
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'InvalidRequest',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // This should still be invalid because it's a locally defined interface with negative naming
    {
      code: `
      // Local interface with negative naming
      interface InvalidResponse {
        message: string;
      }

      function handleResponse(response: InvalidResponse) {
        console.log(response.message);
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'InvalidResponse',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // This should still be invalid because it's using a local variable with negative naming
    // even though it's using an imported type
    {
      code: `
      import { ResponseError } from 'external-lib';

      // Local variable with negative naming
      const invalidHandler = (error: ResponseError) => {
        console.error(error.message);
      };
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'invalidHandler',
            alternatives: 'isValid',
          },
        },
      ],
    }
  ],
});
