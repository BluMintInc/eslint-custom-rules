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
  ],
  invalid: [
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
  ],
});
