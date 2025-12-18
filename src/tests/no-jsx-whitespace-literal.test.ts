import { ruleTesterJsx } from '../utils/ruleTester';
import { noJsxWhitespaceLiteral } from '../rules/no-jsx-whitespace-literal';

ruleTesterJsx.run('no-jsx-whitespace-literal', noJsxWhitespaceLiteral, {
  valid: [
    {
      code: '<div>Hello, world!</div>',
    },
    {
      code: '<Button>Click Me</Button>',
    },
    {
      code: '<div className="space-between">Hello, world!</div>',
    },
    {
      code: '<div>Hello,&nbsp;world!</div>',
    },
    {
      code: '<div>{showGreeting && "Hello "}{username}</div>',
    },
    {
      code: '<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}</div>',
    },
  ],
  invalid: [
    {
      code: '<div>Hello,{" "}world!</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<Button>Click{" "}Me</Button>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<div>{showGreeting && "Hello"}{" "}{username}</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
    {
      code: '<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}{" "}</div>',
      errors: [
        {
          messageId: 'noWhitespaceLiteral',
          data: {
            literal: '{" "}',
          },
        },
      ],
    },
  ],
});
