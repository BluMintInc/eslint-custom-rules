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
        expression: `conditional && 'additional text'`,
      },
      {
        code: `<div> This is a {isReady && 'also text'} test </div>`,
        condition: 'isReady',
        literal: `'also text'`,
        expression: `isReady && 'also text'`,
      },
      {
        code: `<div> <span> This is a {show && 'extra'} test </span> </div>`,
        condition: 'show',
        literal: `'extra'`,
        expression: `show && 'extra'`,
      },
      {
        code: `<div> Label: {value || 'missing'} </div>`,
        condition: 'value',
        literal: `'missing'`,
        expression: `value || 'missing'`,
      },
    ].map(({ code, condition, literal, expression }) => {
      return {
        code,
        errors: [
          {
            messageId: 'unexpected',
            data: { literal, condition, expression },
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
      // Conditional rendering of non-string literal should be ignored
      `(
      <div>
        {conditional && 0}
      </div>
    )`,
      // Logical expression with two literals should be ignored
      `(
      <div>
        prefix {'foo' && 'bar'} suffix
      </div>
    )`,
    ],
  },
);
