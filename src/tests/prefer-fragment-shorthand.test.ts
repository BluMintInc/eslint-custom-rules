import { preferFragmentShorthand } from '../rules/prefer-fragment-shorthand';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('prefer-fragment-shorthand', preferFragmentShorthand, {
  valid: ['<>Hello World</>', '<><ChildComponent /></>'],
  invalid: [
    {
      code: '<React.Fragment>Hello World</React.Fragment>',
      errors: [{ messageId: 'preferShorthand' }],
      output: '<>Hello World</>',
    },
    {
      code: '<React.Fragment><ChildComponent /></React.Fragment>',
      errors: [{ messageId: 'preferShorthand' }],
      output: '<><ChildComponent /></>',
    },
    {
      code: '<React.Fragment><NestedComponent><ChildComponent /></NestedComponent></React.Fragment>',
      errors: [{ messageId: 'preferShorthand' }],
      output: '<><NestedComponent><ChildComponent /></NestedComponent></>',
    },
  ],
});
