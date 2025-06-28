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
    // Edge case: Optional chaining with nullish coalescing
    {
      code: `
        const MyComponent = ({ userData }) => {
          const userId = useMemo(() => {
            return userData?.id ?? 'default';
          }, [userData?.id]);
          return <div>{userId}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in template literals
    {
      code: `
        const MyComponent = ({ userData }) => {
          const greeting = useMemo(() => {
            return \`Hello, \${userData?.name}!\`;
          }, [userData?.name]);
          return <div>{greeting}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in JSX
    {
      code: `
        const MyComponent = ({ userData }) => {
          const content = useMemo(() => {
            return <div>{userData?.name}</div>;
          }, [userData?.name]);
          return content;
        };
      `,
    },
    // Edge case: Optional chaining with method calls
    {
      code: `
        const MyComponent = ({ userData }) => {
          const name = useMemo(() => {
            return userData?.getName?.();
          }, [userData?.getName]);
          return <div>{name}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with array access
    {
      code: `
        const MyComponent = ({ userData }) => {
          const firstItem = useMemo(() => {
            return userData?.items?.[0];
          }, [userData?.items]);
          return <div>{firstItem}</div>;
        };
      `,
    },
    // Edge case: Deeply nested optional chaining
    {
      code: `
        const MyComponent = ({ userData }) => {
          const city = useMemo(() => {
            return userData?.profile?.address?.city;
          }, [userData?.profile?.address?.city]);
          return <div>{city}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in function parameters
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            return someFunction(userData?.id);
          }, [userData?.id]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in object literals
    {
      code: `
        const MyComponent = ({ userData }) => {
          const userInfo = useMemo(() => {
            return { userId: userData?.id, userName: userData?.name };
          }, [userData?.id, userData?.name]);
          return <div>{userInfo.userId}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in array literals
    {
      code: `
        const MyComponent = ({ userData }) => {
          const userArray = useMemo(() => {
            return [userData?.id, userData?.name];
          }, [userData?.id, userData?.name]);
          return <div>{userArray[0]}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in conditional expressions
    {
      code: `
        const MyComponent = ({ userData }) => {
          const displayName = useMemo(() => {
            return userData?.name ? userData?.name : 'Anonymous';
          }, [userData?.name]);
          return <div>{displayName}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in logical expressions
    {
      code: `
        const MyComponent = ({ userData }) => {
          const isValid = useMemo(() => {
            return userData?.id && userData?.name;
          }, [userData?.id, userData?.name]);
          return <div>{isValid ? 'Valid' : 'Invalid'}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with computed properties
    {
      code: `
        const MyComponent = ({ userData, key }) => {
          const value = useMemo(() => {
            return userData?.[key];
          }, [userData, key]);
          return <div>{value}</div>;
        };
      `,
    },
    // Edge case: Object used in destructuring assignment
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            const { id, name } = userData || {};
            return \`\${id}: \${name}\`;
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Object used in spread operator in object literal
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            return { ...userData, extra: 'value' };
          }, [userData]);
          return <div>{result.id}</div>;
        };
      `,
    },
    // Edge case: Object used in spread operator in array literal
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            return [...userData.items, 'extra'];
          }, [userData.items]);
          return <div>{result[0]}</div>;
        };
      `,
    },
    // Edge case: Object used in for...in loop
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            const keys = [];
            for (const key in userData) {
              keys.push(key);
            }
            return keys;
          }, [userData]);
          return <div>{result.join(', ')}</div>;
        };
      `,
    },
    // Edge case: Object used with Object.keys()
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            return Object.keys(userData);
          }, [userData]);
          return <div>{result.join(', ')}</div>;
        };
      `,
    },
    // Edge case: Object used with JSON.stringify()
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useMemo(() => {
            return JSON.stringify(userData);
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Object passed to custom hook
    {
      code: `
        const MyComponent = ({ userData }) => {
          const result = useCustomHook(userData);
          return <div>{result}</div>;
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
    // Bug report test case - userData with optional chaining
    {
      code: `
        import { useEffect, useState } from 'react';
        import { useAuth } from '../../contexts/AuthContext';
        import { CallerStatus } from '../../../functions/src/types/realtimeDb/Room/Caller';

        export type UseCallerStatusProps = {
          roomPath?: string;
          userId?: string;
        };

        export const useCallerStatus = ({
          roomPath,
          userId,
        }: UseCallerStatusProps = {}) => {
          const { userData } = useAuth();
          const [status, setStatus] = useState<CallerStatus | null>(null);

          useEffect(() => {
            let unsubscribe: (() => void) | undefined;

            const subscribeToCallerStatus = async () => {
              const id = userId || userData?.id;

              if (!roomPath || !id) {
                return;
              }
              const { onValue, child, ref } = await import('firebase/database');
              const { database } = await import(
                '../../config/firebase-client/database'
              );

              const roomRef = ref(database, roomPath);
              const callerRef = child(roomRef, \`callers/\${id}\`);

              unsubscribe = onValue(callerRef, (snapshot) => {
                const caller = snapshot.val() || {};
                setStatus(caller.status);
              });
            };

            subscribeToCallerStatus();

            return () => {
              unsubscribe?.();
            };
          }, [userData, roomPath, userId]);

          return { status } as const;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        import { useEffect, useState } from 'react';
        import { useAuth } from '../../contexts/AuthContext';
        import { CallerStatus } from '../../../functions/src/types/realtimeDb/Room/Caller';

        export type UseCallerStatusProps = {
          roomPath?: string;
          userId?: string;
        };

        export const useCallerStatus = ({
          roomPath,
          userId,
        }: UseCallerStatusProps = {}) => {
          const { userData } = useAuth();
          const [status, setStatus] = useState<CallerStatus | null>(null);

          useEffect(() => {
            let unsubscribe: (() => void) | undefined;

            const subscribeToCallerStatus = async () => {
              const id = userId || userData?.id;

              if (!roomPath || !id) {
                return;
              }
              const { onValue, child, ref } = await import('firebase/database');
              const { database } = await import(
                '../../config/firebase-client/database'
              );

              const roomRef = ref(database, roomPath);
              const callerRef = child(roomRef, \`callers/\${id}\`);

              unsubscribe = onValue(callerRef, (snapshot) => {
                const caller = snapshot.val() || {};
                setStatus(caller.status);
              });
            };

            subscribeToCallerStatus();

            return () => {
              unsubscribe?.();
            };
          }, [userData?.id, roomPath, userId]);

          return { status } as const;
        };
      `,
    },
    // Edge case: Multiple optional chaining patterns
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userInfo = useMemo(() => {
            return \`\${userData?.id}: \${userData?.name}\`;
          }, [userData]);
          return <div>{userInfo}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id, userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userInfo = useMemo(() => {
            return \`\${userData?.id}: \${userData?.name}\`;
          }, [userData?.id, userData?.name]);
          return <div>{userInfo}</div>;
        };
      `,
    },
    // Edge case: Nested optional chaining
    {
      code: `
        const MyComponent = ({ userData }: { userData: { profile?: { address?: { city?: string } } } }) => {
          const city = useMemo(() => {
            return userData?.profile?.address?.city;
          }, [userData]);
          return <div>{city}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.profile.address.city, userData?.profile',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { profile?: { address?: { city?: string } } } }) => {
          const city = useMemo(() => {
            return userData?.profile?.address?.city;
          }, [userData?.profile.address.city, userData?.profile]);
          return <div>{city}</div>;
        };
      `,
    },
    // Edge case: Mixed access patterns (both optional and non-optional)
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id: string; name?: string } }) => {
          const userInfo = useCallback(() => {
            console.log(userData.id, userData?.name);
          }, [userData]);
          return <button onClick={userInfo}>Show Info</button>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.name, userData.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id: string; name?: string } }) => {
          const userInfo = useCallback(() => {
            console.log(userData.id, userData?.name);
          }, [userData?.name, userData.id]);
          return <button onClick={userInfo}>Show Info</button>;
        };
      `,
    },
    // Edge case: Optional chaining with nullish coalescing
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const userId = useMemo(() => {
            return userData?.id ?? 'default';
          }, [userData]);
          return <div>{userId}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const userId = useMemo(() => {
            return userData?.id ?? 'default';
          }, [userData?.id]);
          return <div>{userId}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in template literals
    {
      code: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const greeting = useMemo(() => {
            return \`Hello, \${userData?.name}!\`;
          }, [userData]);
          return <div>{greeting}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const greeting = useMemo(() => {
            return \`Hello, \${userData?.name}!\`;
          }, [userData?.name]);
          return <div>{greeting}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in JSX
    {
      code: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const content = useMemo(() => {
            return <div>{userData?.name}</div>;
          }, [userData]);
          return content;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const content = useMemo(() => {
            return <div>{userData?.name}</div>;
          }, [userData?.name]);
          return content;
        };
      `,
    },
    // Edge case: Optional chaining with method calls
    {
      code: `
        const MyComponent = ({ userData }: { userData: { getName?: () => string } }) => {
          const name = useMemo(() => {
            return userData?.getName?.();
          }, [userData]);
          return <div>{name}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.getName',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { getName?: () => string } }) => {
          const name = useMemo(() => {
            return userData?.getName?.();
          }, [userData?.getName]);
          return <div>{name}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with array access
    {
      code: `
        const MyComponent = ({ userData }: { userData: { items?: string[] } }) => {
          const firstItem = useMemo(() => {
            return userData?.items?.[0];
          }, [userData]);
          return <div>{firstItem}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.items[0], userData?.items',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { items?: string[] } }) => {
          const firstItem = useMemo(() => {
            return userData?.items?.[0];
          }, [userData?.items[0], userData?.items]);
          return <div>{firstItem}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in function parameters
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            return someFunction(userData?.id);
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            return someFunction(userData?.id);
          }, [userData?.id]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in object literals
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userInfo = useMemo(() => {
            return { userId: userData?.id, userName: userData?.name };
          }, [userData]);
          return <div>{userInfo.userId}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id, userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userInfo = useMemo(() => {
            return { userId: userData?.id, userName: userData?.name };
          }, [userData?.id, userData?.name]);
          return <div>{userInfo.userId}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in array literals
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userArray = useMemo(() => {
            return [userData?.id, userData?.name];
          }, [userData]);
          return <div>{userArray[0]}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id, userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const userArray = useMemo(() => {
            return [userData?.id, userData?.name];
          }, [userData?.id, userData?.name]);
          return <div>{userArray[0]}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in conditional expressions
    {
      code: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const displayName = useMemo(() => {
            return userData?.name ? userData?.name : 'Anonymous';
          }, [userData]);
          return <div>{displayName}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { name?: string } }) => {
          const displayName = useMemo(() => {
            return userData?.name ? userData?.name : 'Anonymous';
          }, [userData?.name]);
          return <div>{displayName}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in logical expressions
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const isValid = useMemo(() => {
            return userData?.id && userData?.name;
          }, [userData]);
          return <div>{isValid ? 'Valid' : 'Invalid'}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id, userData?.name',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string; name?: string } }) => {
          const isValid = useMemo(() => {
            return userData?.id && userData?.name;
          }, [userData?.id, userData?.name]);
          return <div>{isValid ? 'Valid' : 'Invalid'}</div>;
        };
      `,
    },
    // Edge case: Multiple objects with optional chaining
    {
      code: `
        const MyComponent = ({ userData, userSettings }: { userData: { id?: string }; userSettings: { theme?: string } }) => {
          const userInfo = useMemo(() => {
            return \`\${userData?.id} - \${userSettings?.theme}\`;
          }, [userData, userSettings]);
          return <div>{userInfo}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userSettings',
            fields: 'userSettings?.theme',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData, userSettings }: { userData: { id?: string }; userSettings: { theme?: string } }) => {
          const userInfo = useMemo(() => {
            return \`\${userData?.id} - \${userSettings?.theme}\`;
          }, [userData?.id, userSettings?.theme]);
          return <div>{userInfo}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in useEffect
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          useEffect(() => {
            console.log('User ID:', userData?.id);
          }, [userData]);
          return null;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          useEffect(() => {
            console.log('User ID:', userData?.id);
          }, [userData?.id]);
          return null;
        };
      `,
    },
    // Edge case: Optional chaining in useCallback
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const handleClick = useCallback(() => {
            alert(userData?.id);
          }, [userData]);
          return <button onClick={handleClick}>Click</button>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const handleClick = useCallback(() => {
            alert(userData?.id);
          }, [userData?.id]);
          return <button onClick={handleClick}>Click</button>;
        };
      `,
    },
    // Edge case: Complex expression with optional chaining
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string; status?: string } }) => {
          const isActiveUser = useMemo(() => {
            return userData?.id && userData?.status === 'active';
          }, [userData]);
          return <div>{isActiveUser ? 'Active' : 'Inactive'}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id, userData?.status',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string; status?: string } }) => {
          const isActiveUser = useMemo(() => {
            return userData?.id && userData?.status === 'active';
          }, [userData?.id, userData?.status]);
          return <div>{isActiveUser ? 'Active' : 'Inactive'}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with assignment
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            let id = userData?.id;
            return id || 'default';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            let id = userData?.id;
            return id || 'default';
          }, [userData?.id]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in switch statement
    {
      code: `
        const MyComponent = ({ userData }: { userData: { status?: string } }) => {
          const result = useMemo(() => {
            switch (userData?.status) {
              case 'active':
                return 'User is active';
              case 'inactive':
                return 'User is inactive';
              default:
                return 'Unknown status';
            }
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.status',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { status?: string } }) => {
          const result = useMemo(() => {
            switch (userData?.status) {
              case 'active':
                return 'User is active';
              case 'inactive':
                return 'User is inactive';
              default:
                return 'Unknown status';
            }
          }, [userData?.status]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in try-catch
    {
      code: `
        const MyComponent = ({ userData }: { userData: { getData?: () => string } }) => {
          const result = useMemo(() => {
            try {
              return userData?.getData?.() || 'No data';
            } catch (error) {
              return 'Error occurred';
            }
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.getData',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { getData?: () => string } }) => {
          const result = useMemo(() => {
            try {
              return userData?.getData?.() || 'No data';
            } catch (error) {
              return 'Error occurred';
            }
          }, [userData?.getData]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with typeof check
    {
      code: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            return typeof userData?.id === 'string' ? userData?.id : 'No ID';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { id?: string } }) => {
          const result = useMemo(() => {
            return typeof userData?.id === 'string' ? userData?.id : 'No ID';
          }, [userData?.id]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with instanceof check
    {
      code: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date instanceof Date ? userData?.date.toISOString() : 'No date';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.date.toISOString, userData?.date',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date instanceof Date ? userData?.date.toISOString() : 'No date';
          }, [userData?.date.toISOString, userData?.date]);
          return <div>{result}</div>;
        };
      `,
    },
    // Edge case: Optional chaining in array methods
    {
      code: `
        const MyComponent = ({ userData }: { userData: { items?: { id: string }[] } }) => {
          const result = useMemo(() => {
            return userData?.items?.map(item => item.id) || [];
          }, [userData]);
          return <div>{result.join(', ')}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.items',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { items?: { id: string }[] } }) => {
          const result = useMemo(() => {
            return userData?.items?.map(item => item.id) || [];
          }, [userData?.items]);
          return <div>{result.join(', ')}</div>;
        };
      `,
    },
    // Edge case: Optional chaining with complex nested access
    {
      code: `
        const MyComponent = ({ userData }: { userData: { profile?: { settings?: { theme?: { primary?: string } } } } }) => {
          const result = useMemo(() => {
            return userData?.profile?.settings?.theme?.primary || 'default';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.profile.settings.theme.primary, userData?.profile',
          },
        },
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { profile?: { settings?: { theme?: { primary?: string } } } } }) => {
          const result = useMemo(() => {
            return userData?.profile?.settings?.theme?.primary || 'default';
          }, [userData?.profile.settings.theme.primary, userData?.profile]);
          return <div>{result}</div>;
        };
      `,
    },
  ],
});
