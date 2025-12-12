import { ruleTesterTs } from '../utils/ruleTester';
import { dynamicHttpsErrors } from '../rules/dynamic-https-errors';

const { dynamicHttpsErrors: dynamicMessage, missingThirdArgument: missingThirdArgumentMessage } =
  dynamicHttpsErrors.meta.messages;

type MessageId = keyof typeof dynamicHttpsErrors.meta.messages;

type InvalidCase = {
  code: string;
  errors: Array<{ messageId: MessageId }>;
};

describe('dynamic-https-errors messages', () => {
  test('are educational and actionable', () => {
    expect(dynamicMessage).toBe(
      'The HttpsError message (second argument) must stay static. Template expressions here change the hashed message and explode the number of error ids for the same failure. Keep this argument constant and move interpolated values into the third "details" argument so monitoring groups the error while still capturing request context.',
    );
    expect(missingThirdArgumentMessage).toBe(
      'HttpsError calls must include a third "details" argument. The message (second argument) is hashed into a stable identifier, so omitting details leaves errors hard to debug and encourages packing variables into the hashed message. Provide a third argument with the request-specific context (object or string) to keep identifiers stable and diagnostics useful.',
    );
  });
});

const validCases = [
  // Basic valid cases - all have 3 arguments and no dynamic content in second argument
  "throw new https.HttpsError('foo', 'bar', 'baz');",
  "throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);",
  "throw new HttpsError('foo', 'bar', 'baz');",
  "throw new HttpsError('invalid-argument', 'Static error message', { context: 'data' });",
  "throw new https.HttpsError('permission-denied', 'Access denied', { userId, resource });",
  "new HttpsError('not-found', 'Resource not found', { id: resourceId });",
  "https.HttpsError('internal', 'Server error', { timestamp: Date.now() });",

  // Test with more than 3 arguments (should be valid)
  "throw new HttpsError('foo', 'bar', 'baz', 'extra');",
  "throw new HttpsError('foo', 'bar', 'baz', 'extra', 'more');",

  // Template literals without expressions in second argument (valid)
  "throw new HttpsError('foo', `Static message`, 'context');",
  "throw new HttpsError('foo', `Static message with no interpolation`, { data });",

  // Different types for third argument (all valid)
  "throw new HttpsError('foo', 'bar', null);",
  "throw new HttpsError('foo', 'bar', undefined);",
  "throw new HttpsError('foo', 'bar', 42);",
  "throw new HttpsError('foo', 'bar', true);",
  "throw new HttpsError('foo', 'bar', []);",
  "throw new HttpsError('foo', 'bar', ['item1', 'item2']);",
  "throw new HttpsError('foo', 'bar', { key: 'value', nested: { prop: 'val' } });",
  "throw new HttpsError('foo', 'bar', variable);",
  "throw new HttpsError('foo', 'bar', functionCall());",
  "throw new HttpsError('foo', 'bar', obj.property);",
  "throw new HttpsError('foo', 'bar', obj?.optionalProperty);",

  // Complex third argument expressions (valid)
  "throw new HttpsError('foo', 'bar', { ...context, additional: 'data' });",
  "throw new HttpsError('foo', 'bar', condition ? contextA : contextB);",
  "throw new HttpsError('foo', 'bar', await getContext());",

  // Real-world scenarios
  "throw new HttpsError('invalid-argument', 'No orderBy found in scoreOptions', { afterData, scoreOptions });",
  "throw new HttpsError('permission-denied', 'User not authorized', { userId: user.id, resource: 'admin' });",
  "throw new HttpsError('not-found', 'Document does not exist', { docId, collection: 'users' });",
  "throw new HttpsError('already-exists', 'Email already registered', { email: userEmail });",

  // Nested in control structures
  `
  if (condition) {
    throw new HttpsError('foo', 'bar', 'baz');
  }
  `,
  `
  try {
    // some code
  } catch (error) {
    throw new HttpsError('internal', 'Processing failed', { originalError: error.message });
  }
  `,
  `
  function handleError() {
    throw new HttpsError('foo', 'bar', 'baz');
  }
  `,

  // Different call patterns (all valid with 3 args)
  "const error = new HttpsError('foo', 'bar', 'baz');",
  "return new HttpsError('foo', 'bar', 'baz');",
  "callback(new HttpsError('foo', 'bar', 'baz'));",

  // Edge case: HttpsError as property (should not trigger rule)
  "const obj = { HttpsError: someFunction }; obj.HttpsError('foo', 'bar');",
  "class MyClass { HttpsError() {} } new MyClass().HttpsError('foo', 'bar');",

  // TypeScript-specific syntax (all valid with 3 args)
  "throw new HttpsError('foo', 'bar', 'baz') as any;",
  "throw new HttpsError<string>('foo', 'bar', 'baz');",
  "throw (new HttpsError('foo', 'bar', 'baz'));",

  // Complex nested expressions in third argument (valid)
  "throw new HttpsError('foo', 'bar', { nested: { deep: { value: 'test' } } });",
  "throw new HttpsError('foo', 'bar', [1, 2, 3].map(x => x * 2));",
  "throw new HttpsError('foo', 'bar', condition && { conditionalData: true });",

// Other expressions in second argument (currently allowed - testing current behavior)
  "throw new HttpsError('foo', getMessage(), 'context');",
  "throw new HttpsError('foo', obj.message, 'context');",
  "throw new HttpsError('foo', condition ? 'msg1' : 'msg2', 'context');",
  "throw new HttpsError('foo', errorMessage, 'context');",

  // Empty template literals (valid - no expressions)
  "throw new HttpsError('foo', ``, 'context');",
  "throw new HttpsError('foo', `Static only`, 'context');",

  // Comments and whitespace (should not affect rule)
  `throw new HttpsError(
    'foo', // first arg
    'bar', // second arg
    'baz'  // third arg
  );`,

  // Spread operator in arguments (valid when we can statically verify 3+ args)
  "throw new HttpsError('foo', 'bar', ...contextArgs);",
];

const invalidCases: InvalidCase[] = [
  // Invalid cases for dynamic content in second argument
  {
    code: "throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `Error: ${bar}`, 'baz');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', 'Error: ' + variable, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },

  // More dynamic content variations
  {
    code: "throw new HttpsError('foo', `Multiple ${var1} expressions ${var2}`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `Complex ${obj.prop} expression`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `Function ${func()} call`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `Conditional ${condition ? 'a' : 'b'} expression`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },

  // Invalid cases for missing third argument - basic patterns
  {
    code: "throw new HttpsError('invalid-argument', 'No orderBy found');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new https.HttpsError('permission-denied', 'Access denied');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "new HttpsError('not-found', 'Resource not found');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "https.HttpsError('internal', 'Server error');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError('foo');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: 'throw new HttpsError();',
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Missing third argument - different call patterns
  {
    code: "const error = new HttpsError('foo', 'bar');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "return new HttpsError('foo', 'bar');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "callback(new HttpsError('foo', 'bar'));",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "const err = https.HttpsError('foo', 'bar');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Missing third argument - nested in control structures
  {
    code: `
    if (condition) {
      throw new HttpsError('foo', 'bar');
    }
    `,
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: `
    try {
      // some code
    } catch (error) {
      throw new HttpsError('internal', 'Processing failed');
    }
    `,
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: `
    function handleError() {
      throw new HttpsError('foo', 'bar');
    }
    `,
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Missing third argument - real-world scenarios
  {
    code: "throw new HttpsError('invalid-argument', 'No orderBy found in scoreOptions for index 0');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError('permission-denied', 'User not authorized to access this resource');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError('not-found', 'Document does not exist in the database');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError('already-exists', 'Email address is already registered');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Cases with both issues - dynamic content AND missing third argument
  {
    code: "throw new HttpsError('foo', `Error: ${bar}`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },
  {
    code: "https.HttpsError('foo', `Error: ${bar}`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },
  {
    code: "throw new HttpsError('invalid-argument', `Missing ${field} in request`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },
  {
    code: "throw new https.HttpsError('permission-denied', `User ${userId} not authorized`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },

  // Edge cases - only one argument with dynamic content
  {
    code: 'throw new HttpsError(`Dynamic ${error}`);',
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Multiple HttpsError calls in same context
  {
    code: `
    function validate() {
      if (!field1) throw new HttpsError('invalid-argument', 'Field1 required');
      if (!field2) throw new HttpsError('invalid-argument', 'Field2 required');
    }
    `,
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'missingThirdArgument' },
    ],
  },

  // Complex expressions in arguments but still missing third
  {
    code: 'throw new HttpsError(getErrorCode(), getMessage());',
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError(condition ? 'foo' : 'bar', 'message');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // TypeScript-specific syntax missing third argument
  {
    code: "throw new HttpsError('foo', 'bar') as any;",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError<string>('foo', 'bar');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw (new HttpsError('foo', 'bar'));",
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Template literals with nested expressions
  {
    code: "throw new HttpsError('foo', `Error ${obj.prop} with ${func()}`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `${condition ? 'A' : 'B'} error occurred`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `Error: ${await getError()}`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', `${prefix}${suffix}`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },

  // Template literals with complex expressions and missing third argument
  {
    code: "throw new HttpsError('foo', `Complex ${obj.nested.prop} error`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },
  {
    code: "throw new HttpsError('foo', `${getPrefix()} ${getSuffix()}`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },

  // Spread operator with insufficient arguments or unknown argument count
  {
    code: "throw new HttpsError(...['foo', 'bar']);",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError(...['foo', 'bar', 'baz']);", // Can't determine argument count at compile time
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: 'throw new HttpsError(...args);', // Can't determine argument count at compile time
    errors: [{ messageId: 'missingThirdArgument' }],
  },

  // Whitespace and comments don't change the rule
  {
    code: `throw new HttpsError(
      'foo', // first arg
      'bar'  // second arg - missing third!
    );`,
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: `throw new HttpsError(
      'foo',
      \`Dynamic \${error}\`  // dynamic content in second arg
    );`,
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },

  // Edge cases with empty arguments
  {
    code: "throw new HttpsError('', '');",
    errors: [{ messageId: 'missingThirdArgument' }],
  },
  {
    code: "throw new HttpsError('', `Dynamic ${content}`);",
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },

  // Nested template literals
  {
    code: "throw new HttpsError('foo', `Outer ${`inner ${variable}`} template`, 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },

  // Real-world complex scenarios
  {
    code: `
    async function processData(data) {
      if (!data.id) {
        throw new HttpsError('invalid-argument', \`Missing required field: \${field}\`);
      }
      if (!data.email) {
        throw new HttpsError('invalid-argument', 'Email is required');
      }
    }
    `,
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
      { messageId: 'missingThirdArgument' },
    ],
  },

  // Multiple violations in different contexts
  {
    code: `
    class ErrorHandler {
      static validate(input) {
        if (!input.name) throw new HttpsError('invalid-argument', 'Name required');
        if (!input.email) throw new HttpsError('invalid-argument', \`Invalid email: \${input.email}\`);
      }
    }
    `,
    errors: [
      { messageId: 'missingThirdArgument' },
      { messageId: 'missingThirdArgument' },
      { messageId: 'dynamicHttpsErrors' },
    ],
  },
];

ruleTesterTs.run('dynamic-https-errors', dynamicHttpsErrors, {
  valid: validCases,
  invalid: invalidCases,
});
