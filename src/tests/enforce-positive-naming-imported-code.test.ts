import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming-imported-code', enforcePositiveNaming, {
  valid: [
    // This should be valid because we're using an imported function with negative naming in its parameters
    `
    import { handleInvalidRequest } from 'external-lib';

    // Using the imported function with negative parameter names should be allowed
    handleInvalidRequest({ message: 'Something went wrong' });
    `,

    // This should be valid because we're using an imported function with negative naming
    `
    import { blockUser, preventAccess } from 'auth-lib';

    // Using imported functions with negative naming should be allowed
    blockUser('user123');
    preventAccess('resource456');
    `,

    // This should be valid because we're using a property of an imported object with negative naming
    `
    import * as ErrorHandlers from 'error-lib';

    // Using properties of imported namespace with negative naming should be allowed
    ErrorHandlers.invalidRequestHandler({ message: 'Bad request' });
    `,

    // This should be valid because we're extending an imported interface with negative naming
    `
    import { ErrorResponse } from 'api-lib';

    // Extending an imported interface with negative naming should be allowed
    interface CustomErrorResponse extends ErrorResponse {
      customField: string;
    }
    `,

    // This should be valid because we're using an imported function as a callback
    `
    import { validateInput, rejectInvalid } from 'validation-lib';

    // Using imported functions with negative naming as callbacks should be allowed
    const processForm = (data: any) => {
      if (validateInput(data, rejectInvalid)) {
        // Process the form
      }
    };
    `,

    // This should be valid because we're assigning a function to an imported object property
    `
    import { errorHandlers } from 'error-lib';

    // Assigning to properties of imported objects should be allowed even with negative naming
    errorHandlers.invalidRequestHandler = (errorData) => {
      console.error(errorData);
    };
    `
  ],
  invalid: [
    // This should still be invalid because it's a locally defined variable with negative naming
    {
      code: `
      // Local variable with negative naming
      const invalidRequest = { message: 'Bad request' };
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'invalidRequest',
            alternatives: 'isValid',
          },
        },
      ],
    }
  ],
});
