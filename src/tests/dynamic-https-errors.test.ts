import { ruleTesterTs } from '../utils/ruleTester';
import { dynamicHttpsErrors } from '../rules/dynamic-https-errors';

const {
  dynamicHttpsErrors: dynamicMessage,
  missingThirdArgument: missingThirdArgumentMessage,
  missingDetailsProperty: missingDetailsPropertyMessage,
  missingDetailsDueToSpread: missingDetailsDueToSpreadMessage,
  unexpectedExtraArgumentForObjectCall: unexpectedExtraArgumentForObjectCallMessage,
} = dynamicHttpsErrors.meta.messages;

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
    expect(missingDetailsPropertyMessage).toBe(
      'HttpsError calls must include a "details" property. The message is hashed into a stable identifier, so omitting details leaves errors hard to debug and encourages packing variables into the hashed message. Provide a details property with the request-specific context (object or string) to keep identifiers stable and diagnostics useful.',
    );
    expect(missingDetailsDueToSpreadMessage).toBe(
      'HttpsError calls must include a "details" property. This call uses an object spread, which prevents static verification that "details" is present. Ensure the spread object contains "details" or provide it explicitly to keep identifiers stable and diagnostics useful.',
    );
    expect(unexpectedExtraArgumentForObjectCallMessage).toBe(
      'Object-based HttpsError calls must have exactly one argument containing code, message, and details properties. Remove extra arguments or use the positional signature (code, message, details).',
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
  "throw new HttpsError('foo', 'bar' as const, 'baz');",
  "throw new HttpsError('foo', 'bar' satisfies string, 'baz');",
  "throw new HttpsError('foo', ('bar'!) as any, 'baz');",
  "throw new HttpsError('foo', <string>'bar', 'baz');",
  "throw new HttpsError('foo', ('bar' as string) + ('baz' as const), 'details');",
  "new HttpsError({ code: 'foo', message: 'bar' as const, details: 'baz' });",

  // Complex nested expressions in third argument (valid)
  "throw new HttpsError('foo', 'bar', { nested: { deep: { value: 'test' } } });",
  "throw new HttpsError('foo', 'bar', [1, 2, 3].map(x => x * 2));",
  "throw new HttpsError('foo', 'bar', condition && { conditionalData: true });",

  // Allowed exceptions for second argument: Identifier and MemberExpression
  "throw new HttpsError('foo', obj.message, 'context');",
  "throw new HttpsError('foo', errorMessage, 'context');",
  "throw new HttpsError('foo', this.errorMsg, 'context');",

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

  // Object-based constructor signature (valid)
  `
  new HttpsError({
    code: 'unauthenticated',
    message: 'User must be authenticated to create a transaction.',
    details: { userUid: 'guest' },
  });
  `,
  `
  new HttpsError({
    code: 'unauthenticated',
    message: 'User must be authenticated to create a transaction.',
    details: 'some string details',
  });
  `,
  // Object-based signature with dynamic message should be valid if it's an Identifier (e.g. from props)
  // or it will be caught by our new logic if it's literal/template
  `
  new HttpsError({
    code: 'unauthenticated',
    message: props.message,
    details: 'details',
  });
  `,
  // String literal keys (valid)
  `
  new HttpsError({
    'code': 'unauthenticated',
    'message': 'Static message',
    'details': { foo: 'bar' },
  });
  `,
  `
  new HttpsError({
    "code": "unauthenticated",
    "message": "Static message",
    "details": { foo: "bar" },
  });
  `,
  // Computed property with variable named 'message' should not match (valid)
  // This is technically allowed by our rule (message is missing, but it's an optional prop)
  `
  const message = 'some-message';
  new HttpsError({
    code: 'unauthenticated',
    [message]: 'This is actually the message value, but the key is dynamic',
    details: { foo: 'bar' }
  });
  `,
  // Object-based signature with spread and explicit details (valid)
  `
  new HttpsError({
    ...config,
    details: { foo: 'bar' },
  });
  `,
];

const invalidCases: InvalidCase[] = [
  // Object-based constructor signature (invalid)
  {
    code: `
    new HttpsError({
      code: 'unauthenticated',
      message: 'User must be authenticated to create a transaction.',
    });
    `,
    errors: [{ messageId: 'missingDetailsProperty' }],
  },
  {
    code: `
    new HttpsError({
      code: 'unauthenticated',
      message: \`User must be authenticated to create a transaction: \${userUid}\`,
      details: { userUid },
    });
    `,
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: `
    new HttpsError({
      code: 'unauthenticated',
      message: 'User ' + userUid + ' must be authenticated.',
      details: { userUid },
    });
    `,
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
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

  // New expanded dynamic content detection
  {
    code: "throw new HttpsError('foo', getMessage(), 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', condition ? 'msg1' : 'msg2', 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', true ? 'a' : 'b', 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', someVar || 'default', 'context');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', !isError ? 'ok' : 'error', 'context');",
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
    errors: [
        { messageId: 'missingThirdArgument' },
        { messageId: 'dynamicHttpsErrors' }
    ],
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
  {
    code: "throw new HttpsError('foo', (getMessage() as string), 'baz');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: "throw new HttpsError('foo', ('bar' + getVar()) as any, 'baz');",
    errors: [{ messageId: 'dynamicHttpsErrors' }],
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
  // Computed property with variable named 'message' should not match (invalid)
  // String literal keys (invalid)
  {
    code: `
    new HttpsError({
      'code': 'unauthenticated',
      'message': \`Dynamic \${message}\`,
      'details': { foo: 'bar' }
    });
    `,
    errors: [{ messageId: 'dynamicHttpsErrors' }],
  },
  {
    code: `
    new HttpsError({
      'code': 'unauthenticated',
      'message': 'Static message',
    });
    `,
    errors: [{ messageId: 'missingDetailsProperty' }],
  },
  // Object-based signature with spread and missing details (invalid - specific message)
  {
    code: `
    new HttpsError({
      ...config,
      code: 'unauthenticated',
      message: 'Static message',
    });
    `,
    errors: [{ messageId: 'missingDetailsDueToSpread' }],
  },
  // Object-based signature with extra arguments (invalid)
  {
    code: `
    new HttpsError({
      code: 'unauthenticated',
      message: 'Static message',
      details: { foo: 'bar' },
    }, 'extra-arg');
    `,
    errors: [{ messageId: 'unexpectedExtraArgumentForObjectCall' }],
  },
];

ruleTesterTs.run('dynamic-https-errors', dynamicHttpsErrors, {
  valid: validCases,
  invalid: invalidCases,
});
