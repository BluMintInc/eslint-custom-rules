import { noConditionalLiteralsInJsx } from '../rules/no-conditional-literals-in-jsx';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run(
  'no-conditional-literals-in-jsx',
  noConditionalLiteralsInJsx,
  {
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
    invalid: [
      // JSX with conditional text literals
      `<div> This is a test {conditional && 'additional text'} </div>`,

      // JSX with conditional text literals with JSX siblings
      `<div> This is a {conditional && 'additional text'} test </div>`,

      // JSX with conditional text literals within other JSX elements
      `<div> <span> This is a {conditional && 'additional text'} test </span> </div>`,
    ].map((testCase) => {
      return {
        code: testCase,
        errors: [{ messageId: 'unexpected' }],
      };
    }),
  },
);
