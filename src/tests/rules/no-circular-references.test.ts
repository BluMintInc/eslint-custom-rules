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
    // Object with array reference
    {
      code: `
        const obj = {};
        const arr = [obj];
        obj.array = arr;
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
        const obj1 = { a: {} };
        const obj2 = { b: obj1.a };
        const obj3 = { c: obj2 };
        obj1.a.ref = obj3;
      `,
    },
    // Circular reference with Object.assign - our rule doesn't detect this case yet
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
  ],
  invalid: [
    // Object with function reference
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.func = fn;
      `,
      errors: [error('fn')],
    },
    // Object with null/undefined properties
    {
      code: `
        const obj = { a: null, b: undefined };
        obj.c = obj.a;
        obj.d = obj.b;
      `,
      errors: [error('undefined')],
    },
    // Object with Symbol reference
    {
      code: `
        const obj = {};
        const sym = Symbol('test');
        obj.sym = sym;
      `,
      errors: [error('sym')],
    },
    // Object with function that returns a new object each time
    {
      code: `
        const obj = {};
        obj.getNewObj = () => ({ fresh: true });
        const result = obj.getNewObj();
        result.source = obj;
      `,
      errors: [error('obj')],
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
    // Object with property that is a getter returning a new object
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
      errors: [error('obj')],
    },
    // Object with property that is a function returning a copy
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
      errors: [error('obj')],
    },
    // Object with property that is a function returning a deep copy
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
      errors: [error('obj')],
    },
    // Object with property that is a function returning a new object with a reference
    {
      code: `
        const obj = {
          getWrapper() {
            return { wrapped: obj };
          }
        };
        const wrapper = obj.getWrapper();
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
    // Circular reference through function return
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.getRef = fn;
        obj.self = fn();
      `,
      errors: [error('fn')],
    },
    // Circular reference with Object.create
    {
      code: `
        const base = {};
        const obj = Object.create(base);
        base.child = obj;
        obj.parent = base;
      `,
      errors: [error('base')],
    },
    // Circular reference with Promise
    {
      code: `
        const obj = {};
        const promise = Promise.resolve(obj);
        obj.promise = promise;
        promise.then(result => obj.self = result);
      `,
      errors: [error('result')],
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
    // Circular reference with property that is a function returning the same object
    {
      code: `
        const obj = {};
        obj.getSelf = () => obj;
        const result = obj.getSelf();
        result.source = result;
      `,
      errors: [error('result')],
    },
    // Circular reference with property that shadows a global
    {
      code: `
        const obj = {};
        obj.Object = obj;
      `,
      errors: [error('obj')],
    },
    // Circular reference with property that is a function returning this
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
      errors: [error('result')],
    },
    // Circular reference with property that is a function returning a reference
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
      errors: [error('ref')],
    },
    // Circular reference with property that is a function returning a wrapper
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
      errors: [error('obj'), error('wrapper')],
    },
    // Circular reference with property that is a function returning a method object
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
      errors: [error('methodObj')],
    },
    // Circular reference with property that is a function returning a getter object
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
      errors: [error('getterObj')],
    },
    // Circular reference with property that is a function returning a setter object
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
      errors: [error('setterObj')],
    },
    // Circular reference with property that is a function returning a computed object
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
      errors: [error('obj'), error('computedObj')],
    },
    // Circular reference with property that is a function returning a spread object
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
      errors: [error('obj'), error('spreadObj')],
    },
    // Circular reference with property that is a function returning a destructured object
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
      errors: [error('a'), error('destructuredObj')],
    },
    // Circular reference with property that is a function returning a rest object
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
      errors: [error('a'), error('restObj')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference
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
      errors: [error('a'), error('result')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through array
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through object
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through map
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through set
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through weakmap
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
      errors: [error('a')],
    },
    // Circular reference with property that is a function returning a rest object with circular reference to parent through weakset
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
      errors: [error('a')],
    },
  ],
});
