import { preferFragmentShorthand } from '../rules/prefer-fragment-shorthand';
import { ruleTesterJsx } from '../utils/ruleTester';

const preferShorthandError = {
  messageId: 'preferShorthand' as const,
  data: { fragmentName: 'React.Fragment' },
};

ruleTesterJsx.run('prefer-fragment-shorthand', preferFragmentShorthand, {
  valid: ['<>Hello World</>', '<><ChildComponent /></>'],
  invalid: [
    {
      code: '<React.Fragment>Hello World</React.Fragment>',
      errors: [preferShorthandError],
      output: '<>Hello World</>',
    },
    {
      code: '<React.Fragment><ChildComponent /></React.Fragment>',
      errors: [preferShorthandError],
      output: '<><ChildComponent /></>',
    },
    {
      code: '<React.Fragment><NestedComponent><ChildComponent /></NestedComponent></React.Fragment>',
      errors: [preferShorthandError],
      output: '<><NestedComponent><ChildComponent /></NestedComponent></>',
    },
  ],
});
