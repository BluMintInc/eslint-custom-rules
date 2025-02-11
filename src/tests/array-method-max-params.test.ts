import { ruleTesterTs } from '../utils/ruleTester';
import { arrayMethodMaxParams } from '../rules/array-method-max-params';

ruleTesterTs.run('array-method-max-params', arrayMethodMaxParams, {
  valid: [
    // Regular functions should follow max param limit
    {
      code: 'function foo(a, b) { return a + b; }',
      options: [{ max: 2 }],
    },
    // Array method callbacks should allow their standard parameters
    {
      code: 'array.reduce((acc, curr, index) => acc + curr, 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.reduce((acc, curr, index, arr) => acc + curr, 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.map((item, index, arr) => item * 2)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.filter((item, index, arr) => item > 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.forEach((item, index, arr) => console.log(item))',
      options: [{ max: 2 }],
    },
    {
      code: 'array.every((item, index, arr) => item > 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.some((item, index, arr) => item > 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.find((item, index, arr) => item > 0)',
      options: [{ max: 2 }],
    },
    {
      code: 'array.findIndex((item, index, arr) => item > 0)',
      options: [{ max: 2 }],
    },
    // Test with TypeScript types
    {
      code: 'const dayToEvents = hits.reduce((prev: Record<string, EventKeyed[]>, curr: THit, index: number) => { return prev; }, {} as Record<string, EventKeyed[]>)',
      options: [{ max: 2 }],
    },
  ],
  invalid: [
    // Regular functions should error when exceeding max param limit
    {
      code: 'function foo(a, b, c) { return a + b + c; }',
      options: [{ max: 2 }],
      errors: [
        {
          messageId: 'tooManyParams',
          data: { count: 3, max: 2 },
        },
      ],
    },
    // Array method callbacks should error when exceeding their standard parameter count
    {
      code: 'array.reduce((acc, curr, index, arr, extra) => acc + curr, 0)',
      options: [{ max: 2 }],
      errors: [
        {
          messageId: 'tooManyParams',
          data: { count: 5, max: 4 },
        },
      ],
    },
    {
      code: 'array.map((item, index, arr, extra) => item * 2)',
      options: [{ max: 2 }],
      errors: [
        {
          messageId: 'tooManyParams',
          data: { count: 4, max: 3 },
        },
      ],
    },
  ],
});
