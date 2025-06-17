import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run(
  'enforce-positive-naming-boolean-property-bug',
  enforcePositiveNaming,
  {
    valid: [
      // Test case for the bug where a single-word boolean property was causing a TypeError
      `
    export type PulsateProps = {
      children: ReactNode;
      pulsate: boolean; // This was causing the error
      opacityRange?: [number, number];
    };
    `,
      // Additional test cases with single-word boolean properties
      `
    interface Config {
      enabled: boolean;
      visible: boolean;
      active: boolean;
    }
    `,
      // Test with type alias
      `
    type ToggleProps = {
      toggle: boolean;
      animate: boolean;
    };
    `,
    ],
    invalid: [
      // Make sure the rule still works for invalid cases
      {
        code: `
      export type PulsateProps = {
        children: ReactNode;
        isNotVisible: boolean;
      };
      `,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: {
              name: 'isNotVisible',
              alternatives: 'isVisible',
            },
          },
        ],
      },
    ],
  },
);
