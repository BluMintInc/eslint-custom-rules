import { genericStartsWithT } from '../rules/generic-starts-with-t';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('generic-starts-with-t', genericStartsWithT, {
  valid: [
    // Generic type starts with T
    'type GenericType<TParam> = TParam[];',

    // Multiple generic types start with T
    'type GenericType<TParam1, TParam2> = [TParam1, TParam2];',

    // Single letter generic type T
    'type GenericType<T> = T[];',

    // Module augmentation: the upstream library owns the parameter name, and
    // TS2428 requires it to match the original declaration verbatim.
    `
declare module '@mui/material/Select' {
  interface BaseSelectProps<Value = unknown> {
    displayEmpty?: boolean;
  }
}
`,

    // Global augmentation: the method signature merges into the upstream
    // Window interface, so its parameter name is equally fixed.
    `
declare global {
  interface Window {
    helper<Value>(v: Value): void;
  }
}
`,

    // A type alias inside an augmentation
    `
declare module 'x' {
  type Wrapper<Value> = { value: Value };
}
`,

    // A class inside an augmentation
    `
declare module 'x' {
  class Container<Value> {
    value: Value;
  }
}
`,

    // Nested container inside an augmentation: the exemption follows the whole
    // ancestor chain, not just the immediate parent.
    `
declare module 'x' {
  namespace Inner {
    interface Box<Item> {
      item: Item;
    }
  }
}
`,
  ],
  invalid: [
    {
      // Generic type doesn't start with T
      code: 'type GenericType<Param> = Param[];',
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Param', suggestedName: 'TParam' },
        },
      ],
    },
    {
      // One of multiple generic types doesn't start with T
      code: 'type GenericType<TParam, Param> = [TParam, Param];',
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Param', suggestedName: 'TParam' },
        },
      ],
    },
    {
      // Single letter generic type that isn't T
      code: 'type GenericType<P> = P[];',
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'P', suggestedName: 'TP' },
        },
      ],
    },
    {
      // The exemption is scoped to the augmentation block, not to the file:
      // a top-level declaration alongside one still reports.
      code: `
declare module '@mui/material/Select' {
  interface BaseSelectProps<Value = unknown> {
    displayEmpty?: boolean;
  }
}

interface Props<Value> {
  value: Value;
}
`,
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Value', suggestedName: 'TValue' },
          line: 8,
        },
      ],
    },
    {
      // A plain namespace augments nothing upstream, so the author owns the
      // name and the convention still applies.
      code: `
namespace Utils {
  export interface Box<Item> {
    item: Item;
  }
}
`,
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Item', suggestedName: 'TItem' },
        },
      ],
    },
    {
      // An ambient namespace has an identifier id, so it is not an
      // augmentation either.
      code: `
declare namespace Utils {
  interface Box<Item> {
    item: Item;
  }
}
`,
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Item', suggestedName: 'TItem' },
        },
      ],
    },
    {
      // `declare module Foo` (identifier id) is namespace syntax, not an
      // external-module augmentation.
      code: `
declare module Foo {
  interface Box<Item> {
    item: Item;
  }
}
`,
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Item', suggestedName: 'TItem' },
        },
      ],
    },
    {
      // A top-level function generic outside any module block
      code: 'function identity<Value>(value: Value): Value { return value; }',
      errors: [
        {
          messageId: 'genericStartsWithT',
          data: { name: 'Value', suggestedName: 'TValue' },
        },
      ],
    },
  ],
});
