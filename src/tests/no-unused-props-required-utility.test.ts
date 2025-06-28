import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-unused-props with Required utility type', noUnusedProps, {
  valid: [
    {
      // This test case reproduces the scenario from the bug report
      // where Required<ChannelGroupUser, 'username'> is used in MemberListItemProps
      code: `
        // Define the ChannelGroupUser type to simulate the imported type
        type ChannelGroupUser = {
          userId: string;
          image?: string;
          username?: string;
          isAdmin?: boolean;
        };

        // Define the Required utility type for testing
        type Required<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

        export type MemberListItemProps = Required<ChannelGroupUser, 'username'> & {
          onRemove: (userId: string) => void;
        };

        const MemberListItemUnmemoized = ({
          image,
          username,
          userId,
          onRemove,
          isAdmin = false,
        }: MemberListItemProps) => {
          return (
            <div>
              <img src={image} alt={username} />
              <span>{username}</span>
              {isAdmin && <span>Admin</span>}
              <button onClick={() => onRemove(userId)}>Remove</button>
            </div>
          );
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
  invalid: [],
});
