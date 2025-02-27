import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming-interfaces', enforcePositiveNaming, {
  valid: [
    // Interface extending imported type with negative naming
    `
    import { ErrorResponse } from 'api-lib';

    interface CustomResponse extends ErrorResponse {
      customField: string;
    }
    `,

    // Interface with property using imported type with negative naming
    `
    import { ErrorDetails } from 'error-lib';

    interface ApiResponse {
      data?: any;
      error?: ErrorDetails;
    }
    `,

    // Interface with method using imported type with negative naming
    `
    import { ErrorEvent } from 'event-lib';

    interface EventHandler {
      handleError(event: ErrorEvent): void;
    }
    `,

    // Generic interface with imported type constraint
    `
    import { ErrorBase } from 'error-lib';

    interface ErrorProcessor<T extends ErrorBase> {
      process(error: T): void;
    }
    `,

    // Interface with indexed property using imported type
    `
    import { ErrorCode } from 'error-lib';

    interface ErrorMessages {
      [key in ErrorCode]: string;
    }
    `,

    // Interface with function property returning imported type
    `
    import { ValidationError } from 'validation-lib';

    interface Validator {
      validate(input: string): ValidationError | null;
    }
    `
  ],
  invalid: [
    // Interface with negative naming (should still be invalid)
    {
      code: `
      import { BaseError } from 'error-lib';

      interface InvalidResponse {
        error: BaseError;
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

    // Interface with negative property naming (should still be invalid)
    {
      code: `
      import { ErrorDetails } from 'error-lib';

      interface ApiResponse {
        invalidData?: any;
        error: ErrorDetails;
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
    },

    // Interface with negative method naming (should still be invalid)
    {
      code: `
      import { ErrorEvent } from 'event-lib';

      interface EventHandler {
        blockAccess(event: ErrorEvent): void;
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'blockAccess',
            alternatives: 'allow, permit',
          },
        },
      ],
    }
  ],
});
