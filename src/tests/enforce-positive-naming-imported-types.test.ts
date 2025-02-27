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
    }
  ],
});
