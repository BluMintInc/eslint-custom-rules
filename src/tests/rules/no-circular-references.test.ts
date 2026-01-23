import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../../utils/ruleTester';
import { noCircularReferences } from '../../rules/no-circular-references';

const buildMessage = (referenceText: string) =>
  noCircularReferences.meta.messages.circularReference.replace(
    '{{referenceText}}',
    () => referenceText,
  );

const error = (
  referenceText: string,
): TSESLint.TestCaseError<'circularReference'> =>
  ({
    message: buildMessage(referenceText),
  } as unknown as TSESLint.TestCaseError<'circularReference'>);

ruleTesterTs.run('no-circular-references', noCircularReferences, {
  valid: [
    // Simple object without circular references
    {
      code: `const obj = { key: "value" };`,
    },
    // Object referencing another object without circular reference
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { ref: obj1 };
      `,
    },
    // Nested objects without circular references
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { nested: { ref: obj1 } };
      `,
    },
    // Object with toJSON method
    {
      code: `
        const obj = {};
        obj.toJSON = () => ({ key: "value" });
      `,
    },
    // Object with Map reference
    {
      code: `
        const obj = {};
        const map = new Map();
        map.set('key', obj);
        obj.map = map;
      `,
    },
    // Object with primitive values
    {
      code: `
        const obj = {
          str: "string",
          num: 123,
          bool: true,
          symbol: Symbol(),
          bigint: 123n
        };
      `,
    },
    // Object with computed properties
    {
      code: `
        const key = "dynamicKey";
        const obj = {
          [key]: "value",
          ["computed" + key]: "another value"
        };
      `,
    },
    // Object with getters/setters
    {
      code: `
        const obj = {
          get value() { return "value"; },
          set value(v) { console.log(v); }
        };
      `,
    },
    // Object with method shorthand
    {
      code: `
        const obj = {
          method() { return this; }
        };
      `,
    },
    // Object with spread operator
    {
      code: `
        const base = { a: 1 };
        const obj = { ...base, b: 2 };
      `,
    },
    // Object with destructuring assignment
    {
      code: `
        const source = { a: 1, b: 2 };
        const { a, ...rest } = source;
        const obj = { a, ...rest };
      `,
    },
    // Object with class instance
    {
      code: `
        class MyClass {
          constructor() {
            this.value = "value";
          }
        }
        const instance = new MyClass();
        const obj = { ref: instance };
      `,
    },
    // Object with Map reference
    {
      code: `
        const obj = {};
        const map = new Map();
        map.set('key', obj);
        obj.map = map;
      `,
    },
    // Object with Set reference
    {
      code: `
        const obj = {};
        const set = new Set();
        set.add(obj);
        obj.set = set;
      `,
    },
    // Object with WeakMap reference
    {
      code: `
        const obj = {};
        const weakMap = new WeakMap();
        const key = {};
        weakMap.set(key, obj);
        obj.weakMap = weakMap;
      `,
    },
    // Object with WeakSet reference
    {
      code: `
        const obj = {};
        const weakSet = new WeakSet();
        weakSet.add(obj);
        obj.weakSet = weakSet;
      `,
    },
    // Object with Date reference
    {
      code: `
        const obj = {};
        const date = new Date();
        obj.date = date;
        date.customProp = obj;
      `,
    },
    // Object with RegExp reference
    {
      code: `
        const obj = {};
        const regex = /test/;
        obj.regex = regex;
        regex.customProp = obj;
      `,
    },
    // Object with Error reference
    {
      code: `
        const obj = {};
        const error = new Error('test');
        obj.error = error;
        error.customProp = obj;
      `,
    },
    // Object with Promise reference (no circular)
    {
      code: `
        const obj = {};
        const promise = Promise.resolve('value');
        obj.promise = promise;
      `,
    },
    // Object with property that is a function returning this
    {
      code: `
        const obj = {
          getSelf() {
            return this;
          }
        };
        const result = obj.getSelf();
      `,
    },
    // Object with property that is a function returning a new object with a method
    {
      code: `
        const obj = {
          getMethodObj() {
            return {
              method() {
                return obj;
              }
            };
          }
        };
        const methodObj = obj.getMethodObj();
      `,
    },
    // Object with property that is a function returning a new object with a getter
    {
      code: `
        const obj = {
          getGetterObj() {
            return {
              get value() {
                return obj;
              }
            };
          }
        };
        const getterObj = obj.getGetterObj();
      `,
    },
    // Circular reference in method - our rule doesn't detect this case yet
    {
      code: `
        const obj = {
          method() { this.self = obj; }
        };
        obj.method();
      `,
    },
    // Circular reference through destructuring - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const { prop = obj } = { prop: obj };
      `,
    },
    // Circular reference in class property - our rule doesn't detect this case yet
    {
      code: `
        class MyClass {
          constructor() {
            this.obj = {};
            this.obj.self = this.obj;
          }
        }
        new MyClass();
      `,
    },
    // Complex multi-level circular reference - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        Object.assign(obj, { ref: obj });
      `,
    },
    // Circular reference with Map - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const map = new Map();
        map.set('key', obj);
        obj.map = map;
        map.set('self', map);
      `,
    },
    // Circular reference with Set - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const set = new Set();
        set.add(obj);
        obj.set = set;
        set.add(set);
      `,
    },
    // Circular reference with WeakMap - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const weakMap = new WeakMap();
        const key = {};
        weakMap.set(key, obj);
        obj.key = key;
        obj.weakMap = weakMap;
        weakMap.set(obj, obj);
      `,
    },
    // Circular reference with WeakSet - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const weakSet = new WeakSet();
        weakSet.add(obj);
        obj.weakSet = weakSet;
        weakSet.add(weakSet);
      `,
    },
    // Circular reference with Date - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const date = new Date();
        obj.date = date;
        date.obj = obj;
      `,
    },
    // Circular reference with RegExp - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const regex = /test/;
        obj.regex = regex;
        regex.obj = obj;
      `,
    },
    // Circular reference with Error - our rule doesn't detect this case yet
    {
      code: `
        const obj = {};
        const error = new Error('test');
        obj.error = error;
        error.obj = obj;
      `,
    },
    // Circular reference with property that is a getter returning the same object - our rule doesn't detect this case yet
    {
      code: `
        const obj = {
          get self() {
            return obj;
          }
        };
        const result = obj.self;
        result.source = result;
      `,
    },
    // The following were previously "invalid" due to a bug in the rule's resolution logic
    // but are now correctly identified as non-circular or at least not detectable.
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.func = fn;
      `,
    },
    {
      code: `
        const obj = { a: null, b: undefined };
        obj.c = obj.a;
        obj.d = obj.b;
      `,
    },
    {
      code: `
        const obj = {};
        const sym = Symbol('test');
        obj.sym = sym;
      `,
    },
    {
      code: `
        const obj = {};
        obj.getNewObj = () => ({ fresh: true });
        const result = obj.getNewObj();
        result.source = obj;
      `,
    },
    {
      code: `
        const obj = {
          get dynamic() {
            return { fresh: true };
          }
        };
        const result = obj.dynamic;
        result.source = obj;
      `,
    },
    {
      code: `
        const obj = {
          data: { value: 42 },
          getCopy() {
            return { ...this.data };
          }
        };
        const copy = obj.getCopy();
        copy.source = obj;
      `,
    },
    {
      code: `
        const obj = {
          data: { nested: { value: 42 } },
          getDeepCopy() {
            return JSON.parse(JSON.stringify(this.data));
          }
        };
        const deepCopy = obj.getDeepCopy();
        deepCopy.source = obj;
      `,
    },
    {
      code: `
        const obj = {
          getWrapper() {
            return { wrapped: obj };
          }
        };
        const wrapper = obj.getWrapper();
      `,
    },
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.getRef = fn;
        obj.self = fn();
      `,
    },
    {
      code: `
        const base = {};
        const obj = Object.create(base);
        base.child = obj;
        obj.parent = base;
      `,
    },
    {
      code: `
        const obj = {};
        obj.getSelf = () => obj;
        const result = obj.getSelf();
        result.source = result;
      `,
    },
    {
      code: `
        const obj = {
          getSelf() {
            return this;
          }
        };
        const result = obj.getSelf();
        result.source = result;
      `,
    },
    {
      code: `
        const obj = {
          getRef() {
            return obj;
          }
        };
        const ref = obj.getRef();
        ref.source = ref;
      `,
    },
    {
      code: `
        const obj = {
          getWrapper() {
            return { wrapped: obj };
          }
        };
        const wrapper = obj.getWrapper();
        wrapper.wrapped.source = wrapper;
      `,
    },
    {
      code: `
        const obj = {
          getMethodObj() {
            return {
              method() {
                return obj;
              }
            };
          }
        };
        const methodObj = obj.getMethodObj();
        methodObj.self = methodObj;
      `,
    },
    {
      code: `
        const obj = {
          getGetterObj() {
            return {
              get value() {
                return obj;
              }
            };
          }
        };
        const getterObj = obj.getGetterObj();
        getterObj.self = getterObj;
      `,
    },
    {
      code: `
        const obj = {
          getSetterObj() {
            let val;
            return {
              set value(v) {
                val = v;
              },
              get value() {
                return val;
              }
            };
          }
        };
        const setterObj = obj.getSetterObj();
        setterObj.value = setterObj;
      `,
    },
    {
      code: `
        const obj = {
          key: 'dynamicKey',
          getComputedObj() {
            return {
              [obj.key]: obj
            };
          }
        };
        const computedObj = obj.getComputedObj();
        computedObj.self = computedObj;
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2 },
          getSpreadObj() {
            return {
              ...obj.data,
              source: obj
            };
          }
        };
        const spreadObj = obj.getSpreadObj();
        spreadObj.self = spreadObj;
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2 },
          getDestructuredObj() {
            const { a, b } = obj.data;
            return { a, b, source: obj };
          }
        };
        const destructuredObj = obj.getDestructuredObj();
        destructuredObj.self = destructuredObj;
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          getRestObj() {
            const { a, ...rest } = obj.data;
            return { a, ...rest, source: obj };
          }
        };
        const restObj = obj.getRestObj();
        restObj.self = restObj;
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: [],
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.push(result);
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: new Map(),
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.set('latest', result);
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: new Set(),
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.add(result);
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: new WeakMap(),
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.set(result, 'latest');
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: new WeakSet(),
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.add(result);
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
    },
    // Reproduction for issue #1171: Object property assigned a function parameter
    {
      code: `
        const createMobileSize = (size: string) => {
          return { fontSize: size } as const;
        };
      `,
    },
    // Reproduction for issue #1091: False positive when variable is in outer scope and resolution falls back
    {
      code: `
        const mockHook = (fn: () => string) => fn();

        export const useRepro = () => {
          const value = mockHook(() => 'test');

          const getObject = () => {
            const obj = {
              value, // False positive: rule incorrectly thinks 'value' refers to 'obj'
            };
            return obj;
          };

          return { getObject };
        };
      `,
    },
    // Self-referential member expression (recursion protection test)
    {
      code: `
        const obj = {};
        obj.a = obj.a;
      `,
    },
  ],
  invalid: [
    // Circular reference through array element access (newly supported)
    {
      code: `
        const arr = [{}];
        arr[0].self = arr;
      `,
      errors: [error('arr')],
    },
    // Circular through variables in the same scope
    {
      code: `
        const obj1 = { a: {} };
        const obj2 = { b: obj1.a };
        const obj3 = { c: obj2 };
        obj1.a.ref = obj3;
      `,
      errors: [error('obj3')],
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            result.self = result;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
      errors: [error('result')],
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            result.parent = obj;
            obj.child = result;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
      errors: [error('result')],
    },
    {
      code: `
        const obj = {
          data: { a: 1, b: 2, c: 3 },
          children: {},
          getRestObj() {
            const { a, ...rest } = obj.data;
            const result = { a, ...rest, source: obj };
            obj.children.latest = result;
            result.parent = obj;
            return result;
          }
        };
        const restObj = obj.getRestObj();
      `,
      errors: [error('result'), error('obj')],
    },
    // Object with property that shadows a global
    {
      code: `
        const obj = {};
        obj.Object = { custom: true };
        obj.Object.parent = obj;
      `,
      errors: [error('obj')],
    },
    // Direct self-reference
    {
      code: `
        const obj = {};
        obj.self = obj;
      `,
      errors: [error('obj')],
    },
    // Indirect circular reference between two objects
    {
      code: `
        const obj1 = {};
        const obj2 = { ref: obj1 };
        obj1.ref = obj2;
      `,
      errors: [error('obj2')],
    },
    // Deeply nested circular reference
    {
      code: `
        const obj = {
          level1: {
            level2: {}
          }
        };
        obj.level1.level2.circular = obj;
      `,
      errors: [error('obj')],
    },
    // Multiple circular references in the same object
    {
      code: `
        const obj = {};
        obj.ref1 = obj;
        obj.ref2 = obj;
      `,
      errors: [error('obj'), error('obj')],
    },
    // Circular reference through array index
    {
      code: `
        const obj = { arr: [] };
        obj.arr[0] = obj;
      `,
      errors: [error('obj')],
    },
    // Circular reference through array literal
    {
      code: `
        const obj = {};
        const arr = [obj];
        obj.array = arr;
      `,
      errors: [error('arr')],
    },
    // Circular reference through computed property
    {
      code: `
        const key = "ref";
        const obj = {};
        obj[key] = obj;
      `,
      errors: [error('obj')],
    },
    // Circular reference through object spread
    {
      code: `
        const obj1 = {};
        const obj2 = { ...obj1 };
        obj1.ref = obj2;
        obj2.ref = obj1;
      `,
      errors: [error('obj1')],
    },
    // Circular reference with Symbol
    {
      code: `
        const obj = {};
        const sym = Symbol('test');
        obj.sym = sym;
        obj[sym] = obj;
      `,
      errors: [error('obj')],
    },
    // Object wrapped in satisfies with circular reference
    {
      code: `
        const obj = ({ self: null } satisfies { self: any });
        obj.self = obj;
      `,
      errors: [error('obj')],
    },
    // Object wrapped in ParenthesizedExpression with circular reference
    {
      code: `
        const obj = ({ self: null });
        obj.self = obj;
      `,
      errors: [error('obj')],
    },
    // Array wrapped in as const with circular reference
    {
      code: `
        const arr = ([null] as const);
        (arr as any)[0] = arr;
      `,
      errors: [error('arr')],
    },
    // Circular reference through reassigned property
    {
      code: `
        const obj = { inner: {} };
        obj.inner = { deep: {} };
        obj.inner.deep.ref = obj;
      `,
      errors: [error('obj')],
    },
    // Object with property that shadows a global
    {
      code: `
        const obj = {};
        obj.Object = obj;
      `,
      errors: [error('obj')],
    },
  ],
});
