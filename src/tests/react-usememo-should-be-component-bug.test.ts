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
    ],
    invalid: [],
  }
);
