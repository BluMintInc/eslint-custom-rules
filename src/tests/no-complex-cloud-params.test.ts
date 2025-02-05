import { ruleTesterTs } from '../utils/ruleTester';
import { noComplexCloudParams } from '../rules/no-complex-cloud-params';

ruleTesterTs.run('no-complex-cloud-params', noComplexCloudParams, {
  valid: [
    // Simple object with primitive values
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { name: 'test-group', filterType: 'prefix-test' };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Already serialized object
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = JSON.stringify({ name: 'test-group', filterType: 'prefix-test' });
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Simple array of primitive values
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { names: ['group1', 'group2'], types: ['type1', 'type2'] };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Not a cloud function import
    {
      code: `
        const remove = async () => {
          const { someFunction } = await import('src/utils/helper');
          const groupFilter = { name: 'test', filter() { return true; } };
          await someFunction({ groupFilter });
        };
      `,
    },
    // Object with Date (valid since it's serializable to ISO string)
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { date: new Date() };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Object with primitive values
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { id: 123, name: "test", active: true, empty: null };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Object with nested arrays and objects
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            ids: [1, 2, 3],
            config: { enabled: true, tags: ["a", "b"] }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
    // Object with null prototype
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = Object.create(null);
          groupFilter.name = 'test';
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
    },
  ],
  invalid: [
    // Object with RegExp literal (invalid since it's not serializable)
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { pattern: /test-.*/ };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with BigInt literal (invalid since it's not serializable)
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { id: 123n };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with typed array (invalid since it's not serializable)
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = { data: new Int32Array([1, 2, 3]) };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with method
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test-group',
            filter() { return this.name.startsWith('test'); }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with arrow function
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test-group',
            validate: () => true
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Class instance
    {
      code: `
        class GroupFilter {
          constructor(name) {
            this.name = name;
          }
          filter() {
            return this.name.startsWith('test');
          }
        }
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = new GroupFilter('test-group');
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Nested complex object
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test-group',
            options: {
              isValid: () => true
            }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Array with complex objects
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilters = [{
            name: 'group1',
            validate: () => true
          }, {
            name: 'group2'
          }];
          await exitChannelGroupExternal({ groupFilters });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with getter/setter
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            _name: 'test',
            get name() { return this._name; },
            set name(value) { this._name = value; }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with Symbol property
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            [Symbol.iterator]: function* () { yield 'test'; }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with inherited methods
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const baseFilter = {
            validate() { return true; }
          };
          const groupFilter = Object.create(baseFilter);
          groupFilter.name = 'test';
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with bound function
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const validate = function() { return this.name === 'test'; };
          const groupFilter = {
            name: 'test',
            check: validate.bind({ name: 'test' })
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with async method
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            async validate() { return true; }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with generator function
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            *generate() { yield 'test'; }
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with Proxy
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const target = { name: 'test' };
          const handler = {
            get(target, prop) { return target[prop]; }
          };
          const groupFilter = new Proxy(target, handler);
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with WeakMap/WeakSet
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            cache: new WeakMap(),
            refs: new WeakSet()
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with Promise
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            promise: Promise.resolve('test')
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Object with Error instance
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            error: new Error('test error')
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
    // Array with function elements
    {
      code: `
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const groupFilter = {
            name: 'test',
            callbacks: [() => true, function() { return false; }]
          };
          await exitChannelGroupExternal({ groupFilter });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
  ],
});
