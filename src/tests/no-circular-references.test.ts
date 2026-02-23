import { ruleTesterTs } from '../utils/ruleTester';
import { noCircularReferences } from '../rules/no-circular-references';

ruleTesterTs.run('no-circular-references', noCircularReferences, {
  valid: [
    // === BUG REGRESSION: undefined as property value (issue #1167) ===
    // The rule previously flagged `undefined` as a circular reference.
    `
    const AVATAR_PROPS = {
      size: undefined,
    } as const;
    `,
    // Multiple undefined properties
    `
    const DEFAULTS = {
      size: undefined,
      label: undefined,
      icon: undefined,
    } as const;
    `,
    // undefined mixed with other literals
    `
    const CONFIG = {
      size: undefined,
      count: 0,
      name: 'hello',
      enabled: true,
    } as const;
    `,
    // undefined in array (no circular reference possible)
    `
    const ARR = [undefined, undefined];
    `,

    // === OTHER PRIMITIVES: should all be allowed ===
    // null literal
    `
    const CONFIG = {
      value: null,
    };
    `,
    // numeric zero
    `
    const CONFIG = {
      count: 0,
    };
    `,
    // negative number
    `
    const CONFIG = {
      offset: -1,
    };
    `,
    // string literal
    `
    const CONFIG = {
      name: 'hello',
    };
    `,
    // empty string
    `
    const CONFIG = {
      name: '',
    };
    `,
    // boolean true
    `
    const CONFIG = {
      enabled: true,
    };
    `,
    // boolean false
    `
    const CONFIG = {
      enabled: false,
    };
    `,
    // Array of primitives
    `
    const ARR = [1, 'two', true, null, 0];
    `,
    // Array with undefined elements
    `
    const ARR = [undefined, null, 42];
    `,

    // === TS-WRAPPED PRIMITIVES: should all be allowed ===
    // undefined cast to a wider type
    `
    const PROPS = {
      size: undefined as unknown,
    };
    `,
    // null cast
    `
    const PROPS = {
      value: null as unknown,
    };
    `,
    // numeric literal cast
    `
    const PROPS = {
      count: 0 as number,
    };
    `,

    // === VALID NON-CIRCULAR STRUCTURES ===
    // Simple non-circular reference (one-way)
    `
    const a = { x: 1 };
    const b = { ref: a };
    `,
    // Two objects referencing each other's COPIES (not circular)
    `
    const config = { nested: { value: 1 } };
    `,
    // Nested objects with undefined properties (no circular reference)
    `
    const outer = {
      inner: {
        value: undefined,
      },
    };
    `,
    // Function property (not a circular reference)
    `
    const obj = {
      onClick: () => {},
    };
    `,
    // Arrow function referencing outer object by name (not a reference to the
    // object itself in the circular sense)
    `
    const obj = {
      name: 'test',
      getName() { return 'test'; },
    };
    `,
    // Object property assigned a primitive later
    `
    const obj = {};
    obj.size = undefined;
    `,
    // Assigning null to an object property
    `
    const obj = {};
    obj.value = null;
    `,
    // Assigning a literal to an object property
    `
    const obj = {};
    obj.count = 42;
    `,
    // Array assigned a primitive element
    `
    const arr = [];
    arr[0] = undefined;
    `,

    // === MEMBER EXPRESSION PROPERTY VALUES (valid, non-circular) ===
    // Property value is a MemberExpression resolving to an object (not circular)
    `
    const a = { nested: { value: 1 } };
    const b = { prop: a.nested };
    `,
    // Accessing a literal property via MemberExpression (propValue is a Literal)
    `
    const a = { value: 42 };
    const b = { count: a.value };
    `,
    // Accessing a function property via MemberExpression (propValue is a function)
    `
    const a = { fn: () => {} };
    const b = { handler: a.fn };
    `,
    // Computed property access with string key (non-circular)
    `
    const a = { 'foo': { x: 1 } };
    const b = { prop: a['foo'] };
    `,
    // MemberExpression where the source object is not tracked (undeclared)
    `
    const b = { ref: (window as any).document };
    `,
    // Property value is MemberExpression with identifier resolving to an object
    `
    const inner = {};
    const a = { nested: inner };
    const b = { prop: a.nested };
    `,
    // Computed non-literal key — key cannot be statically resolved, so safe
    `
    const key = 'foo';
    const a = { foo: {} };
    const b = { ref: a[key] };
    `,
    // Array with an object element (non-circular — object doesn't reference array)
    `
    const obj = {};
    const arr = [obj];
    `,
    // Self-referential via MemberExpression but no cycle actually formed
    `
    const a = { b: {} };
    const c = { d: a.b };
    `,
    // Accessing an array element by numeric index (non-circular)
    `
    const item = {};
    const arr = [item];
    const wrapper = { first: arr[0] };
    `,
  ],
  invalid: [
    // === DIRECT CIRCULAR REFERENCE ===
    // Object directly references itself via assignment
    {
      code: `
      const a = {};
      a.self = a;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // === INDIRECT CIRCULAR REFERENCE ===
    // Two objects forming a cycle
    {
      code: `
      const a = {};
      const b = {};
      a.b = b;
      b.a = a;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Object literal directly containing itself via another variable
    {
      code: `
      const inner = {};
      const outer = { child: inner };
      inner.parent = outer;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Three-node cycle
    {
      code: `
      const a = {};
      const b = {};
      const c = {};
      a.b = b;
      b.c = c;
      c.a = a;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // === CIRCULAR VIA MEMBER EXPRESSION ===
    // Circular reference detected through nested MemberExpression access
    {
      code: `
      const level1 = { a: {} };
      const level2 = { b: level1.a };
      const obj = { c: level2.b };
      level1.a.ref = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular via computed literal property access
    {
      code: `
      const obj = { 'foo': {} };
      obj['foo'].self = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular via object in array element (ArrayExpression > * visitor)
    {
      code: `
      const obj = {};
      const arr = [obj];
      obj.arr = arr;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular via array literal element accessed by numeric index (arr[0])
    {
      code: `
      const inner = {};
      const arr = [inner];
      const outer = { elem: arr[0] };
      inner.outer = outer;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
  ],
});
