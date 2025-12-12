import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { noComplexCloudParams } from '../rules/no-complex-cloud-params';

const message =
  'Cloud function "exitChannelGroupExternal" receives a value that is not JSON-serializable. Cloud params must stay plain data; class instances, functions, RegExp/BigInt/TypedArray values, or nested complex properties are dropped or cause runtime errors during transport to Firebase. Send only primitives and plain objects/arrays, or serialize the value first (for example, convert a RegExp to a string or JSON.stringify the payload) before calling "exitChannelGroupExternal".';
const error = { message } as unknown as TSESLint.TestCaseError<'noComplexObjects'>;

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
    // Object with constant identifiers (reproduces the bug)
    {
      code: `
        const PINNED_PERMANENCE = 'pinned';
        const setChannelGroupPermanence = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const id = 'channel-123';
          await exitChannelGroupExternal({
            channelGroupId: id,
            permanence: PINNED_PERMANENCE,
          });
        };
      `,
    },
    // Object with uppercase constant identifiers
    {
      code: `
        const MAX_RETRIES = 3;
        const DEFAULT_TIMEOUT = 5000;
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const config = {
            retries: MAX_RETRIES,
            timeout: DEFAULT_TIMEOUT,
            enabled: true
          };
          await exitChannelGroupExternal({ config });
        };
      `,
    },
    // Object with mixed case constants and variables
    {
      code: `
        const API_BASE_URL = 'https://api.example.com';
        const version = '1.0';
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const config = {
            baseUrl: API_BASE_URL,
            version: version,
            debug: false
          };
          await exitChannelGroupExternal({ config });
        };
      `,
    },
    // Object with enum-like constants
    {
      code: `
        const STATUS_ACTIVE = 'active';
        const STATUS_INACTIVE = 'inactive';
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const filter = {
            status: STATUS_ACTIVE,
            fallback: STATUS_INACTIVE
          };
          await exitChannelGroupExternal({ filter });
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
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
      errors: [error],
    },
    // PascalCase identifier that could be a class instance (should still be flagged)
    {
      code: `
        const MyClass = class {
          constructor() {
            this.value = 'test';
          }
        };
        const remove = async () => {
          const { exitChannelGroupExternal } = await import('src/firebaseCloud/messaging/exitChannelGroupExternal');
          const instance = new MyClass();
          await exitChannelGroupExternal({ instance });
        };
      `,
      errors: [error],
    },
  ],
});
