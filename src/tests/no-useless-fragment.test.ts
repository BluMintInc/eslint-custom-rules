import { noUselessFragment } from '../rules/no-useless-fragment';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('no-useless-fragment', noUselessFragment, {
  valid: [
    '<><ChildComponent /><AnotherChild /></>',
    '<><ChildComponent />Text<AnotherChild /></>',
    '<><ChildComponent /><AnotherChild /></>',
  ],
  invalid: [
    {
      code: '<><ChildComponent /></>',
      errors: [{ messageId: 'noUselessFragment' }],
      output: '<ChildComponent />',
    },
    {
      code: '<><NestedComponent><ChildComponent /></NestedComponent></>',
      errors: [{ messageId: 'noUselessFragment' }],
      output: '<NestedComponent><ChildComponent /></NestedComponent>',
    },
  ],
});
