import { enforcePositiveNaming } from '../rules/enforce-positive-naming';
import { ruleTesterTs } from '../utils/ruleTester';

// Regression coverage for #1344: `enforce-positive-naming` flagged validator
// predicates whose name is a domain-standard `isNot*`/`isNon*` negation even
// though the value is not a boolean — it returns `string | true` (an error
// message on rejection, `true` on acceptance). The positive rename would invert
// the predicate's meaning, so these must not be flagged.
ruleTesterTs.run(
  'enforce-positive-naming-validator-negation',
  enforcePositiveNaming,
  {
    valid: [
      // --- Issue repro: const arrow validators returning `string | true` ---
      `export const isNotBlank = (value?: string) => {
        if (!value?.trim()) {
          return 'Must not be blank';
        }
        return true;
      };`,
      `export const isNotEmpty = (value?: string) => {
        if (!value) {
          return 'Must not be empty';
        }
        return true;
      };`,
      `export const isNonNegative = (value?: number) => {
        if (value !== undefined && value < 0) {
          return 'Must not be negative';
        }
        return true;
      };`,
      `export const isNotReserved = (value?: string) => {
        if (RESERVED.has(value ?? '')) {
          return 'Must not be reserved';
        }
        return true;
      };`,

      // Function-declaration form of the same validator predicate.
      `export function isNotBlank(value?: string) {
        if (!value?.trim()) {
          return 'Must not be blank';
        }
        return true;
      }`,

      // Explicit `string | true` return annotation, even when the body is a
      // single ambiguous call expression.
      `export const isNotBlank = (value?: string): string | true => validate(value);`,
      `export const isNonNegative = (value?: number): true | string => check(value);`,

      // Concise-arrow conditional returning an error string on rejection.
      `export const isNotBlank = (value?: string) => !value ? 'Must not be blank' : true;`,

      // Error message returned through a type-only wrapper (`as const`,
      // `satisfies`) is still recognized as a non-boolean return.
      `export const isNotBlank = (value?: string) => {
        if (!value?.trim()) {
          return 'Must not be blank' as const;
        }
        return true;
      };`,
      `export const isNotEmpty = (value?: string) => {
        if (!value) {
          return 'Must not be empty' satisfies string;
        }
        return true;
      };`,

      // Numeric-returning predicate is likewise not a boolean.
      `export const isNotZeroCode = (value: number) => {
        if (value === 0) {
          return 1;
        }
        return value;
      };`,

      // Nested error-string return (behind if/else) is still detected.
      `export const isNotBlank = (value?: string) => {
        if (value) {
          if (!value.trim()) {
            return 'Must not be blank';
          }
        }
        return true;
      };`,

      // Class-method and object-method validator forms.
      `class Validators {
        isNotBlank(value?: string) {
          if (!value?.trim()) {
            return 'Must not be blank';
          }
          return true;
        }
      }`,
      `const validators = {
        isNotBlank: (value?: string) => {
          if (!value?.trim()) {
            return 'Must not be blank';
          }
          return true;
        },
      };`,

      // A nested boolean-returning function must not fool the outer validator's
      // return-shape analysis.
      `export const isNotBlank = (value?: string) => {
        const isEmpty = (v?: string) => !v;
        if (isEmpty(value)) {
          return 'Must not be blank';
        }
        return true;
      };`,
    ],
    invalid: [
      // Genuine negatively-named boolean predicate (returns a comparison) must
      // still be flagged — the fix must not over-exempt.
      {
        code: `const isNotAdmin = (user: User) => user.role !== 'admin';`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotAdmin', alternatives: 'isAdmin' },
          },
        ],
      },
      // Boolean-literal return is still a boolean, so it stays flagged.
      {
        code: `const isNotReady = () => false;`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotReady', alternatives: 'isReady' },
          },
        ],
      },
      // Explicit `: boolean` return annotation keeps a negative predicate flagged.
      {
        code: `function isNotEligible(user: User): boolean { return !meets(user); }`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotEligible', alternatives: 'isEligible' },
          },
        ],
      },
      // Block body whose only returns are boolean expressions stays flagged.
      {
        code: `const isNotVerified = (user: User) => {
          if (user.pending) {
            return false;
          }
          return user.verified;
        };`,
        errors: [
          {
            messageId: 'avoidNegativeNaming',
            data: { name: 'isNotVerified', alternatives: 'isVerified' },
          },
        ],
      },
    ],
  },
);
