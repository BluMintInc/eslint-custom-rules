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
  ],
});
