import { ruleTesterTs } from '../utils/ruleTester';
import { noOverridableMethodCallsInConstructor } from '../rules/no-overridable-method-calls-in-constructor';

ruleTesterTs.run(
  'no-overridable-method-calls-in-constructor',
  noOverridableMethodCallsInConstructor,
  {
    valid: [
      `
      class Vehicle {
        constructor() {
          // Empty constructor
        }

        displayType() {
          console.log("Vehicle");
        }
      }
      `,
    ],
    invalid: [
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },
    ],
  },
);
