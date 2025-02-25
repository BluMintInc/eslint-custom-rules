import { ruleTesterJsx } from '../utils/ruleTester';
import { reactUseMemoShouldBeComponent } from '../../src/rules/react-usememo-should-be-component';

ruleTesterJsx.run('react-usememo-should-be-component', reactUseMemoShouldBeComponent, {
  valid: [
    // useMemo with non-JSX return is valid
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const value = useMemo(() => {
            return 42;
          }, []);

          return <div>{value}</div>;
        };
      `,
    },
    // useMemo with object return is valid
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const styles = useMemo(() => ({
            color: 'red',
            fontSize: '16px'
          }), []);

          return <div style={styles}>Hello</div>;
        };
      `,
    },
    // useMemo with array of non-JSX is valid
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = () => {
          const items = useMemo(() => [1, 2, 3, 4, 5], []);

          return (
            <div>
              {items.map(item => <span key={item}>{item}</span>)}
            </div>
          );
        };
      `,
    },
    // Proper component with memo is valid
    {
      code: `
        import React, { memo } from 'react';

        const UserAvatar = memo(({ imgUrl, username }) => (
          <Link href={\`/\${username}\`}>
            <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
          </Link>
        ));

        const Component = ({ streamer }) => {
          return <UserAvatar imgUrl={streamer.imgUrl} username={streamer.username} />;
        };
      `,
    },
  ],
  invalid: [
    // useMemo returning JSX directly
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = ({ streamer }) => {
          const { imgUrl, username } = streamer;

          const userAvatar = useMemo(() => {
            return (
              <Link href={\`/\${username}\`}>
                <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
              </Link>
            );
          }, [imgUrl, username]);

          return <div>{userAvatar}</div>;
        };
      `,
      errors: [{ messageId: 'useMemoShouldBeComponent' }],
    },
    // useMemo with direct JSX return (no block)
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = ({ title }) => {
          const header = useMemo(() => (
            <Stack alignItems="flex-start">
              <Typography variant="h5">{title}</Typography>
            </Stack>
          ), [title]);

          return <div>{header}</div>;
        };
      `,
      errors: [{ messageId: 'useMemoShouldBeComponent' }],
    },
    // useMemo with conditional JSX
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = ({ isAdmin, user }) => {
          const userInfo = useMemo(() => {
            if (isAdmin) {
              return <AdminBadge user={user} />;
            }
            return <UserBadge user={user} />;
          }, [isAdmin, user]);

          return <div>{userInfo}</div>;
        };
      `,
      errors: [{ messageId: 'useMemoShouldBeComponent' }],
    },
    // useMemo with array.map returning JSX
    {
      code: `
        import React, { useMemo } from 'react';

        const Component = ({ items }) => {
          const renderedItems = useMemo(() =>
            items.map(item => <ListItem key={item.id}>{item.name}</ListItem>)
          , [items]);

          return <List>{renderedItems}</List>;
        };
      `,
      errors: [{ messageId: 'useMemoShouldBeComponent' }],
    },
    // Multiple useMemo with JSX in the same component
    {
      code: `
        import React, { useMemo } from 'react';

        const LivestreamInfo = ({ streamer, title, description }) => {
          const { imgUrl, username } = streamer;

          const userAvatar = useMemo(() => {
            return (
              <Link href={\`/\${username}\`}>
                <AvatarNextLive alt={username} height={56} src={imgUrl} width={56} />
              </Link>
            );
          }, [imgUrl, username]);

          const header = useMemo(() => {
            return (
              <Stack alignItems="flex-start">
                <Typography variant="h5">{title}</Typography>
              </Stack>
            );
          }, [title]);

          return (
            <Stack>
              {userAvatar}
              {header}
            </Stack>
          );
        };
      `,
      errors: [
        { messageId: 'useMemoShouldBeComponent' },
        { messageId: 'useMemoShouldBeComponent' },
      ],
    },
  ],
});
