import { ruleTesterTs } from '../utils/ruleTester';
import { noClassInstanceDestructuring } from '../rules/no-class-instance-destructuring';

ruleTesterTs.run('no-class-instance-destructuring', noClassInstanceDestructuring, {
  valid: [
    // Direct property access is valid
    `
      class Example {
        getName() {
          return this.name;
        }
      }
      const example = new Example();
      const getName = example.getName;
    `,
    // Regular object destructuring is valid
    `
      const obj = { a: 1, b: 2 };
      const { a, b } = obj;
    `,
    // Method call without destructuring is valid
    `
      class BracketChunker {
        constructor(data) {
          this.data = data;
        }
        get cohorts() {
          return this.data;
        }
      }
      const bracketChunker = new BracketChunker(data);
      const cohorts = bracketChunker.cohorts;
    `,
  ],
  invalid: [
    {
      code: `
        class Example {
          getName() {
            return this.name;
          }
        }
        const example = new Example();
        const { getName } = example;
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        class Example {
          getName() {
            return this.name;
          }
        }
        const example = new Example();
        const getName = example.getName;
      `,
    },
    {
      code: `
        class BracketChunker {
          constructor(data) {
            this.data = data;
          }
          get cohorts() {
            return this.data;
          }
        }
        const bracketChunker = new BracketChunker(data);
        const { cohorts } = bracketChunker;
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        class BracketChunker {
          constructor(data) {
            this.data = data;
          }
          get cohorts() {
            return this.data;
          }
        }
        const bracketChunker = new BracketChunker(data);
        const cohorts = bracketChunker.cohorts;
      `,
    },
    {
      code: `
        const { cohorts } = new BracketChunker(data);
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        const cohorts = new BracketChunker(data).cohorts;
      `,
    },
  ],
});
