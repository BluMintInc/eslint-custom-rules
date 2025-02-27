# no-circular-references

Disallow circular references in objects to prevent issues with JSON serialization and memory leaks.

## Rule Details

This rule aims to detect and prevent circular references in JavaScript/TypeScript objects. A circular reference occurs when an object contains a reference to itself, either directly or indirectly through other objects. Such references can cause issues when:

- Attempting to serialize objects with `JSON.stringify()`
- Managing memory and garbage collection
- Debugging complex object structures
- Creating infinite loops in object traversal

## Examples

Examples of **incorrect** code for this rule:

```ts
// Direct self-reference
const obj = {};
obj.self = obj;

// Indirect circular reference between two objects
const obj1 = {};
const obj2 = { ref: obj1 };
obj1.ref = obj2;

// Deeply nested circular reference
const obj = {
  level1: {
    level2: {}
  }
};
obj.level1.level2.circular = obj;
```

Examples of **correct** code for this rule:

```ts
// Simple object without circular references
const obj = { key: "value" };

// Object referencing another object without circular reference
const obj1 = { key: "value" };
const obj2 = { ref: obj1 };

// Nested objects without circular references
const obj1 = { key: "value" };
const obj2 = { nested: { ref: obj1 } };

// Object with toJSON method to handle serialization
const obj = {};
obj.toJSON = () => ({ key: "value" });
```

## When Not To Use It

You might want to disable this rule if:

- You have a specific use case that requires circular references
- You are implementing a custom serialization mechanism that handles circular references
- You are working with data structures that intentionally use circular references (e.g., doubly-linked lists, graph structures)

## Further Reading

- [MDN: Working with Objects](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects)
- [JSON.stringify() and Circular References](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#exceptions)
- [Memory Management and Garbage Collection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
