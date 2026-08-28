import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    // Valid positive boolean variables
    'const isValid = validateInput(value);',
    'const isAllowed = checkPermissions(user);',
    'const isEnabled = true;',
    'const isComplete = status === "done";',
    'const canAccess = user.permissions.includes("admin");',
    'const isAdmin = user.role === "admin";',
    'const isAuthorized = checkAuth(user);',
    'const canSubmit = true;',
    'const isVerified = user.verified;',

    // Valid positive function names
    'function isEligible(user: User) { return meetsRequirements(user); }',
    'function canAccessUser(userId: string) { return hasPermission(userId); }',

    // Valid positive property names
    `
    interface UserState {
      isActive: boolean;
      isVerified: boolean;
      hasPaid: boolean;
    }
    `,

    // Valid implementation with negation but positive naming
    'const isValid = !hasErrors;',
    'const canProceed = !isBlocked && !isPaused;',
    'const isAvailable = !isReserved && !isDeleted;',
    `
    // Regression: integer check should not be treated as negative naming
    type Validate<T> = (value: T) => true | string;
    export const isInteger: Validate<number> = (value) => {
      if (value !== undefined && !Number.isInteger(value)) {
        return 'Value must be an integer';
      }
      return true;
    };
    `,

    // Non-boolean variables should not be flagged
    'const errorMessage = "Something went wrong";',
    'const rejectedItems = items.filter(item => !item.accepted);',
    'const disabledFeatures: string[] = ["feature1", "feature2"];',
    'const errorHandler = (err: Error) => console.error(err);',
    'function handleError(error: Error) { console.log(error); }',
    'const invalidInputs = ["a", "b", "c"];',

    // Valid object method shorthand
    'const obj = { isValid() { return true; } };',

    // Non-boolean methods should not be flagged
    'const utils = { disableFeature(id: string) { /* implementation */ } };',
    'class ErrorHandler { handleError(err: Error) { /* implementation */ } }',

    // A type-only expression wrapper (`as T`, `satisfies T`, `!`) changes no
    // runtime semantics, so the validator carve-out must survive it (#2174).
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = ((value?: string) => validate(value)) as V;
    `,
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = ((value?: string) => validate(value)) satisfies V;
    `,
    'export const isNotBlank = ((value?: string) => validate(value))!;',
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = (function (value?: string) {
      return validate(value);
    }) as V;
    `,
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = ((value?: string) => {
      if (!value) {
        return 'Must not be blank';
      }
      return true;
    }) as V;
    `,
    `
    type V = (value?: string) => string | true;
    class Form {
      isNotBlank = ((value?: string) => validate(value)) as V;
    }
    `,
    `
    type V = (value?: string) => string | true;
    const validators = {
      isNotBlank: ((value?: string) => validate(value)) as V,
    };
    `,
    // Stacked wrappers unwrap to the same function.
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = (((value?: string) => validate(value)) as V)!;
    `,
    // The angle-bracket assertion is the same type-only wrapper.
    `
    type V = (value?: string) => string | true;
    export const isNotBlank = <V>((value?: string) => validate(value));
    `,

    // A property signature carries its return shape solely in the annotation,
    // so the carve-out must read it there too (#2175).
    'interface Form { isNotBlank: (value?: string) => string | true; }',
    'interface Form { isNotBlank?: (value?: string) => string | true; }',
    'interface Form { readonly isNotBlank: (value?: string) => string | true; }',
    'type Form = { isNotBlank: (value?: string) => string | true };',
    'interface Form { hasNoErrors: (value?: string) => string | true; }',
    'interface Form { isNotBlank: (value?: string) => void; }',
  ],
  invalid: [
    // Invalid boolean variables with "not" prefix
    {
      code: 'const isNotAllowed: boolean = checkPermissions(user);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotAllowed',
            alternatives: 'isAllowed',
          },
        },
      ],
    },
    {
      code: 'const hasNoAccess = !user.permissions.includes("admin");',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'hasNoAccess',
            alternatives: 'hasAccess',
          },
        },
      ],
    },
    {
      code: 'const isNotAdmin = user.role !== "admin";',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotAdmin',
            alternatives: 'isAdmin',
          },
        },
      ],
    },
    {
      code: 'const isNotVerified = !user.verified;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
      ],
    },
    {
      code: 'const isInvalid = !input;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isInvalid',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Boolean function names with negative prefixes
    {
      code: 'function isNotEligible(user: User): boolean { return !meetsRequirements(user); }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotEligible',
            alternatives: 'isEligible',
          },
        },
      ],
    },

    // Boolean PARAMETER names with negative prefixes. Parameters are checked by
    // their own visitor, independent of the function-name check above.
    {
      code: 'export function check(isNotValid: boolean) { return isNotValid; }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotValid',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Boolean property names with negative prefixes
    {
      code: `
      interface UserState {
        isNotVerified: boolean;
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
      ],
    },

    // Boolean method definitions with negative prefixes
    {
      code: `
      class Service {
        isNotActive(): boolean {
          return !this.active;
        }
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotActive',
            alternatives: 'isActive',
          },
        },
      ],
    },

    // Object method shorthand with negative prefixes
    {
      code: 'const obj = { isNotValid(): boolean { return false; } };',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotValid',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Additional boolean prefix patterns
    {
      code: 'const shouldNotProceed: boolean = condition;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'shouldNotProceed',
            alternatives: 'shouldProceed',
          },
        },
      ],
    },
    {
      code: 'const willNotWork = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'willNotWork',
            alternatives: 'willWork',
          },
        },
      ],
    },
    {
      code: 'const doesNotExist = condition === false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'doesNotExist',
            alternatives: 'doesExist',
          },
        },
      ],
    },
    // Anti-regression for #2174: unwrapping the assertion must not exempt a
    // function that is still proven to return a boolean.
    {
      code: `
type B = (value?: string) => boolean;
export const isNotBlank = ((value?: string): boolean => !!value) as B;
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotBlank',
            alternatives: 'isBlank',
          },
        },
      ],
    },
    {
      code: `
type B = (value?: string) => boolean;
class Form {
  isNotBlank = ((value?: string): boolean => !!value) as B;
}
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotBlank',
            alternatives: 'isBlank',
          },
        },
      ],
    },
    // Anti-regression for #2175: a property signature whose function type
    // returns a boolean is a genuine boolean predicate and still reports.
    {
      code: `
type B = (value?: string) => boolean;
export const isNotBlank = <B>((value?: string): boolean => !!value);
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotBlank',
            alternatives: 'isBlank',
          },
        },
      ],
    },
    {
      code: 'interface Form { isNotBlank: (value?: string) => boolean; }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotBlank',
            alternatives: 'isBlank',
          },
        },
      ],
    },
    {
      code: 'interface Form { isNotVerified: boolean; }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
      ],
    },
  ],
});
