import { noConditionalLiteralsInJsx } from '../rules/no-conditional-literals-in-jsx';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run(
  'no-conditional-literals-in-jsx',
  noConditionalLiteralsInJsx,
  {
    // Message is shared across invalid cases with interpolated values
    // to ensure the rule surfaces actionable context in errors.
    invalid: [
      {
        code: `<div> This is a test {conditional && 'additional text'} </div>`,
        condition: 'conditional',
        literal: `'additional text'`,
      },
      {
        code: `<div> This is a {isReady && 'also text'} test </div>`,
        condition: 'isReady',
        literal: `'also text'`,
      },
      {
        code: `<div> <span> This is a {show && 'extra'} test </span> </div>`,
        condition: 'show',
        literal: `'extra'`,
      },
    ].map(({ code, condition, literal }) => {
      return {
        code,
        errors: [
          {
            messageId: 'unexpected',
            data: { literal, condition },
          },
        ],
      };
    }),
    valid: [
      // JSX with no conditional text literals
      `(
      <div>
        This is a test
      </div>
    )`,
      // JSX with conditional element rendering
      `(
      <div>
        This is a test {conditional && <span>additional text</span>}
      </div>
    )`,
      // Conditional rendering of non-literal values
      `(
      <div>
        {conditional && variable}
      </div>
    )`,
    ],
  },
);
