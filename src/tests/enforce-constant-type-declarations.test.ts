import { ruleTesterTs } from '../utils/ruleTester';
import { enforceConstantTypeDeclarations } from '../rules/enforce-constant-type-declarations';

ruleTesterTs.run(
  'enforce-constant-type-declarations',
  enforceConstantTypeDeclarations,
  {
    valid: [
      // Good: Define types first, then use them for constants
      `
    type StatusExceeding = 'exceeding';
    type StatusSubceeding = 'succeeding';

    const STATUS_EXCEEDING: StatusExceeding = 'exceeding' as const;
    const STATUS_SUBCEEDING: StatusSubceeding = 'succeeding' as const;

    type StatusToCheck = StatusExceeding | StatusSubceeding;
    `,

      // Good: Use types directly in function parameters
      `
    type StatusExceeding = 'exceeding';
    type StatusSubceeding = 'succeeding';
    type StatusToCheck = StatusExceeding | StatusSubceeding;

    function checkStatus(statusToCheck: StatusToCheck) {
      return statusToCheck;
    }
    `,

      // Good: Imported constants are allowed (can't control their type definitions)
      `
    import { STATUS_EXCEEDING } from './constants';

    type StatusToCheck = typeof STATUS_EXCEEDING | 'succeeding';
    `,

      // Good: Using typeof on non-constant variables
      `
    let dynamicValue = 'test';
    type DynamicType = typeof dynamicValue;
    `,

      // Good: Using typeof on objects/functions (not simple constants)
      `
    const complexObject = {
      method() { return 'test'; }
    };
    type ComplexType = typeof complexObject;
    `,

      // Good: Constants without 'as const' are not considered constants for this rule
      `
    const STATUS_EXCEEDING = 'exceeding';
    type StatusType = typeof STATUS_EXCEEDING;
    `,

      // Good: Using explicit type annotations
      `
    type Status = 'exceeding' | 'succeeding';
    const STATUS_EXCEEDING: Status = 'exceeding' as const;

    function checkStatus(status: Status) {
      return status;
    }
    `,

      // Good: Generic types are allowed
      `
    type Status<T> = T & { readonly __brand: 'status' };
    const STATUS_EXCEEDING: Status<'exceeding'> = 'exceeding' as const;
    `,

      // Good: Interface definitions
      `
    interface StatusConfig {
      value: string;
      code: number;
    }

    const STATUS_EXCEEDING: StatusConfig = {
      value: 'exceeding',
      code: 1
    } as const;
    `,

      // Good: Type inference without explicit typeof usage
      `
    const STATUS_EXCEEDING = 'exceeding' as const;
    const STATUS_SUBCEEDING = 'succeeding' as const;

    type StatusType = 'exceeding' | 'succeeding';
    `,

      // Good: Using typeof on built-in types
      `
    type StringType = typeof String;
    type NumberType = typeof Number;
    `,

      // Good: Arrow functions with proper types
      `
    type StatusType = 'exceeding' | 'succeeding';

    const checkStatus = (status: StatusType) => {
      return status;
    };
    `,

      // Good: Complex union types without typeof on local constants
      `
    type Status = 'exceeding' | 'succeeding';
    type Priority = 'high' | 'low';
    type Combined = Status | Priority;
    `,

      // Good: Nested type definitions
      `
    type BaseStatus = 'exceeding';
    type ExtendedStatus = BaseStatus | 'succeeding';

    const STATUS_EXCEEDING: BaseStatus = 'exceeding' as const;
    `,

      // Good: Literal constants without 'as const' are not flagged
      // (These don't have specific literal types that need to be reused)
      `
    const NUMBER_CONST = 42;
    type NumberType = typeof NUMBER_CONST;
    `,

      `
    const BOOLEAN_CONST = true;
    type BooleanType = typeof BOOLEAN_CONST;
    `,
    ],

    invalid: [
      // Bad: Using typeof on local constants in type alias
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;
      const STATUS_SUBCEEDING = 'succeeding' as const;

      type StatusToCheck = typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Using typeof on local constant in function parameter
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;
      const STATUS_SUBCEEDING = 'succeeding' as const;

      function checkStatus(statusToCheck: typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING) {
        return statusToCheck;
      }
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Using typeof on local constant in arrow function parameter
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      const checkStatus = (status: typeof STATUS_EXCEEDING) => {
        return status;
      };
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Using typeof on local constant in variable declaration
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      const status: typeof STATUS_EXCEEDING = 'exceeding';
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Mixed typeof and explicit types in union
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      type StatusToCheck = typeof STATUS_EXCEEDING | 'succeeding';
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Using typeof in intersection types
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      type StatusToCheck = typeof STATUS_EXCEEDING & { extra: boolean };
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Multiple function parameters with typeof
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;
      const STATUS_SUBCEEDING = 'succeeding' as const;

      function checkStatus(
        status1: typeof STATUS_EXCEEDING,
        status2: typeof STATUS_SUBCEEDING
      ) {
        return status1 + status2;
      }
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Function expression with typeof parameter
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      const checkStatus = function(status: typeof STATUS_EXCEEDING) {
        return status;
      };
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Nested typeof usage
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;
      const STATUS_SUBCEEDING = 'succeeding' as const;

      type ComplexType = {
        status: typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING;
      };
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Template literal constants
      {
        code: `
      const TEMPLATE_CONST = \`template-\${1}\` as const;

      type TemplateType = typeof TEMPLATE_CONST;
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Multiple typeof in complex union
      {
        code: `
      const STATUS_A = 'a' as const;
      const STATUS_B = 'b' as const;
      const STATUS_C = 'c' as const;

      type StatusUnion = typeof STATUS_A | typeof STATUS_B | typeof STATUS_C | 'manual';
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Typeof in method parameter
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      class StatusChecker {
        checkStatus(status: typeof STATUS_EXCEEDING) {
          return status;
        }
      }
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Typeof in object method
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      const statusChecker = {
        checkStatus(status: typeof STATUS_EXCEEDING) {
          return status;
        }
      };
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Typeof in async function
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      async function checkStatus(status: typeof STATUS_EXCEEDING) {
        return status;
      }
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Typeof in generator function
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      function* checkStatus(status: typeof STATUS_EXCEEDING) {
        yield status;
      }
      `,
        errors: [
          {
            messageId: 'useExplicitType',
          },
        ],
      },

      // Bad: Multiple constants in single type alias
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;
      const STATUS_SUBCEEDING = 'succeeding' as const;
      const STATUS_PENDING = 'pending' as const;

      type AllStatuses = typeof STATUS_EXCEEDING | typeof STATUS_SUBCEEDING | typeof STATUS_PENDING;
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },

      // Bad: Typeof in conditional type (edge case)
      {
        code: `
      const STATUS_EXCEEDING = 'exceeding' as const;

      type ConditionalType<T> = T extends typeof STATUS_EXCEEDING ? true : false;
      `,
        errors: [
          {
            messageId: 'defineTypeFirst',
          },
        ],
      },
    ],
  },
);
