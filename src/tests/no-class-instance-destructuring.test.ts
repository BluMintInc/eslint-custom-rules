import { ruleTesterTs } from '../utils/ruleTester';
import { noClassInstanceDestructuring } from '../rules/no-class-instance-destructuring';

ruleTesterTs.run(
  'no-class-instance-destructuring',
  noClassInstanceDestructuring,
  {
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`example`',
              members: '`getName`',
              suggestion: '`example.getName`',
            },
          },
        ],
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
        class Example {
          constructor(map) {
            this.map = map;
          }
        }
        const key = 'value';
        const example = new Example({ value: 1 });
        const { [key]: selected } = example;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`example`',
              members: '`[key]`',
              suggestion: '`example[key]`',
            },
          },
        ],
        output: `
        class Example {
          constructor(map) {
            this.map = map;
          }
        }
        const key = 'value';
        const example = new Example({ value: 1 });
        const selected = example[key];
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`bracketChunker`',
              members: '`cohorts`',
              suggestion: '`bracketChunker.cohorts`',
            },
          },
        ],
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`new BracketChunker(data)`',
              members: '`cohorts`',
              suggestion: '`new BracketChunker(data).cohorts`',
            },
          },
        ],
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`example`',
              members: '`getName`, `getAge`',
              suggestion: '`example.getName`, `example.getAge`',
            },
          },
        ],
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: "`new Person('John', 30)`",
              members: '`name`, `age`',
              suggestion:
                "`new Person('John', 30).name`, `new Person('John', 30).age`",
            },
          },
        ],
        output: `
        const name = new Person('John', 30).name;
const age = new Person('John', 30).age;
      `,
      },
      // Unannotated single-property destructuring keeps its fix
      {
        code: `
        class A { b = 1; }
        const inst = new A();
        const { b } = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`',
              suggestion: '`inst.b`',
            },
          },
        ],
        output: `
        class A { b = 1; }
        const inst = new A();
        const b = inst.b;
      `,
      },
      // Unannotated multi-property destructuring keeps its fix
      {
        code: `
        class A { b = 1; c = 2; }
        const inst = new A();
        const { b, c } = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`, `c`',
              suggestion: '`inst.b`, `inst.c`',
            },
          },
        ],
        output: `
        class A { b = 1; c = 2; }
        const inst = new A();
        const b = inst.b;
const c = inst.c;
      `,
      },
      // An inline object-type annotation types the whole pattern and cannot be
      // split across per-property declarations, so the fix is withheld.
      {
        code: `
        class A { b = 1; }
        const inst = new A();
        const { b }: { b: number } = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`',
              suggestion: '`inst.b`',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class A { b = 1; c = 2; }
        const inst = new A();
        const { b, c }: { b: number; c: number } = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`, `c`',
              suggestion: '`inst.b`, `inst.c`',
            },
          },
        ],
        output: null,
      },
      // A type reference annotation is equally unsplittable without the type checker
      {
        code: `
        type SomeType = { b: number };
        class A { b = 1; }
        const inst = new A();
        const { b }: SomeType = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`',
              suggestion: '`inst.b`',
            },
          },
        ],
        output: null,
      },
      // A renamed property under an annotation is withheld too
      {
        code: `
        class A { b = 1; }
        const inst = new A();
        const { b: renamed }: { b: number } = inst;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`inst`',
              members: '`b`',
              suggestion: '`inst.b`',
            },
          },
        ],
        output: null,
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
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`holder`',
              members: '`value`, `type`',
              suggestion: '`holder.value`, `holder.type`',
            },
          },
        ],
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
  },
);
