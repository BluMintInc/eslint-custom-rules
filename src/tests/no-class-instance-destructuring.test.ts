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
    {
      code: `
        class Example {
          constructor() {
            this.name = 'test';
            this.age = 25;
          }
          getName() {
            return this.name;
          }
          getAge() {
            return this.age;
          }
        }
        const example = new Example();
        const { getName, getAge } = example;
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        class Example {
          constructor() {
            this.name = 'test';
            this.age = 25;
          }
          getName() {
            return this.name;
          }
          getAge() {
            return this.age;
          }
        }
        const example = new Example();
        const getName = example.getName;
        const getAge = example.getAge;
      `,
    },
    {
      code: `
        const { name, age } = new Person('John', 30);
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        const name = new Person('John', 30).name;
        const age = new Person('John', 30).age;
      `,
    },
    {
      code: `
        class DataHolder {
          constructor(data) {
            this.data = data;
          }
          get value() { return this.data.value; }
          get type() { return this.data.type; }
        }
        const holder = new DataHolder({ value: 42, type: 'number' });
        const { value, type } = holder;
      `,
      errors: [{ messageId: 'noClassInstanceDestructuring' }],
      output: `
        class DataHolder {
          constructor(data) {
            this.data = data;
          }
          get value() { return this.data.value; }
          get type() { return this.data.type; }
        }
        const holder = new DataHolder({ value: 42, type: 'number' });
        const value = holder.value;
        const type = holder.type;
      `,
    },
  ],
});
