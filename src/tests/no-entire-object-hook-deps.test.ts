import { ruleTesterJsx } from '../utils/ruleTester';
import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';

ruleTesterJsx.run('no-entire-object-hook-deps', noEntireObjectHookDeps, {
  valid: [
    // Using specific fields
    {
      code: `
        const MyComponent = ({ user }) => {
          const greetUser = useCallback(() => {
            console.log(user.name);
          }, [user.name]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
    },
    // Using multiple specific fields
    {
      code: `
        const MyComponent = ({ user }) => {
          const greetUser = useCallback(() => {
            console.log(user.name, user.age);
          }, [user.name, user.age]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
    },
    // Using nested fields
    {
      code: `
        const MyComponent = ({ user }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user.address.city]);
          return <button onClick={showAddress}>Show Address</button>;
        };
      `,
    },
    // Using computed properties (should be valid as we can't analyze)
    {
      code: `
        const MyComponent = ({ user, key }) => {
          const getValue = useCallback(() => {
            console.log(user[key]);
          }, [user]);
          return <button onClick={getValue}>Get Value</button>;
        };
      `,
    },
    // Using object for debugging/logging only
    {
      code: `
        const MyComponent = ({ user }) => {
          useEffect(() => {
            console.log('Debug user:', user);
          }, [user]);
          return null;
        };
      `,
    },
    // Using array dependencies should be valid
    {
      code: `
        const MyComponent = ({ options }) => {
          const selectOptions = useMemo(() => {
            if (!Array.isArray(options)) {
              return null;
            }
            return options.map((option) => {
              return (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              );
            });
          }, [options]);
          return <div>{selectOptions}</div>;
        };
      `,
    },
    // Using array methods should be valid
    {
      code: `
        const MyComponent = ({ hits }) => {
          const convertedHits = useMemo(() => {
            const converter = ConverterFactory.buildDateConverter();
            return hits.map((hit) => {
              return converter.convertData(hit);
            });
          }, [hits]);
          return <div>{convertedHits}</div>;
        };
      `,
    },
    // Using multiple array methods should be valid
    {
      code: `
        const MyComponent = ({ items }) => {
          const filteredAndMapped = useMemo(() => {
            return items
              .filter(item => item.active)
              .map(item => item.name)
              .join(', ');
          }, [items]);
          return <div>{filteredAndMapped}</div>;
        };
      `,
    },
    // Using string path with split() should be valid
    {
      code: `
        const MyComponent = () => {
          const [eventDocPath] = useRouterState({ key: 'event' });
          const publish = useCallback(async () => {
            if (!eventDocPath) {
              return;
            }
            const pathSegments = eventDocPath.split('/');
            const tournamentId = pathSegments[pathSegments.length - 1];
            const gameId = pathSegments[pathSegments.length - 3];
            await publishTournament({
              tournamentId,
              gameId,
            });
          }, [eventDocPath]);
          return <button onClick={publish}>Publish</button>;
        };
      `,
    },
    // Using object spread with property access should be valid
    {
      code: `
        const MyComponent = ({ style }) => {
          const imageStyle = useMemo(() => {
            return {
              objectFit: 'contain',
              borderRadius: style?.borderRadius || 'inherit',
              ...style,
            } as const;
          }, [style]);
          return <div style={imageStyle} />;
        };
      `,
    },
    // Using object as a direct function argument should be valid
    {
      code: `
        const MyComponent = ({ userInternal }) => {
          const user = useMemo(() => {
            return onlyIdentified(userInternal);
          }, [userInternal]);
          return <div>{user.name}</div>;
        };
      `,
    },
    // Using object as a direct function argument with multiple functions should be valid
    {
      code: `
        const MyComponent = ({ userInternal }) => {
          const user = useMemo(() => {
            validateUser(userInternal);
            return onlyIdentified(userInternal);
          }, [userInternal]);
          return <div>{user.name}</div>;
        };
      `,
    },
    // Using object spread in JSX should be valid
    {
      code: `
        const SelectableEventsCalendar = (props) => {
          useEffect(() => {
            return <AlgoliaEventsCalendar {...props} />;
          }, [props]);
          return null;
        };
      `,
    },
    // Using object spread in JSX with other props should be valid
    {
      code: `
        const SelectableEventsCalendar = (props) => {
          useEffect(() => {
            return <AlgoliaEventsCalendar {...props} extraProp="value" />;
          }, [props]);
          return null;
        };
      `,
    },
  ],
  invalid: [
    // Optional chaining case
    {
      code: `
        const MyComponent = ({ userFull }: { userFull: { uid?: string } }) => {
          const uidFull = useMemo(() => {
            return userFull?.uid;
          }, [userFull]);
          return <div>{uidFull}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userFull',
            fields: 'userFull?.uid',
          },
        },
      ],
      output: `
        const MyComponent = ({ userFull }: { userFull: { uid?: string } }) => {
          const uidFull = useMemo(() => {
            return userFull?.uid;
          }, [userFull?.uid]);
          return <div>{uidFull}</div>;
        };
      `,
    },
    // Basic case - using entire object when only name is needed
    {
      code: `
        const MyComponent = ({ user }: { user: { name: string } }) => {
          const greetUser = useCallback(() => {
            console.log(user.name);
          }, [user]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'user',
            fields: 'user.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ user }: { user: { name: string } }) => {
          const greetUser = useCallback(() => {
            console.log(user.name);
          }, [user.name]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
    },
    // Multiple field access
    {
      code: `
        const MyComponent = ({ user }: { user: { name: string; age: number } }) => {
          const greetUser = useCallback(() => {
            console.log(user.name);
            console.log(user.age);
          }, [user]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'user',
            fields: 'user.name, user.age',
          },
        },
      ],
      output: `
        const MyComponent = ({ user }: { user: { name: string; age: number } }) => {
          const greetUser = useCallback(() => {
            console.log(user.name);
            console.log(user.age);
          }, [user.name, user.age]);
          return <button onClick={greetUser}>Greet</button>;
        };
      `,
    },
    // Nested field access
    {
      code: `
        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user]);
          return <button onClick={showAddress}>Show Address</button>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'user',
            fields: 'user.address.city',
          },
        },
      ],
      output: `
        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user.address.city]);
          return <button onClick={showAddress}>Show Address</button>;
        };
      `,
    },
    {
      // Test case for the bug report example
      code: `
        import { useTheme } from '@mui/material/styles';

        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const theme: { palette: { background: { elevation: string[] } } } = useTheme();

          const backgroundColor = useMemo(() => {
            if (type === 'deleted') {
              return theme.palette.background.elevation[4];
            }
            if (isMine) {
              return theme.palette.primary.dark;
            }
            return theme.palette.background.elevation[10];
          }, [isMine, theme, type]);
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'theme',
            fields:
              'theme.palette.background.elevation[4], theme.palette.primary.dark, theme.palette.background.elevation[10]',
          },
        },
      ],
      output: `
        import { useTheme } from '@mui/material/styles';

        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const theme: { palette: { background: { elevation: string[] } } } = useTheme();

          const backgroundColor = useMemo(() => {
            if (type === 'deleted') {
              return theme.palette.background.elevation[4];
            }
            if (isMine) {
              return theme.palette.primary.dark;
            }
            return theme.palette.background.elevation[10];
          }, [isMine, theme.palette.background.elevation[4], theme.palette.primary.dark, theme.palette.background.elevation[10], type]);
        };
      `,
    },
  ],
});
