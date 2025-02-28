import { ruleTesterJsx } from '../utils/ruleTester';
import { reactUseMemoShouldBeComponent } from '../rules/react-usememo-should-be-component';

ruleTesterJsx.run(
  'react-usememo-should-be-component-bug',
  reactUseMemoShouldBeComponent,
  {
    valid: [
      // Test case for the specific bug: useMemo returning a number calculation
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ myFriends, friends }) => {
          const mutualFriendsCountEstimate = useMemo(() => {
            if (!myFriends || !friends) {
              return 0;
            }
            const mutualFriends = myFriends.filter((friendId) => {
              return friends.includes(friendId);
            });
            return mutualFriends.length;
          }, [friends, myFriends]);

          return <div>You have {mutualFriendsCountEstimate} mutual friends</div>;
        };
      `,
      },
      // Test case for useMemo returning a string
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ firstName, lastName }) => {
          const fullName = useMemo(() => {
            return firstName && lastName ? \`\${firstName} \${lastName}\` : '';
          }, [firstName, lastName]);

          return <div>Welcome, {fullName}</div>;
        };
      `,
      },
      // Test case for useMemo returning a boolean
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ permissions, requiredPermission }) => {
          const hasPermission = useMemo(() => {
            return permissions.includes(requiredPermission);
          }, [permissions, requiredPermission]);

          return <div>{hasPermission ? 'Access granted' : 'Access denied'}</div>;
        };
      `,
      },
      // Test case for useMemo returning null
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ data }) => {
          const processedValue = useMemo(() => {
            if (!data || data.length === 0) {
              return null;
            }
            return data.reduce((sum, item) => sum + item.value, 0);
          }, [data]);

          return <div>{processedValue !== null ? processedValue : 'No data'}</div>;
        };
      `,
      },
      // Test case for useMemo returning an array of non-JSX values
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const processedItems = useMemo(() => {
            return items.map(item => item.value * 2);
          }, [items]);

          return (
            <ul>
              {processedItems.map((value, index) => (
                <li key={index}>{value}</li>
              ))}
            </ul>
          );
        };
      `,
      },
      // Test case for useMemo returning a complex object with no JSX
      {
        code: `
        import React, { useMemo } from 'react';

        const Component = ({ user, settings }) => {
          const userSettings = useMemo(() => {
            return {
              id: user.id,
              name: user.name,
              preferences: {
                theme: settings.theme || 'light',
                fontSize: settings.fontSize || 'medium',
                notifications: settings.notifications !== undefined ? settings.notifications : true
              }
            };
          }, [user, settings]);

          return (
            <div>
              <h2>{userSettings.name}'s Settings</h2>
              <p>Theme: {userSettings.preferences.theme}</p>
              <p>Font Size: {userSettings.preferences.fontSize}</p>
            </div>
          );
        };
      `,
      },
    ],
    invalid: [],
  }
);
