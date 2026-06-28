import { noUselessFragment } from '../rules/no-useless-fragment';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('no-useless-fragment', noUselessFragment, {
  valid: [
    '<><ChildComponent /><AnotherChild /></>',
    '<><ChildComponent />Text<AnotherChild /></>',
    '<><ChildComponent /><AnotherChild /></>',
    // Issue #1195: a fragment wrapping a single expression container is NOT
    // useless — unwrapping to a bare `{expr}` is invalid in return/statement
    // position, and `<>{expr}</>` is the idiomatic way to render a ReactNode.
    '<>{Portal}</>',
    '<>{children}</>',
    '<>{condition ? <A /> : <B />}</>',
    '<>{items.map((item) => <Item key={item.id} {...item} />)}</>',
  ],
  invalid: [
    {
      code: '<><ChildComponent /></>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<ChildComponent />',
    },
    {
      code: '<><NestedComponent><ChildComponent /></NestedComponent></>',
      errors: [
        {
          messageId: 'noUselessFragment',
          data: { childKind: 'JSX element' },
        },
      ],
      output: '<NestedComponent><ChildComponent /></NestedComponent>',
    },
  ],
});
