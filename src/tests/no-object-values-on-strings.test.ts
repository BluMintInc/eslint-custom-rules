import { noObjectValuesOnStrings } from '../rules/no-object-values-on-strings';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-object-values-on-strings', noObjectValuesOnStrings, {
  valid: [
    // Basic valid cases - using Object.values on objects
    `const obj = { a: 1, b: 2 }; Object.values(obj);`,
    `Object.values({ a: 1, b: 2 });`,
    `const arr = [1, 2, 3]; Object.values(arr);`,
    `function getObject() { return { a: 1, b: 2 }; } Object.values(getObject());`,
    `class MyClass { getValues() { return Object.values(this); } }`,
    `const map = new Map(); Object.values(Object.fromEntries(map));`,

    // Type-safe function with proper constraints
    `function getValues<T extends Record<string, unknown>>(input: T) { return Object.values(input); }`,

    // Using with a properly typed variable
    `const data: Record<string, number> = { a: 1, b: 2 }; Object.values(data);`,

    // Using with a properly typed parameter
    `function processObject(obj: Record<string, unknown>) { return Object.values(obj); }`,

    // Object with string properties
    `const objWithStrings = { key1: "value1", key2: "value2" }; Object.values(objWithStrings);`,

    // Object with mixed types
    `const mixedObj = { a: 1, b: "string", c: true }; Object.values(mixedObj);`,

    // Using with null prototype object
    `const nullProtoObj = Object.create(null); nullProtoObj.a = 1; Object.values(nullProtoObj);`,

    // Using with object that has inherited properties
    `class Parent { parentProp = 'parent'; } class Child extends Parent { childProp = 'child'; } const child = new Child(); Object.values(child);`,

    // Using with object that has symbol properties (which Object.values ignores)
    `const objWithSymbol = { a: 1, [Symbol('b')]: 2 }; Object.values(objWithSymbol);`,

    // Using with object that has non-enumerable properties (which Object.values ignores)
    `const objWithNonEnum = {}; Object.defineProperty(objWithNonEnum, 'a', { value: 1, enumerable: false }); Object.values(objWithNonEnum);`,

    // Using with a function that returns a union type that doesn't include string
    `function getNumberOrBoolean(): number | boolean { return Math.random() > 0.5 ? 42 : true; } Object.values(getNumberOrBoolean() as any);`,

    // Using with a type assertion to non-string type
    `const someValue: any = { a: 1 }; Object.values(someValue as Record<string, unknown>);`,

    // Using with a complex object structure
    `const complexObj = { nested: { a: 1, b: 2 }, array: [1, 2, 3] }; Object.values(complexObj);`,

    // Using with a dynamically created object
    `const keys = ['a', 'b', 'c']; const dynamicObj = keys.reduce((acc, key) => ({ ...acc, [key]: key.charCodeAt(0) }), {}); Object.values(dynamicObj);`,

    // Using with an object from JSON
    `const jsonObj = JSON.parse('{"a":1,"b":2}'); Object.values(jsonObj);`,

    // Using with an object from a library/framework (simulated)
    `declare const libraryObj: Record<string, unknown>; Object.values(libraryObj);`,

    // Using with an object that has a toString method (but is still an object)
    `const objWithToString = { toString() { return "string representation"; }, a: 1 }; Object.values(objWithToString);`,

    // Using with a proxy object
    `const proxyObj = new Proxy({a: 1, b: 2}, {}); Object.values(proxyObj);`,

    // Using with an object that has getters
    `const objWithGetter = { get prop() { return 42; } }; Object.values(objWithGetter);`,
  ],
  invalid: [
    // Basic invalid cases - using Object.values on strings
    {
      code: `Object.values("hello");`,
      errors: [{ messageId: 'unexpected' }],
    },
    {
      code: `Object.values(\`template literal\`);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Function returning a string
    {
      code: `function getString() { return "hello"; } Object.values(getString());`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Variable with string type
    {
      code: `const str: string = "hello"; Object.values(str);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String concatenation
    {
      code: `Object.values("hello" + " world");`,
      errors: [{ messageId: 'unexpected' }],
    },

    // Template literal with expressions
    {
      code: `const name = "world"; Object.values(\`hello \${name}\`);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a method call
    {
      code: `Object.values("hello".toUpperCase());`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a complex expression
    {
      code: `Object.values(["a", "b", "c"].join(""));`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from JSON.stringify
    {
      code: `Object.values(JSON.stringify({ a: 1 }));`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a conditional expression
    {
      code: `Object.values(Math.random() > 0.5 ? "yes" : "no");`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a function with multiple return types including string - simplified
    {
      code: `const getStringOrObject = (): string => "hello"; Object.values(getStringOrObject());`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a parameter with string type
    {
      code: `function processValue(value: string) { return Object.values(value); }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a parameter with union type including string - simplified
    {
      code: `const value: string = "hello"; Object.values(value);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a generic function without proper constraints
    {
      code: `function getValues<T>(input: T) { return Object.values(input); } getValues("hello");`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a type assertion
    {
      code: `const someValue: any = "hello"; Object.values(someValue as string);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a complex nested expression
    {
      code: `const getStr = () => "hello"; Object.values(getStr());`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a library function (simulated)
    {
      code: `declare function getLibraryValue(): string; Object.values(getLibraryValue());`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a Promise resolution - simplified
    {
      code: `const str: string = "hello"; Object.values(str);`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a destructured parameter
    {
      code: `function test({ text }: { text: string }) { return Object.values(text); }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a default parameter
    {
      code: `function test(text = "default") { return Object.values(text); }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a class property
    {
      code: `class Test { text = "hello"; method() { return Object.values(this.text); } }`,
      errors: [{ messageId: 'unexpected' }],
    },

    // String from a complex object property access
    {
      code: `const obj = { nested: { text: "hello" } }; Object.values(obj.nested.text);`,
      errors: [{ messageId: 'unexpected' }],
    },
  ],
});
