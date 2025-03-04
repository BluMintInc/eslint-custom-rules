import { ruleTesterTs } from '../utils/ruleTester';
import { noComplexCloudParams } from '../rules/no-complex-cloud-params';

ruleTesterTs.run('no-complex-cloud-params-property-access', noComplexCloudParams, {
  valid: [
    // Property access expressions that resolve to primitive values should be valid
    {
      code: `
        const remove = async () => {
          const { setGroupChannelGroup } = await import('src/firebaseCloud/messaging/setGroupChannelGroup');
          const groupFilter = [{ groupId: { $in: ['group-123'] } }];
          const permanenceToggled = true;

          return await setGroupChannelGroup({
            groupId: groupFilter[0].groupId.$in[0],
            permanence: permanenceToggled,
          });
        };
      `,
    },
    // Multiple levels of property access
    {
      code: `
        const remove = async () => {
          const { setGroupChannelGroup } = await import('src/firebaseCloud/messaging/setGroupChannelGroup');
          const data = {
            users: [{
              profile: {
                settings: {
                  theme: 'dark'
                }
              }
            }]
          };

          return await setGroupChannelGroup({
            groupId: 'group-123',
            theme: data.users[0].profile.settings.theme,
          });
        };
      `,
    },
    // Property access with computed properties
    {
      code: `
        const remove = async () => {
          const { setGroupChannelGroup } = await import('src/firebaseCloud/messaging/setGroupChannelGroup');
          const data = {
            groups: {
              'group-123': {
                id: 'group-123',
                name: 'Test Group'
              }
            }
          };
          const groupId = 'group-123';

          return await setGroupChannelGroup({
            groupId: data.groups[groupId].id,
            name: data.groups[groupId].name,
          });
        };
      `,
    },
  ],
  invalid: [
    // Property access that resolves to a complex object should still be invalid
    {
      code: `
        const remove = async () => {
          const { setGroupChannelGroup } = await import('src/firebaseCloud/messaging/setGroupChannelGroup');
          const data = {
            groups: {
              'group-123': {
                id: 'group-123',
                methods: {
                  validate() { return true; }
                }
              }
            }
          };
          const groupId = 'group-123';

          return await setGroupChannelGroup({
            groupId: data.groups[groupId].id,
            methods: data.groups[groupId].methods,
          });
        };
      `,
      errors: [{ messageId: 'noComplexObjects' }],
    },
  ],
});
