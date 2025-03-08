import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-unused-props with GroupInfoBasic spread', noUnusedProps, {
  valid: [
    {
      // This test case reproduces the scenario from the bug report
      // where GroupInfoBasic is spread into UserCardLayoutProps
      code: `
        import { ReactNode } from 'react';
        import { SxProps } from '@mui/material';

        // Define the GroupInfoBasic type to simulate the imported type
        type GroupInfoBasic = {
          id: string;
          imgUrl: string;
          username: string;
        };

        export type UserCardLayoutProps = GroupInfoBasic & {
          status?: string;
          sx?: SxProps;
          children?: ReactNode;
          avatarSize?: number;
        };

        const UserCardLayoutUnmemoized = ({
          children,
          username,
          imgUrl,
          id,
          status,
          sx,
          avatarSize = 56,
        }: UserCardLayoutProps) => {
          // Use the id and imgUrl props from GroupInfoBasic
          const avatarUsers = useMemo(() => {
            return [{ id, imgUrl }];
          }, [id, imgUrl]);

          return (
            <div>
              {/* Use the username prop from GroupInfoBasic */}
              <GradientTypography>{username}</GradientTypography>
              {children}
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
