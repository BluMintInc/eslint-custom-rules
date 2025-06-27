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

      // Good: Imported constants with same names as local constants
      `
    import { STATUS_EXCEEDING } from './external';
    const STATUS_EXCEEDING = 'local' as const;
    type ImportedType = typeof STATUS_EXCEEDING; // Should refer to imported one
    `,

      // Good: Shadowed variables in different scopes
      `
    const STATUS_EXCEEDING = 'outer' as const;
    {
      const STATUS_EXCEEDING = 'inner';
      type ShadowedType = typeof STATUS_EXCEEDING; // Not 'as const', so allowed
    }
    `,

      // Good: Qualified names (module.constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    type QualifiedType = typeof Module.STATUS_EXCEEDING;
    `,

      // Good: Member access on objects
      `
    const STATUS_EXCEEDING = 'local' as const;
    const obj = { STATUS_EXCEEDING: 'different' };
    type MemberType = typeof obj.STATUS_EXCEEDING;
    `,

      // Good: Constants defined after usage (forward references)
      `
    type ForwardType = typeof STATUS_EXCEEDING;
    const STATUS_EXCEEDING = 'forward' as const;
    `,

      // Good: Block-scoped constants
      `
    {
      const STATUS_EXCEEDING = 'block' as const;
    }
    type OutsideType = typeof STATUS_EXCEEDING; // Different scope
    `,

      // Good: Class static properties
      `
    class StatusClass {
      static readonly STATUS_EXCEEDING = 'class' as const;
    }
    type ClassType = typeof StatusClass.STATUS_EXCEEDING;
    `,

      // Good: Enum members
      `
    enum StatusEnum {
      STATUS_EXCEEDING = 'enum'
    }
    type EnumType = typeof StatusEnum.STATUS_EXCEEDING;
    `,

      // Good: Generic type parameters
      `
    const STATUS_EXCEEDING = 'generic' as const;
    type GenericType<T extends typeof String> = T;
    `,

      // Good: Mapped types with typeof on non-local constants
      `
    type MappedType = {
      [K in keyof typeof globalThis]: string;
    };
    `,

      // Good: Index signatures with typeof
      `
    type IndexType = {
      [key: typeof Symbol.iterator]: string;
    };
    `,

      // Good: Complex member expressions
      `
    const STATUS_EXCEEDING = 'local' as const;
    type ComplexMember = typeof window.location.href;
    `,

      // Good: Typeof on function expressions
      `
    const STATUS_EXCEEDING = 'local' as const;
    const fn = () => 'test';
    type FunctionType = typeof fn;
    `,

      // Good: Typeof on class constructors
      `
    const STATUS_EXCEEDING = 'local' as const;
    class TestClass {}
    type ConstructorType = typeof TestClass;
    `,

      // Good: Typeof with computed property access
      `
    const STATUS_EXCEEDING = 'local' as const;
    const key = 'someKey';
    type ComputedType = typeof obj[key];
    `,

      // Good: Typeof in template literal types (non-constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    type TemplateType = \`prefix-\${typeof String}\`;
    `,

      // Good: Constants without identifiers (destructured)
      `
    const { STATUS_EXCEEDING } = { STATUS_EXCEEDING: 'destructured' as const };
    type DestructuredType = typeof STATUS_EXCEEDING;
    `,

      // Good: Array destructuring
      `
    const [STATUS_EXCEEDING] = ['array' as const];
    type ArrayDestructuredType = typeof STATUS_EXCEEDING;
    `,

      // Good: Rest parameters in destructuring
      `
    const [first, ...STATUS_EXCEEDING] = ['first', 'rest' as const];
    type RestType = typeof STATUS_EXCEEDING;
    `,

      // Good: Renamed imports
      `
    import { STATUS_EXCEEDING as IMPORTED_STATUS } from './external';
    const STATUS_EXCEEDING = 'local' as const;
    type RenamedImportType = typeof IMPORTED_STATUS;
    `,

      // Good: Namespace imports
      `
    import * as Constants from './constants';
    const STATUS_EXCEEDING = 'local' as const;
    type NamespaceType = typeof Constants.STATUS_EXCEEDING;
    `,

      // Good: Dynamic imports
      `
    const STATUS_EXCEEDING = 'local' as const;
    type DynamicType = typeof import('./module').STATUS_EXCEEDING;
    `,

      // Good: Typeof on this expressions
      `
    const STATUS_EXCEEDING = 'local' as const;
    class TestClass {
      method() {
        type ThisType = typeof this.STATUS_EXCEEDING;
      }
    }
    `,

      // Good: Typeof on super expressions
      `
    const STATUS_EXCEEDING = 'local' as const;
    class BaseClass {
      static STATUS_EXCEEDING = 'base';
    }
    class DerivedClass extends BaseClass {
      static getSuperType() {
        type SuperType = typeof super.STATUS_EXCEEDING;
      }
    }
    `,

      // Good: Typeof with optional chaining
      `
    const STATUS_EXCEEDING = 'local' as const;
    type OptionalType = typeof obj?.STATUS_EXCEEDING;
    `,

      // Good: Typeof with nullish coalescing
      `
    const STATUS_EXCEEDING = 'local' as const;
    type NullishType = typeof (obj?.STATUS_EXCEEDING ?? 'default');
    `,

      // Good: Constants in different modules (re-exports)
      `
    export { STATUS_EXCEEDING } from './other-module';
    const STATUS_EXCEEDING = 'local' as const;
    `,

      // Good: Constants with complex initializers
      `
    const STATUS_EXCEEDING = (() => 'complex' as const)();
    type ComplexInitType = typeof STATUS_EXCEEDING;
    `,

      // Good: Constants with function calls
      `
    const STATUS_EXCEEDING = String('function-call') as const;
    type FunctionCallType = typeof STATUS_EXCEEDING;
    `,

      // Good: Constants with template literals (non-const)
      `
    const prefix = 'test';
    const STATUS_EXCEEDING = \`\${prefix}-value\`;
    type TemplateConstType = typeof STATUS_EXCEEDING;
    `,

      // Good: Unicode and special characters in names
      `
    const STATUS_EXCEEDING_🚀 = 'unicode' as const;
    const STATUS_EXCEEDING = 'normal' as const;
    type UnicodeType = typeof STATUS_EXCEEDING_🚀;
    `,

      // Good: Very long constant names
      `
    const STATUS_EXCEEDING_WITH_VERY_LONG_NAME_THAT_GOES_ON_AND_ON = 'long' as const;
    const STATUS_EXCEEDING = 'short' as const;
    type LongNameType = typeof STATUS_EXCEEDING_WITH_VERY_LONG_NAME_THAT_GOES_ON_AND_ON;
    `,

      // Good: Constants with numbers
      `
    const STATUS_EXCEEDING_123 = 'numbered' as const;
    const STATUS_EXCEEDING = 'normal' as const;
    type NumberedType = typeof STATUS_EXCEEDING_123;
    `,

      // Good: Constants with dollar signs
      `
    const $STATUS_EXCEEDING = 'dollar' as const;
    const STATUS_EXCEEDING = 'normal' as const;
    type DollarType = typeof $STATUS_EXCEEDING;
    `,

      // Good: Constants with underscores at different positions
      `
    const _STATUS_EXCEEDING_ = 'underscores' as const;
    const STATUS_EXCEEDING = 'normal' as const;
    type UnderscoreType = typeof _STATUS_EXCEEDING_;
    `,

      // Good: Case variations that don't match
      `
    const STATUS_EXCEEDING = 'upper' as const;
    const status_exceeding = 'lower';
    type CaseType = typeof status_exceeding;
    `,

      // Good: Typeof in satisfies expressions (non-constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    const value = 'test' satisfies typeof String;
    `,

      // Good: Typeof in type assertions (non-constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    const value = 'test' as typeof String;
    `,

      // Good: Typeof with parentheses
      `
    const STATUS_EXCEEDING = 'local' as const;
    type ParenType = typeof (String);
    `,

      // Good: Typeof in array types (non-constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    type ArrayType = Array<typeof String>;
    `,

      // Good: Typeof in tuple types (non-constant)
      `
    const STATUS_EXCEEDING = 'local' as const;
    type TupleType = [typeof String, typeof Number];
    `,

      // Good: Constants in catch blocks
      `
    try {
      // code
    } catch (STATUS_EXCEEDING) {
      type CatchType = typeof STATUS_EXCEEDING;
    }
    `,

      // Good: Constants in for-of loops
      `
    for (const STATUS_EXCEEDING of ['a', 'b']) {
      type LoopType = typeof STATUS_EXCEEDING;
    }
    `,

      // Good: Constants in switch cases
      `
    const value = 'test';
    switch (value) {
      case 'test': {
        const STATUS_EXCEEDING = 'case' as const;
        break;
      }
    }
    type SwitchType = typeof STATUS_EXCEEDING; // Different scope
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






