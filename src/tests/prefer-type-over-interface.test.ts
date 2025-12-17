import { preferTypeOverInterface } from '../rules/prefer-type-over-interface';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('prefer-type-over-interface', preferTypeOverInterface, {
  valid: [
    'type SomeType = { field: string; };',
    'type AnotherType = SomeType & { otherField: number; };',
  ],
  invalid: [
    {
      code: 'interface SomeInterface { field: string; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'SomeInterface' },
        },
      ],
      output: 'type SomeInterface = { field: string; }',
    },
    {
      code: 'interface AnotherInterface extends SomeInterface { otherField: number; }',
      errors: [
        {
          messageId: 'preferType',
          data: { interfaceName: 'AnotherInterface' },
        },
      ],
      output:
        'type AnotherInterface =  SomeInterface & { otherField: number; }',
    },
  ],
});
