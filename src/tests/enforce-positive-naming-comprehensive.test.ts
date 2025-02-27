import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming-comprehensive', enforcePositiveNaming, {
  valid: [
    // External imported types should be ignored
    `
      import { ResponseError } from 'external-lib';

      function handleError(error: ResponseError) {
        console.error(error.message);
      }
    `,
    // External imported namespaces should be ignored
    `
      import * as Errors from 'error-lib';

      function handleError(error: Errors.ValidationError) {
        console.error(error.message);
      }
    `,
    // External imported types in type aliases should be ignored
    `
      import { ErrorType } from 'error-lib';

      type AppError = ErrorType;

      function processError(error: AppError) {
        console.error(error);
      }
    `,
    // External imported types in interfaces should be ignored
    `
      import { ErrorBase } from 'error-lib';

      interface CustomError extends ErrorBase {
        code: string;
      }
    `,
    // External imported types in union types should be ignored
    `
      import { ValidationError, NetworkError } from 'error-lib';

      type AppError = ValidationError | NetworkError;

      function handleError(error: AppError) {
        console.error(error);
      }
    `,
    // External imported types in intersection types should be ignored
    `
      import { ErrorDetails } from 'error-lib';

      type DetailedError = Error & ErrorDetails;

      function logError(error: DetailedError) {
        console.error(error);
      }
    `,
    // External imported types in array types should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      async function fetchErrors(): Promise<ErrorResponse[]> {
        return [];
      }
    `,
    // External imported types in generic types should be ignored
    `
      import { Result, ErrorType } from 'result-lib';

      function processResult<T>(result: Result<T, ErrorType>) {
        if (result.isError) {
          console.error(result.error);
        }
      }
    `,
    // External imported types in function return types should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      function createError(): ErrorResponse {
        return { message: 'Error occurred' };
      }
    `,
    // External imported types in variable declarations should be ignored
    `
      import { ErrorDetails } from 'error-lib';

      const errorDetails: ErrorDetails = { code: '404', message: 'Not found' };
    `,
    // External imported types in destructuring should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      function processResponse(response: unknown) {
        const errorResponse = response as ErrorResponse;
        console.error(errorResponse.message);
      }
    `,
    // External imported types in class methods should be ignored
    `
      import { ErrorEvent } from 'event-lib';

      class EventHandler {
        handleError(event: ErrorEvent) {
          console.error(event);
        }
      }
    `,
    // External imported types in object methods should be ignored
    `
      import { ErrorCallback } from 'callback-lib';

      const handlers = {
        handleError(callback: ErrorCallback) {
          callback({ message: 'Error occurred' });
        }
      };
    `,
    // External imported types in arrow functions should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      const handleError = (error: ErrorResponse) => {
        console.error(error.message);
      };
    `,
    // External imported types in function expressions should be ignored
    `
      import { ErrorDetails } from 'error-lib';

      const processError = function(error: ErrorDetails) {
        console.error(error.code, error.message);
      };
    `,
    // External imported types in class properties should be ignored
    `
      import { ErrorHandler } from 'error-lib';

      class Service {
        private errorHandler: ErrorHandler;

        constructor(errorHandler: ErrorHandler) {
          this.errorHandler = errorHandler;
        }
      }
    `,
    // External imported types in interface properties should be ignored
    `
      import { ErrorDetails } from 'error-lib';

      interface ApiResponse {
        data?: any;
        error?: ErrorDetails;
      }
    `,
    // External imported types in type alias properties should be ignored
    `
      import { ErrorType } from 'error-lib';

      type ApiResult = {
        success: boolean;
        error?: ErrorType;
      };
    `,
    // External imported types in function parameters with destructuring should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      function processError({ message, code }: ErrorResponse) {
        console.error(code, message);
      }
    `,
    // External imported types in nested properties should be ignored
    `
      import { ErrorDetails } from 'error-lib';

      interface ApiResponse {
        meta: {
          error?: ErrorDetails;
        };
      }
    `,
    // External imported types in generic constraints should be ignored
    `
      import { ErrorBase } from 'error-lib';

      function processError<T extends ErrorBase>(error: T) {
        console.error(error.message);
      }
    `,
    // External imported types in mapped types should be ignored
    `
      import { ErrorCodes } from 'error-lib';

      type ErrorMessages = {
        [K in keyof ErrorCodes]: string;
      };
    `,
    // External imported types in conditional types should be ignored
    `
      import { Result } from 'result-lib';

      type ExtractError<T> = T extends Result<any, infer E> ? E : never;
    `,
    // External imported types in type assertions should be ignored
    `
      import { ApiResponse } from 'api-lib';

      function processResponse(response: unknown) {
        const typedResponse = response as ApiResponse;
        if (typedResponse.error) {
          console.error(typedResponse.error);
        }
      }
    `,
    // External imported types in JSX should be ignored
    {
      code: `
        import { ErrorProps } from 'ui-lib';
        import React from 'react';

        function ErrorComponent(props: ErrorProps) {
          return <div>{props.message}</div>;
        }
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // External imported types in default exports should be ignored
    `
      import { ErrorHandler } from 'error-lib';

      export default function(error: ErrorHandler) {
        return error.process();
      }
    `,
    // External imported types in export declarations should be ignored
    `
      import { ErrorType } from 'error-lib';

      export function processError(error: ErrorType) {
        console.error(error);
      }
    `,
    // External imported types in re-exports should be ignored
    `
      import { ErrorResponse } from 'api-lib';

      export type { ErrorResponse };
    `,
    // External imported types in dynamic imports should be ignored
    `
      async function loadErrorHandler() {
        const { ErrorHandler } = await import('error-lib');
        return new ErrorHandler();
      }
    `,
    // External imported types in namespace imports should be ignored
    `
      import * as Errors from 'error-lib';

      type AppError = Errors.ValidationError | Errors.NetworkError;

      function logError(error: AppError) {
        console.error(error.message);
      }
    `,
    // External imported types in qualified names should be ignored
    `
      import { API } from 'api-lib';

      function handleError(error: API.Errors.ValidationError) {
        console.error(error.message);
      }
    `,
    // External imported types in deeply nested qualified names should be ignored
    `
      import { Client } from 'client-lib';

      function processError(error: Client.API.Errors.ValidationError) {
        console.error(error.message);
      }
    `,
    // External imported types in type parameters should be ignored
    `
      import { ErrorType } from 'error-lib';

      class ErrorHandler<T extends ErrorType> {
        handle(error: T) {
          console.error(error);
        }
      }
    `,
    // External imported types in constructor parameters should be ignored
    `
      import { ErrorHandler } from 'error-lib';

      class Service {
        constructor(private errorHandler: ErrorHandler) {}
      }
    `,
    // External imported types in method parameters should be ignored
    `
      import { ErrorEvent } from 'event-lib';

      class EventHandler {
        handleEvent(event: ErrorEvent) {
          console.error(event);
        }
      }
    `,
    // External imported types in property assignments should be ignored
    `
      import { ErrorHandler } from 'error-lib';

      const service = {
        errorHandler: new ErrorHandler()
      };
    `,
    // External imported types in variable declarations with destructuring should be ignored
    `
      import { errors } from 'api-lib';
      const { InvalidRequestError, UnauthorizedError } = errors;

      function handleApiErrors(error: InvalidRequestError | UnauthorizedError) {
        console.error(error.message);
      }
    `,
    // External imported types in default imports should be ignored
    `
      import ErrorHandler from 'error-lib';

      const handler = new ErrorHandler();
      handler.processError({ message: 'Error occurred' });
    `,
    // External imported types in namespace re-exports should be ignored
    `
      import * as errors from 'error-lib';

      export { errors };
    `,
    // External imported types in type-only imports should be ignored
    `
      import type { ErrorResponse } from 'api-lib';

      function handleError(error: ErrorResponse) {
        console.error(error.message);
      }
    `,
    // External imported types in type-only namespace imports should be ignored
    `
      import type * as Errors from 'error-lib';

      function handleError(error: Errors.ValidationError) {
        console.error(error.message);
      }
    `,
  ],
  invalid: [
    // Local variable with negative naming
    {
      code: `
        const invalidData = { message: 'Bad data' };
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
    // Local variable with negative naming that doesn't use imported types
    {
      code: `
        // This should be flagged because it doesn't use imported types
        const invalidHandler = (response) => {
          console.error(response);
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
    },
  ],
});
