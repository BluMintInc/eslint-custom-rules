import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

// Test to reproduce and fix the bug described in the issue
ruleTesterTs.run(
  'enforce-assert-throws-loops-and-control-structures',
  enforceAssertThrows,
  {
    valid: [
      // Original issue case - throws in for...of loop
      {
        code: `
        class SessionValidator {
          private assertSequentialSessions() {
            const indices = this.sessionIndicesSortedAscending;

            for (const [i, index] of indices.entries()) {
              if (index !== i) {
                throw new HttpsError(
                  'failed-precondition',
                  'Sessions must be sequential',
                  { expectedSession: i, foundSession: index },
                );
              }
            }
          }
        }
      `,
      },
      // Throws in for...in loop
      {
        code: `
        function assertValidProperties(obj: any) {
          for (const key in obj) {
            if (key.startsWith('_')) {
              throw new Error('Private properties not allowed');
            }
          }
        }
      `,
      },
      // Throws in traditional for loop
      {
        code: `
        function assertArrayBounds(arr: any[], maxSize: number) {
          for (let i = 0; i < arr.length; i++) {
            if (i >= maxSize) {
              throw new Error('Array exceeds maximum size');
            }
          }
        }
      `,
      },
      // Throws in while loop
      {
        code: `
        function assertNoInfiniteLoop() {
          let counter = 0;
          while (counter < 100) {
            if (counter > 50) {
              throw new Error('Infinite loop detected');
            }
            counter++;
          }
        }
      `,
      },
      // Throws in do-while loop
      {
        code: `
        function assertProcessCompletes() {
          let attempts = 0;
          do {
            attempts++;
            if (attempts > 10) {
              throw new Error('Process failed to complete');
            }
          } while (attempts < 5);
        }
      `,
      },
      // Throws in switch statement
      {
        code: `
        function assertValidStatus(status: string) {
          switch (status) {
            case 'invalid':
              throw new Error('Invalid status');
            case 'error':
              throw new Error('Error status');
            default:
              break;
          }
        }
      `,
      },
      // Throws in nested switch case
      {
        code: `
        function assertComplexStatus(type: string, status: string) {
          switch (type) {
            case 'user':
              switch (status) {
                case 'banned':
                  throw new Error('User is banned');
                default:
                  break;
              }
              break;
            case 'admin':
              if (status === 'inactive') {
                throw new Error('Admin cannot be inactive');
              }
              break;
          }
        }
      `,
      },
      // Throws in nested loops
      {
        code: `
        function assertMatrixValid(matrix: number[][]) {
          for (let i = 0; i < matrix.length; i++) {
            for (let j = 0; j < matrix[i].length; j++) {
              if (matrix[i][j] < 0) {
                throw new Error('Negative values not allowed');
              }
            }
          }
        }
      `,
      },
      // Throws in loop with complex conditions
      {
        code: `
        function assertDataIntegrity(data: any[]) {
          for (const item of data) {
            if (item.type === 'critical') {
              for (const validator of item.validators) {
                if (!validator.isValid) {
                  throw new Error('Critical data validation failed');
                }
              }
            }
          }
        }
      `,
      },
      // Throws in nested if statements (should still work)
      {
        code: `
        function assertNestedConditions(data: any) {
          if (data) {
            if (data.type === 'invalid') {
              if (data.critical) {
                throw new Error('Critical invalid data');
              }
            }
          }
        }
      `,
      },
    ],
    invalid: [
      // Assert function with loop but no throw
      {
        code: `
        function assertAllValid(items: any[]) {
          for (const item of items) {
            if (!item.isValid) {
              console.log('Invalid item found');
            }
          }
        }
      `,
        errors: [{ messageId: 'assertShouldThrow' }],
      },
      // Assert function with switch but no throw
      {
        code: `
        function assertValidType(type: string) {
          switch (type) {
            case 'invalid':
              console.warn('Invalid type');
              break;
            default:
              console.log('Valid type');
          }
        }
      `,
        errors: [{ messageId: 'assertShouldThrow' }],
      },
      // Assert function with while loop but no throw
      {
        code: `
        function assertProcessing() {
          let counter = 0;
          while (counter < 10) {
            console.log('Processing...');
            counter++;
          }
        }
      `,
        errors: [{ messageId: 'assertShouldThrow' }],
      },
    ],
  },
);
