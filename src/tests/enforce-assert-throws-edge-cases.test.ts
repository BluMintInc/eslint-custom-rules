import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

ruleTesterTs.run('enforce-assert-throws-edge-cases', enforceAssertThrows, {
  valid: [
    // Edge case: assert method with conditional return before calling another assert method
    {
      code: `
        class EdgeCaseValidator {
          assertComplexCondition(data: any) {
            if (!data) {
              return 'no-data';
            }
            if (data.skipValidation) {
              return 'skipped';
            }
            return this.assertDataValid(data);
          }

          assertDataValid(data: any) {
            throw new Error('Invalid data');
          }
        }
      `,
    },
    // Edge case: assert method with ternary expressions
    {
      code: `
        class ComplexExpressionValidator {
          assertComplexExpression(data: any) {
            return data.isValid ? this.assertValidData(data) : this.assertInvalidData(data);
          }

          assertValidData(data: any) {
            throw new Error('Valid data assertion failed');
          }

          assertInvalidData(data: any) {
            throw new Error('Invalid data assertion failed');
          }
        }
      `,
    },
    // Edge case: assert method that calls assert method through variable assignment
    {
      code: `
        class VariableAssignmentValidator {
          assertThroughVariable(data: any) {
            const validator = this.assertDataValid;
            return validator(data);
          }

          assertDataValid(data: any) {
            throw new Error('Data validation failed');
          }
        }
      `,
    },
    // Edge case: assert method with multiple assert calls in sequence
    {
      code: `
        class SequentialValidator {
          assertSequential(data: any) {
            this.assertNotNull(data);
            this.assertValidFormat(data);
            return this.assertBusinessRules(data);
          }

          assertNotNull(data: any) {
            if (!data) throw new Error('Data is null');
          }

          assertValidFormat(data: any) {
            if (!data.format) throw new Error('Invalid format');
          }

          assertBusinessRules(data: any) {
            if (!data.valid) throw new Error('Business rules failed');
          }
        }
      `,
    },
  ],
  invalid: [
    // Edge case: assert method that calls non-assert method
    {
      code: `
        class FalsePositiveValidator {
          assertFalsePositive(data: any) {
            return this.notAssertMethod(data);
          }

          // This method name doesn't start with assert
          notAssertMethod(data: any) {
            throw new Error('This should not count as assert method');
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Edge case: assert method that doesn't throw or call assert methods
    {
      code: `
        class NoThrowValidator {
          assertNoThrow(data: any) {
            console.log('Validating data');
            return data.isValid;
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Edge case: assert method that only logs
    {
      code: `
        class LoggingValidator {
          assertLogging(data: any) {
            if (!data) {
              console.error('Data is invalid');
              return false;
            }
            return true;
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
  ],
});
