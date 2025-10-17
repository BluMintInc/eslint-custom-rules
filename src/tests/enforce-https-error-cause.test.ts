import { ruleTesterTs } from '../utils/ruleTester';
import { enforceHttpsErrorCause } from '../rules/enforce-https-error-cause';

ruleTesterTs.run('enforce-https-error-cause', enforceHttpsErrorCause, {
  valid: [
    // Valid: HttpsError with cause as 4th argument
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, error);
}`,
    },

    // Valid: HttpsError with details and cause
    {
      code: `
try {
  await doWork();
} catch (err) {
  throw new HttpsError('internal', 'Operation failed', { jobId: 123 }, err);
}`,
    },

    // Valid: HttpsError with explicit undefined details and cause
    {
      code: `
try {
  await doWork();
} catch (e) {
  throw new HttpsError('internal', 'Operation failed', undefined, e);
}`,
    },

    // Valid: HttpsError with null details and cause
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', null, error);
}`,
    },

    // Valid: HttpsError outside catch block (rule doesn't apply)
    {
      code: `
function someFunction() {
  throw new HttpsError('internal', 'Operation failed');
}`,
    },

    // Valid: HttpsError outside catch block with fewer arguments
    {
      code: `
const createError = () => {
  return new HttpsError('internal', 'Operation failed', { context: true });
};`,
    },

    // Valid: Different error types in catch block
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new Error('Some error');
}`,
    },

    // Valid: HttpsError with 5 arguments (including stackOverride)
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', { context: true }, error, 'custom stack');
}`,
    },

    // Valid: Member expression HttpsError call
    {
      code: `
import * as errors from './errors';
try {
  await doWork();
} catch (error) {
  throw new errors.HttpsError('internal', 'Operation failed', undefined, error);
}`,
    },

    // Valid: Nested try-catch with correct usage
    {
      code: `
try {
  try {
    await doWork();
  } catch (innerError) {
    throw new HttpsError('internal', 'Inner operation failed', undefined, innerError);
  }
} catch (outerError) {
  throw new HttpsError('internal', 'Outer operation failed', undefined, outerError);
}`,
    },

    // Valid: HttpsError in different catch parameter names
    {
      code: `
try {
  await doWork();
} catch (exception) {
  throw new HttpsError('internal', 'Operation failed', undefined, exception);
}`,
    },

    // Valid: HttpsError with complex details object
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', {
    timestamp: Date.now(),
    userId: 'user123',
    operation: 'doWork'
  }, error);
}`,
    },

    // Valid: HttpsError in nested function inside catch (rule doesn't apply to nested functions)
    {
      code: `
try {
  await doWork();
} catch (error) {
  function handleError() {
    throw new HttpsError('internal', 'Operation failed');
  }
  handleError();
}`,
    },

    // Valid: HttpsError in arrow function inside catch (rule doesn't apply to nested functions)
    {
      code: `
try {
  await doWork();
} catch (error) {
  const handler = () => {
    throw new HttpsError('internal', 'Operation failed');
  };
  handler();
}`,
    },
  ],

  invalid: [
    // Invalid: Missing cause (only 2 arguments)
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed');
}`,
      errors: [{ messageId: 'missingCause' }],
    },

    // Invalid: Missing cause (only 3 arguments with details)
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', { context: 123 });
}`,
      errors: [{ messageId: 'missingCause' }],
    },

    // Invalid: Wrong variable as cause
    {
      code: `
try {
  await doWork();
} catch (error) {
  const wrongVar = new Error('wrong');
  throw new HttpsError('internal', 'Operation failed', undefined, wrongVar);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: Error incorrectly placed in details instead of cause
    {
      code: `
try {
  await doWork();
} catch (e) {
  throw new HttpsError('internal', 'Operation failed', { e });
}`,
      errors: [{ messageId: 'missingCause' }],
    },

    // Invalid: Wrong catch parameter name used
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, err);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: Literal value as cause instead of catch parameter
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, 'error string');
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: null as cause instead of catch parameter
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, null);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: undefined as cause instead of catch parameter
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, undefined);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: Member expression HttpsError with missing cause
    {
      code: `
import * as errors from './errors';
try {
  await doWork();
} catch (error) {
  throw new errors.HttpsError('internal', 'Operation failed');
}`,
      errors: [{ messageId: 'missingCause' }],
    },

    // Invalid: Member expression HttpsError with wrong cause
    {
      code: `
import * as errors from './errors';
try {
  await doWork();
} catch (error) {
  throw new errors.HttpsError('internal', 'Operation failed', undefined, someOtherVar);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: Nested try-catch with wrong inner cause
    {
      code: `
try {
  try {
    await doWork();
  } catch (innerError) {
    throw new HttpsError('internal', 'Inner operation failed', undefined, outerError);
  }
} catch (outerError) {
  throw new HttpsError('internal', 'Outer operation failed', undefined, outerError);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: Multiple HttpsError calls with different issues
    {
      code: `
try {
  await doWork();
} catch (error) {
  if (someCondition) {
    throw new HttpsError('internal', 'First error');
  } else {
    throw new HttpsError('internal', 'Second error', undefined, wrongVar);
  }
}`,
      errors: [
        { messageId: 'missingCause' },
        { messageId: 'wrongCause' }
      ],
    },





    // Invalid: HttpsError in if statement inside catch
    {
      code: `
try {
  await doWork();
} catch (error) {
  if (error.code === 'SPECIAL') {
    throw new HttpsError('internal', 'Special error');
  }
}`,
      errors: [{ messageId: 'missingCause' }],
    },

    // Invalid: HttpsError in switch statement inside catch
    {
      code: `
try {
  await doWork();
} catch (error) {
  switch (error.type) {
    case 'TYPE_A':
      throw new HttpsError('internal', 'Type A error', { type: 'A' });
    default:
      throw new HttpsError('internal', 'Unknown error');
  }
}`,
      errors: [
        { messageId: 'missingCause' },
        { messageId: 'missingCause' }
      ],
    },

    // Invalid: HttpsError in for loop inside catch
    {
      code: `
try {
  await doWork();
} catch (error) {
  for (let i = 0; i < 1; i++) {
    throw new HttpsError('internal', 'Loop error', undefined, wrongVar);
  }
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: HttpsError with object property as cause
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, error.cause);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: HttpsError with function call as cause
    {
      code: `
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, getError());
}`,
      errors: [{ messageId: 'wrongCause' }],
    },

    // Invalid: HttpsError with array element as cause
    {
      code: `
try {
  await doWork();
} catch (error) {
  const errors = [error];
  throw new HttpsError('internal', 'Operation failed', undefined, errors[0]);
}`,
      errors: [{ messageId: 'wrongCause' }],
    },
  ],
});
