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
                "`const person = new Person('John', 30);` then `person.name`, `person.age`",
            },
          },
        ],
        output: `
        const person = new Person('John', 30);
        const name = person.name;
        const age = person.age;
      `,
      },
      // Issue #1524: the constructor must run once, not once per property
      {
        code: `
let constructions = 0;
export class Person {
  constructor(public name: string, public age: number) {
    constructions += 1;
  }
}
export function build(): [string, number, number] {
  const { name, age } = new Person('John', 30);
  return [name, age, constructions];
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
let constructions = 0;
export class Person {
  constructor(public name: string, public age: number) {
    constructions += 1;
  }
}
export function build(): [string, number, number] {
  const person = new Person('John', 30);
  const name = person.name;
  const age = person.age;
  return [name, age, constructions];
}
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
      // The temp binding must not reuse a name that is already visible
      {
        code: `
const person = 'existing';
function build() {
  const { name, age } = new Person('John', 30);
  return [person, name, age];
}
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: "`new Person('John', 30)`",
              members: '`name`, `age`',
              suggestion:
                "`const person2 = new Person('John', 30);` then `person2.name`, `person2.age`",
            },
          },
        ],
        output: `
const person = 'existing';
function build() {
  const person2 = new Person('John', 30);
  const name = person2.name;
  const age = person2.age;
  return [person, name, age];
}
      `,
      },
      // The names the fix itself binds are taken too
      {
        code: `
const { person, age } = new Person('John', 30);
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const person2 = new Person('John', 30);
const person = person2.person;
const age = person2.age;
      `,
      },
      // Disambiguation keeps counting until it finds a free name
      {
        code: `
const person = 1;
const person2 = 2;
function f() {
  const { name, age } = new Person('a', 1);
  return [person, person2, name, age];
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const person = 1;
const person2 = 2;
function f() {
  const person3 = new Person('a', 1);
  const name = person3.name;
  const age = person3.age;
  return [person, person2, name, age];
}
      `,
      },
      // An unresolved global referenced anywhere in the file is visible here too
      {
        code: `
function f() {
  const { name, age } = new Person('a', 1);
  return [name, age];
}
function g() {
  console.log(person);
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
function f() {
  const person2 = new Person('a', 1);
  const name = person2.name;
  const age = person2.age;
  return [name, age];
}
function g() {
  console.log(person);
}
      `,
      },
      // An imported name is visible at the insertion point
      {
        code: `
import { holder } from './h';
const { a, b } = new Holder(1);
console.log(holder, a, b);
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
import { holder } from './h';
const holder2 = new Holder(1);
const a = holder2.a;
const b = holder2.b;
console.log(holder, a, b);
      `,
      },
      // Every emitted line keeps the indentation of the statement it replaces
      {
        code: `
class C {
  m() {
    if (true) {
      const { a, b } = new Holder(1);
      return [a, b];
    }
  }
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
class C {
  m() {
    if (true) {
      const holder = new Holder(1);
      const a = holder.a;
      const b = holder.b;
      return [a, b];
    }
  }
}
      `,
      },
      // Tab indentation is preserved verbatim
      {
        code: `
function f() {
\tconst { a, b } = new Holder(1);
\treturn [a, b];
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
function f() {
\tconst holder = new Holder(1);
\tconst a = holder.a;
\tconst b = holder.b;
\treturn [a, b];
}
      `,
      },
      // An identifier source is already a single binding, so no temp is added
      {
        code: `
class A { b = 1; c = 2; }
function f() {
  const inst = new A();
  const { b, c } = inst;
  return [b, c];
}
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
function f() {
  const inst = new A();
  const b = inst.b;
  const c = inst.c;
  return [b, c];
}
      `,
      },
      // A single member constructs once, so it stays an inline member read
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
      // A renamed single member from an identifier source
      {
        code: `
class A { b = 1; }
const inst = new A();
const { b: renamed } = inst;
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
const renamed = inst.b;
      `,
      },
      // Renamed members read from the single temp binding
      {
        code: `
const { name: n, age: a } = new Person('John', 30);
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const person = new Person('John', 30);
const n = person.name;
const a = person.age;
      `,
      },
      // Computed keys read from the single temp binding
      {
        code: `
const k1 = 'a';
const k2 = 'b';
const { [k1]: first, [k2]: second } = new Bag(1);
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`new Bag(1)`',
              members: '`[k1]`, `[k2]`',
              suggestion: '`const bag = new Bag(1);` then `bag[k1]`, `bag[k2]`',
            },
          },
        ],
        output: `
const k1 = 'a';
const k2 = 'b';
const bag = new Bag(1);
const first = bag[k1];
const second = bag[k2];
      `,
      },
      // A nested pattern destructures the member read, not the instance
      {
        code: `
const { a: { deep }, b } = new Holder();
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const holder = new Holder();
const { deep } = holder.a;
const b = holder.b;
      `,
      },
      // Exported members stay exported; the temp binding stays private
      {
        code: `
export const { a, b } = new Holder(1);
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const holder = new Holder(1);
export const a = holder.a;
export const b = holder.b;
      `,
      },
      {
        code: `
const inst = new Holder(1);
export const { a, b } = inst;
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const inst = new Holder(1);
export const a = inst.a;
export const b = inst.b;
      `,
      },
      // The declaration kind carries over to every emitted binding
      {
        code: `
let { a, b } = new Holder(1);
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const holder = new Holder(1);
let a = holder.a;
let b = holder.b;
      `,
      },
      // A semicolon-free source stays semicolon-free
      {
        code: `
const { a, b } = new Holder(1)
const z = 3
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const holder = new Holder(1)
const a = holder.a
const b = holder.b
const z = 3
      `,
      },
      // `new Holder.a` would construct `Holder.a`, so the call parens are added
      {
        code: `
const { a } = new Holder;
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`new Holder`',
              members: '`a`',
              suggestion: '`new Holder().a`',
            },
          },
        ],
        output: `
const a = new Holder().a;
      `,
      },
      // A leading run of capitals is one word, so the temp is not `uRLParser`
      {
        code: `
const { a, b } = new URLParser('x');
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const urlParser = new URLParser('x');
const a = urlParser.a;
const b = urlParser.b;
      `,
      },
      {
        code: `
const { a, b } = new URL('x');
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const url = new URL('x');
const a = url.a;
const b = url.b;
      `,
      },
      // A callee whose lowercased name is a keyword gets a suffix instead
      {
        code: `
const { a, b } = new Function('x', 'y');
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const functionInstance = new Function('x', 'y');
const a = functionInstance.a;
const b = functionInstance.b;
      `,
      },
      // An already-lowercase callee would be shadowed by a bare lowercase temp
      {
        code: `
const { a, b } = new person('x');
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const personInstance = new person('x');
const a = personInstance.a;
const b = personInstance.b;
      `,
      },
      // A qualified callee names the temp after its final segment
      {
        code: `
const { a, b } = new lib.Widget('x');
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
const widget = new lib.Widget('x');
const a = widget.a;
const b = widget.b;
      `,
      },
      // A switch case holds statements, so the rewrite fits
      {
        code: `
switch (x) {
  case 1:
    const { a, b } = new Holder(1);
    break;
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
switch (x) {
  case 1:
    const holder = new Holder(1);
    const a = holder.a;
    const b = holder.b;
    break;
}
      `,
      },
      // So does a class static block
      {
        code: `
class C {
  static {
    const { a, b } = new Holder(1);
  }
}
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: `
class C {
  static {
    const holder = new Holder(1);
    const a = holder.a;
    const b = holder.b;
  }
}
      `,
      },
      // A rest element cannot become a member read, so the fix is withheld
      {
        code: `
const { a, ...rest } = new Holder();
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: null,
      },
      // A default value applies only when the member is undefined
      {
        code: `
const { a = 1, b } = new Holder();
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: null,
      },
      // Sibling declarators would have to be hoisted past the temp binding
      {
        code: `
const { a, b } = new Holder(), y = 2;
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: null,
      },
      // A `for` initializer holds exactly one statement
      {
        code: `
for (const { a, b } = new Holder(1); ; ) { break; }
      `,
        errors: [{ messageId: 'noClassInstanceDestructuring' }],
        output: null,
      },
      // An empty pattern binds nothing to rewrite
      {
        code: `
const {} = new Holder(1);
      `,
        errors: [
          {
            messageId: 'noClassInstanceDestructuring',
            data: {
              instance: '`new Holder(1)`',
              members: '`<members>`',
              suggestion: '`new Holder(1).<member>`',
            },
          },
        ],
        output: null,
      },
    ],
  },
);
