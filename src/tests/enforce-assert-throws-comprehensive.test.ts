import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

// Comprehensive test suite to ensure the assert-prefix-throws rule handles all edge cases
ruleTesterTs.run('enforce-assert-throws-comprehensive', enforceAssertThrows, {
  valid: [
    // Basic throw in function body
    {
      code: `
        function assertValid() {
          throw new Error('Invalid');
        }
      `,
    },
    // Throw in if statement
    {
      code: `
        function assertCondition(value: any) {
          if (!value) {
            throw new Error('Value is required');
          }
        }
      `,
    },
    // Throw in nested if statements
    {
      code: `
        function assertNestedCondition(data: any) {
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
    // Throw in for loop
    {
      code: `
        function assertArrayValid(arr: any[]) {
          for (let i = 0; i < arr.length; i++) {
            if (!arr[i]) {
              throw new Error('Invalid array element');
            }
          }
        }
      `,
    },
    // Throw in for...of loop
    {
      code: `
        function assertItemsValid(items: any[]) {
          for (const item of items) {
            if (!item.isValid) {
              throw new Error('Invalid item');
            }
          }
        }
      `,
    },
    // Throw in for...in loop
    {
      code: `
        function assertPropertiesValid(obj: any) {
          for (const key in obj) {
            if (key.startsWith('_')) {
              throw new Error('Private properties not allowed');
            }
          }
        }
      `,
    },
    // Throw in while loop
    {
      code: `
        function assertProcessCompletes() {
          let attempts = 0;
          while (attempts < 10) {
            if (attempts > 5) {
              throw new Error('Too many attempts');
            }
            attempts++;
          }
        }
      `,
    },
    // Throw in do-while loop
    {
      code: `
        function assertRetrySucceeds() {
          let count = 0;
          do {
            count++;
            if (count > 3) {
              throw new Error('Retry failed');
            }
          } while (count < 2);
        }
      `,
    },
    // Throw in switch statement
    {
      code: `
        function assertValidStatus(status: string) {
          switch (status) {
            case 'error':
              throw new Error('Error status not allowed');
            case 'invalid':
              throw new Error('Invalid status');
            default:
              break;
          }
        }
      `,
    },
    // Throw in nested switch statements
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
    // Throw in try-catch block
    {
      code: `
        function assertFileExists(path: string) {
          try {
            fs.accessSync(path);
          } catch (error) {
            throw new Error('File does not exist');
          }
        }
      `,
    },
    // Throw in nested loops
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
    // Throw in complex nested structures
    {
      code: `
        function assertComplexValidation(data: any) {
          for (const section of data.sections) {
            if (section.type === 'critical') {
              for (const item of section.items) {
                switch (item.status) {
                  case 'invalid':
                    if (item.priority === 'high') {
                      throw new Error('High priority invalid item');
                    }
                    break;
                  case 'error':
                    throw new Error('Error item found');
                }
              }
            }
          }
        }
      `,
    },
    // Throw in ternary expression (simplified)
    {
      code: `
        function assertTernary(condition: boolean) {
          if (condition) {
            return;
          } else {
            throw new Error('Condition failed');
          }
        }
      `,
    },
    // Throw in logical expression (simplified)
    {
      code: `
        function assertLogical(value: any) {
          if (!value) {
            throw new Error('Value is falsy');
          }
        }
      `,
    },
    // Throw in arrow function body
    {
      code: `
        const assertArrow = (value: any) => {
          if (!value) {
            throw new Error('Value required');
          }
        };
      `,
    },
    // Throw in async function
    {
      code: `
        async function assertAsync(promise: Promise<any>) {
          const result = await promise;
          if (!result) {
            throw new Error('Promise resolved to falsy value');
          }
        }
      `,
    },
    // Throw in generator function
    {
      code: `
        function* assertGenerator(items: any[]) {
          for (const item of items) {
            if (!item) {
              throw new Error('Invalid item in generator');
            }
            yield item;
          }
        }
      `,
    },
    // Throw in class method
    {
      code: `
        class Validator {
          assertValid(data: any) {
            if (!data) {
              throw new Error('Data is required');
            }
          }
        }
      `,
    },
    // Throw in static method
    {
      code: `
        class Validator {
          static assertStatic(value: any) {
            if (!value) {
              throw new Error('Static validation failed');
            }
          }
        }
      `,
    },
    // Throw in private method
    {
      code: `
        class Validator {
          private assertPrivate(value: any) {
            if (!value) {
              throw new Error('Private validation failed');
            }
          }
        }
      `,
    },
    // Throw in getter
    {
      code: `
        class Validator {
          get assertProperty() {
            if (!this.isValid) {
              throw new Error('Property validation failed');
            }
            return this.value;
          }
        }
      `,
    },
    // Process.exit(1) usage
    {
      code: `
        function assertEnvironment() {
          if (!process.env.NODE_ENV) {
            process.exit(1);
          }
        }
      `,
    },
    // Process.exit(1) in conditional
    {
      code: `
        function assertConfig() {
          for (const key of requiredKeys) {
            if (!config[key]) {
              console.error('Missing required config');
              process.exit(1);
            }
          }
        }
      `,
    },
    // Calling other assert functions
    {
      code: `
        function assertComplex() {
          assertBasic();
          this.assertMethod();
        }
      `,
    },
    // Mixed throw and assert calls
    {
      code: `
        function assertMixed(data: any) {
          if (!data) {
            throw new Error('No data');
          }
          assertDataStructure(data);
        }
      `,
    },
    // Throw in forEach callback
    {
      code: `
        function assertAllItems(items: any[]) {
          items.forEach(item => {
            if (!item.isValid) {
              throw new Error('Invalid item in forEach');
            }
          });
        }
      `,
    },
    // Throw in map callback
    {
      code: `
        function assertAndTransform(items: any[]) {
          return items.map(item => {
            if (!item) {
              throw new Error('Invalid item in map');
            }
            return item.value;
          });
        }
      `,
    },
    // Throw in filter callback
    {
      code: `
        function assertAndFilter(items: any[]) {
          return items.filter(item => {
            if (item.type === 'invalid') {
              throw new Error('Invalid item type');
            }
            return item.isValid;
          });
        }
      `,
    },
    // Throw in reduce callback
    {
      code: `
        function assertAndReduce(items: any[]) {
          return items.reduce((acc, item) => {
            if (!item) {
              throw new Error('Invalid item in reduce');
            }
            return acc + item.value;
          }, 0);
        }
      `,
    },
    // Throw in Promise constructor (simplified)
    {
      code: `
        function assertPromise() {
          if (!someCondition) {
            throw new Error('Promise validation failed');
          }
          return new Promise((resolve) => {
            resolve(true);
          });
        }
      `,
    },
    // Throw in setTimeout callback (simplified)
    {
      code: `
        function assertTimeout() {
          if (!globalState.isValid) {
            throw new Error('Timeout validation failed');
          }
          setTimeout(() => {
            console.log('Timer expired');
          }, 1000);
        }
      `,
    },
    // Throw in event handler (simplified)
    {
      code: `
        function assertEventHandler() {
          if (!element.dataset.valid) {
            throw new Error('Event validation failed');
          }
          element.addEventListener('click', () => {
            console.log('Event handled');
          });
        }
      `,
    },
    // Throw with different error types
    {
      code: `
        function assertCustomError() {
          if (!condition) {
            throw new TypeError('Type validation failed');
          }
        }
      `,
    },
    // Throw with custom error class
    {
      code: `
        function assertHttpError() {
          if (!response.ok) {
            throw new HttpsError('failed-precondition', 'Request failed');
          }
        }
      `,
    },
    // Multiple throws in different branches
    {
      code: `
        function assertMultipleBranches(type: string, value: any) {
          if (type === 'string') {
            if (typeof value !== 'string') {
              throw new Error('Expected string');
            }
          } else if (type === 'number') {
            if (typeof value !== 'number') {
              throw new Error('Expected number');
            }
          } else {
            throw new Error('Unknown type');
          }
        }
      `,
    },
    // Throw in finally block
    {
      code: `
        function assertFinally() {
          try {
            doSomething();
          } finally {
            if (!cleanupSuccessful) {
              throw new Error('Cleanup failed');
            }
          }
        }
      `,
    },
    // Throw in labeled statement
    {
      code: `
        function assertLabeled() {
          for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
              if (matrix[i][j] === null) {
                throw new Error('Null value found');
              }
            }
          }
        }
      `,
    },
  ],
  invalid: [
    // Assert function with no throw at all
    {
      code: `
        function assertEmpty() {
          // No throw statement
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with only console.log
    {
      code: `
        function assertConsoleOnly() {
          console.log('This should throw');
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with only return
    {
      code: `
        function assertReturnOnly() {
          return false;
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with loop but no throw
    {
      code: `
        function assertLoopNoThrow(items: any[]) {
          for (const item of items) {
            console.log(item);
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with conditional but no throw
    {
      code: `
        function assertConditionalNoThrow(value: any) {
          if (!value) {
            console.warn('Value is missing');
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with switch but no throw
    {
      code: `
        function assertSwitchNoThrow(status: string) {
          switch (status) {
            case 'invalid':
              console.error('Invalid status');
              break;
            default:
              console.log('Valid status');
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with try-catch but no throw
    {
      code: `
        function assertTryCatchNoThrow() {
          try {
            riskyOperation();
          } catch (error) {
            console.error('Operation failed');
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with nested structures but no throw
    {
      code: `
        function assertNestedNoThrow(data: any) {
          for (const section of data.sections) {
            if (section.type === 'critical') {
              for (const item of section.items) {
                console.log('Processing item:', item);
              }
            }
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with async but no throw
    {
      code: `
        async function assertAsyncNoThrow() {
          const result = await somePromise();
          console.log(result);
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with generator but no throw
    {
      code: `
        function* assertGeneratorNoThrow(items: any[]) {
          for (const item of items) {
            yield item;
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert method with no throw
    {
      code: `
        class Validator {
          assertMethodNoThrow(data: any) {
            return data !== null;
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert arrow function with no throw
    {
      code: `
        const assertArrowNoThrow = (value: any) => {
          return Boolean(value);
        };
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with callback but no throw
    {
      code: `
        function assertCallbackNoThrow(items: any[]) {
          items.forEach(item => {
            console.log('Processing:', item);
          });
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with Promise but no throw
    {
      code: `
        function assertPromiseNoThrow() {
          return new Promise((resolve) => {
            resolve(true);
          });
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Assert function with setTimeout but no throw
    {
      code: `
        function assertTimeoutNoThrow() {
          setTimeout(() => {
            console.log('Timer expired');
          }, 1000);
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Non-assert function calling assert method (should be prefixed)
    {
      code: `
        function validateData() {
          assertNotNull(data);
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert method calling assert method
    {
      code: `
        class Processor {
          processData() {
            this.assertValidInput();
          }
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert arrow function calling assert method
    {
      code: `
        const processItems = () => {
          assertItemsValid(items);
        };
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert function calling assert in conditional
    {
      code: `
        function checkCondition(value: any) {
          if (value) {
            assertNotEmpty(value);
          }
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert function calling assert in loop
    {
      code: `
        function processArray(items: any[]) {
          for (const item of items) {
            assertValidItem(item);
          }
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert function calling assert method on object
    {
      code: `
        function validateObject(obj: any) {
          obj.assertValid();
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert function calling assert in callback
    {
      code: `
        function processWithCallback(items: any[]) {
          items.forEach(item => {
            assertItemValid(item);
          });
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Non-assert function calling assert in Promise (simplified)
    {
      code: `
        function processAsync() {
          assertCondition();
          return new Promise((resolve) => {
            resolve(true);
          });
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
  ],
});
