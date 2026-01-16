import { ruleTesterTs } from '../utils/ruleTester';
import { warnHttpsErrorMessageUserFriendly } from '../rules/warn-https-error-message-user-friendly';

const messageId = 'warnHttpsErrorMessageUserFriendly';

ruleTesterTs.run('warn-https-error-message-user-friendly', warnHttpsErrorMessageUserFriendly, {
  valid: [
    // 1. Simple HttpsError without messageUserFriendly
    `new HttpsError({ code: 'invalid-argument', message: 'test' });`,
    // 2. toHttpsError without messageUserFriendly
    `toHttpsError(err, { code: 'internal', message: 'error' });`,
    // 3. Positional HttpsError (doesn't use options object)
    `new HttpsError('internal', 'message', { details: 'test' });`,
    // 4. Unrelated object with messageUserFriendly
    `const uiState = { messageUserFriendly: 'hello' };`,
    // 5. Unrelated function call
    `someOtherFunction({ messageUserFriendly: 'test' });`,
    // 6. HttpsError with different property
    `new HttpsError({ code: 'not-found', messageUserFriendlyText: 'oops' });`,
    // 7. toHttpsError with only one argument (invalid call but shouldn't trigger this rule)
    `toHttpsError(err);`,
    // 8. Member expression that is not https.HttpsError
    `other.HttpsError({ messageUserFriendly: 'test' });`,
    // 9. Spread without messageUserFriendly
    `const base = { code: 'ok' }; new HttpsError({ ...base });`,
    // 10. Variable without messageUserFriendly
    `const options = { code: 'ok' }; new HttpsError(options);`,
    // 11. Spread of unrelated object
    `const unrelated = { other: true }; new HttpsError({ ...unrelated });`,
    // 12. Nested unrelated objects
    `const inner = { a: 1 }; const outer = { ...inner }; new HttpsError({ ...outer });`,
    // 13. Circular reference without messageUserFriendly
    `
      const a = { ...b };
      const b = { ...a };
      new HttpsError(a);
    `,
  ],
  invalid: [
    // 1. Direct object literal in new HttpsError
    {
      code: `new HttpsError({ code: 'already-exists', messageUserFriendly: 'oops' });`,
      errors: [{ messageId, column: 42 }],
    },
    // 2. Direct object literal in toHttpsError
    {
      code: `toHttpsError(err, { messageUserFriendly: 'oops' });`,
      errors: [{ messageId, column: 21 }],
    },
    // 3. HttpsError as CallExpression
    {
      code: `HttpsError({ messageUserFriendly: 'oops' });`,
      errors: [{ messageId, column: 14 }],
    },
    // 4. https.HttpsError
    {
      code: `new https.HttpsError({ messageUserFriendly: 'oops' });`,
      errors: [{ messageId, column: 24 }],
    },
    // 5. Literal key
    {
      code: `new HttpsError({ 'messageUserFriendly': 'oops' });`,
      errors: [{ messageId, column: 18 }],
    },
    // 6. Variable tracing
    {
      code: `
        const options = { messageUserFriendly: 'oops' };
        new HttpsError(options);
      `,
      errors: [{ messageId, line: 3, column: 24 }],
    },
    // 7. Spread object literal
    {
      code: `new HttpsError({ ...{ messageUserFriendly: 'oops' } });`,
      errors: [{ messageId, column: 18 }],
    },
    // 8. Variable tracing with spread
    {
      code: `
        const base = { messageUserFriendly: 'oops' };
        const options = { ...base };
        new HttpsError(options);
      `,
      errors: [{ messageId, line: 4, column: 24 }],
    },
    // 9. messageUserFriendly set to undefined
    {
      code: `new HttpsError({ messageUserFriendly: undefined });`,
      errors: [{ messageId, column: 18 }],
    },
    // 10. Multiple properties including messageUserFriendly
    {
      code: `
        new HttpsError({
          code: 'internal',
          message: 'error',
          messageUserFriendly: 'user error'
        });
      `,
      errors: [{ messageId, line: 5, column: 11 }],
    },
    // 11. toHttpsError with variable
    {
      code: `
        const opts = { messageUserFriendly: 'oops' };
        toHttpsError(err, opts);
      `,
      errors: [{ messageId, line: 3, column: 27 }],
    },
    // 12. Nested tracing (options used in another object)
    {
      code: `
        const inner = { messageUserFriendly: 'oops' };
        const outer = { ...inner };
        new HttpsError(outer);
      `,
      errors: [{ messageId, line: 4, column: 24 }],
    },
    // 13. Multiple spreads, one has messageUserFriendly
    {
      code: `
        const s1 = { a: 1 };
        const s2 = { messageUserFriendly: 'oops' };
        new HttpsError({ ...s1, ...s2 });
      `,
      errors: [{ messageId, line: 4, column: 33 }],
    },
    // 14. Conditional inclusion (Logical AND)
    {
      code: `
        const options = {
          code: 'internal',
          ...(true && { messageUserFriendly: 'oops' })
        };
        new HttpsError(options);
      `,
      errors: [{ messageId, line: 6, column: 24 }],
    },
    // 15. Conditional inclusion (Ternary)
    {
      code: `
        const options = {
          code: 'internal',
          ...(condition ? { messageUserFriendly: 'oops' } : {})
        };
        new HttpsError(options);
      `,
      errors: [{ messageId, line: 6, column: 24 }],
    },
    // 16. Property with spread variable
    {
      code: `
        const base = { messageUserFriendly: 'oops' };
        new HttpsError({ ...base, other: 1 });
      `,
      errors: [{ messageId, line: 3, column: 26 }],
    },
    // 17. new https.HttpsError tracing
    {
      code: `
        const options = { messageUserFriendly: 'oops' };
        new https.HttpsError(options);
      `,
      errors: [{ messageId, line: 3, column: 30 }],
    },
    // 18. multiple messageUserFriendly in one call
    {
      code: `
        new HttpsError({
          messageUserFriendly: 'oops1',
          ...{ messageUserFriendly: 'oops2' }
        });
      `,
      errors: [
        { messageId, line: 3, column: 11 },
        { messageId, line: 4, column: 11 }
      ],
    },
    // 19. circular reference with messageUserFriendly
    {
      code: `
        const a = { ...b, messageUserFriendly: 'oops' };
        const b = { ...a };
        new HttpsError(a);
      `,
      errors: [{ messageId, line: 4, column: 24 }],
    },
  ],
});
