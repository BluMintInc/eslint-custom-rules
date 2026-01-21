import { ruleTesterJsx } from '../utils/ruleTester';
import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';

type MessageIds = 'avoidEntireObject' | 'removeUnusedDependency';

type RuleError = {
  messageId: MessageIds;
  data: {
    objectName: string;
    fields?: string;
  };
};

const avoidEntireObjectMessage =
  'What\'s wrong: Dependency array includes entire object "{{objectName}}". Why it matters: Any change to its other properties reruns the hook even though the hook reads only {{fields}}, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.';

const removeUnusedDependencyMessage =
  'What\'s wrong: Dependency "{{objectName}}" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "{{objectName}}" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.';

const avoid = (objectName: string, fields: string): RuleError => ({
  messageId: 'avoidEntireObject',
  data: {
    objectName,
    fields,
  },
});

const removeUnused = (objectName: string): RuleError => ({
  messageId: 'removeUnusedDependency',
  data: {
    objectName,
  },
});

describe('no-entire-object-hook-deps messages', () => {
  it('explains why and how to fix', () => {
    expect(noEntireObjectHookDeps.meta.messages.avoidEntireObject).toBe(
      avoidEntireObjectMessage,
    );
    expect(noEntireObjectHookDeps.meta.messages.removeUnusedDependency).toBe(
      removeUnusedDependencyMessage,
    );
  });
});

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
    // Using Object.keys() should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          const keys = useMemo(() => {
            return Object.keys(data);
          }, [data]);
          return <div>{keys.join(', ')}</div>;
        };
      `,
    },
    // Using Object.values() should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          const values = useMemo(() => {
            return Object.values(data);
          }, [data]);
          return <div>{values.join(', ')}</div>;
        };
      `,
    },
    // Using Object.entries() should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          const entries = useMemo(() => {
            return Object.entries(data);
          }, [data]);
          return <div>{entries.length}</div>;
        };
      `,
    },
    // Test case for the bug report #1157 - object literal property usage
    {
      code: `
        import { useMemo } from 'react';

        export const useRepro = (onMenuClose: () => void, uid: string) => {
          const item = useMemo(() => {
            return {
              onClick: onMenuClose,
              href: \`/\${uid}\`,
            };
          }, [onMenuClose, uid]);

          return item;
        };
      `,
    },
    // Using JSON.stringify() should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          const serialized = useMemo(() => {
            return JSON.stringify(data);
          }, [data]);
          return <div>{serialized}</div>;
        };
      `,
    },
    // Using object in template literal with specific property should be valid
    {
      code: `
        const MyComponent = ({ user }) => {
          const greeting = useMemo(() => {
            return \`Hello, \${user.name}!\`;
          }, [user.name]);
          return <div>{greeting}</div>;
        };
      `,
    },
    // Using object in array destructuring should be valid
    {
      code: `
        const MyComponent = ({ coordinates }) => {
          const position = useMemo(() => {
            const [x, y] = coordinates.position;
            return { x, y };
          }, [coordinates.position]);
          return <div>{position.x}, {position.y}</div>;
        };
      `,
    },
    // Using object in object destructuring should be valid
    {
      code: `
        const MyComponent = ({ user }) => {
          const displayName = useMemo(() => {
            const { firstName, lastName } = user.name;
            return \`\${firstName} \${lastName}\`;
          }, [user.name]);
          return <div>{displayName}</div>;
        };
      `,
    },
    // Using object in switch statement with specific property should be valid
    {
      code: `
        const MyComponent = ({ config }) => {
          const value = useMemo(() => {
            switch (config.type) {
              case 'A':
                return 'Type A';
              case 'B':
                return 'Type B';
              default:
                return 'Unknown';
            }
          }, [config.type]);
          return <div>{value}</div>;
        };
      `,
    },
    // Using object in array includes should be valid
    {
      code: `
        const MyComponent = ({ item, list }) => {
          const isIncluded = useMemo(() => {
            return list.includes(item);
          }, [item, list]);
          return <div>{isIncluded ? 'Included' : 'Not included'}</div>;
        };
      `,
    },
    // Using object in Promise.resolve should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          useEffect(() => {
            Promise.resolve(data).then(console.log);
          }, [data]);
          return null;
        };
      `,
    },
    // Using object as function parameter should be valid
    {
      code: `
        const MyComponent = ({ transform }) => {
          const transformer = useMemo(() => {
            return (value) => transform(value);
          }, [transform]);
          return <div>{transformer('test')}</div>;
        };
      `,
    },
    // Using object in closure with specific property should be valid
    {
      code: `
        const MyComponent = ({ multiplier }) => {
          const createMultiplier = useMemo(() => {
            return (value) => {
              return value * multiplier.factor;
            };
          }, [multiplier.factor]);
          return <div>{createMultiplier(5)}</div>;
        };
      `,
    },
    // Using object in recursive function with specific property should be valid
    {
      code: `
        const MyComponent = ({ tree }) => {
          const traverse = useMemo(() => {
            function walk(node) {
              if (!node) return 0;
              return 1 + walk(node.left) + walk(node.right);
            }
            return walk(tree.root);
          }, [tree.root]);
          return <div>{traverse}</div>;
        };
      `,
    },
    // Using object in method call chain should be valid
    {
      code: `
        const MyComponent = ({ data }) => {
          const result = useMemo(() => {
            return data.filter(x => x.active).map(x => x.name).join(', ');
          }, [data]);
          return <div>{result}</div>;
        };
      `,
    },
    // Using object in complex expression with specific properties should be valid
    {
      code: `
        const MyComponent = ({ a, b, c }) => {
          const result = useMemo(() => {
            return (a.value + b.value) * c.multiplier;
          }, [a.value, b.value, c.multiplier]);
          return <div>{result}</div>;
        };
      `,
    },
    // Using object in array find should be valid
    {
      code: `
        const MyComponent = ({ items, predicate }) => {
          const found = useMemo(() => {
            return items.find(predicate);
          }, [items, predicate]);
          return <div>{found?.name}</div>;
        };
      `,
    },
    // Using object in array reduce should be valid
    {
      code: `
        const MyComponent = ({ numbers, reducer }) => {
          const sum = useMemo(() => {
            return numbers.reduce(reducer, 0);
          }, [numbers, reducer]);
          return <div>{sum}</div>;
        };
      `,
    },
    // Using object in array sort should be valid
    {
      code: `
        const MyComponent = ({ items, compareFn }) => {
          const sorted = useMemo(() => {
            return [...items].sort(compareFn);
          }, [items, compareFn]);
          return <div>{sorted.length}</div>;
        };
      `,
    },
    // Using object in string replace should be valid
    {
      code: `
        const MyComponent = ({ text, replacer }) => {
          const replaced = useMemo(() => {
            return text.replace(/placeholder/g, replacer);
          }, [text, replacer]);
          return <div>{replaced}</div>;
        };
      `,
    },
    // Using object in parseInt should be valid
    {
      code: `
        const MyComponent = ({ value, radix }) => {
          const parsed = useMemo(() => {
            return parseInt(value, radix);
          }, [value, radix]);
          return <div>{parsed}</div>;
        };
      `,
    },
    // Using object in Math functions should be valid
    {
      code: `
        const MyComponent = ({ numbers }) => {
          const max = useMemo(() => {
            return Math.max(...numbers);
          }, [numbers]);
          return <div>{max}</div>;
        };
      `,
    },
    // Using object in conditional should be valid as it requires truthiness check of the entire object
    {
      code: `
        const MyComponent = ({ config }: { config: { value: string } }) => {
          const value = useMemo(() => {
            return config ? config.value : null;
          }, [config]);
          return <div>{value}</div>;
        };
      `,
    },
    // Using object in logical expression should be valid as it requires truthiness check
    {
      code: `
        const MyComponent = ({ settings }: { settings: { enabled: boolean } }) => {
          const isEnabled = useMemo(() => {
            return settings && settings.enabled;
          }, [settings]);
          return <div>{isEnabled}</div>;
        };
      `,
    },
    // Using object in comparison should be valid
    {
      code: `
        const MyComponent = ({ userData }) => {
          useEffect(() => {
            if (userData === null) return;
            console.log(userData.id);
          }, [userData]);
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
      errors: [avoid('userFull', 'userFull?.uid')],
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
      errors: [avoid('user', 'user.name')],
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
      errors: [avoid('user', 'user.name, user.age')],
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
      errors: [avoid('user', 'user.address.city')],
      output: `
        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user.address.city]);
          return <button onClick={showAddress}>Show Address</button>;
        };
      `,
    },
    // Test case for the bug report - circular dependency where object is in deps but not used
    {
      code: `
        const MyComponent = ({ channelGroupActive, channelGroupIdRouter, findByChannelGroupId }) => {
          useEffect(() => {
            const syncChannelGroup = async () => {
              if (!channelGroupIdRouter) {
                return setChannelGroupActive(undefined);
              }

              const foundChannelGroup = await findByChannelGroupId(
                channelGroupIdRouter,
              );

              if (!foundChannelGroup) {
                openChannelGroupNotFoundDialog();
                return closeChannelGroup();
              }

              setChannelGroupActive(toActiveChannelGroup(foundChannelGroup));
            };

            syncChannelGroup();
          }, [channelGroupIdRouter, findByChannelGroupId, channelGroupActive]);
          return null;
        };
      `,
      errors: [removeUnused('channelGroupActive')],
      output: `
        const MyComponent = ({ channelGroupActive, channelGroupIdRouter, findByChannelGroupId }) => {
          useEffect(() => {
            const syncChannelGroup = async () => {
              if (!channelGroupIdRouter) {
                return setChannelGroupActive(undefined);
              }

              const foundChannelGroup = await findByChannelGroupId(
                channelGroupIdRouter,
              );

              if (!foundChannelGroup) {
                openChannelGroupNotFoundDialog();
                return closeChannelGroup();
              }

              setChannelGroupActive(toActiveChannelGroup(foundChannelGroup));
            };

            syncChannelGroup();
          }, [channelGroupIdRouter, findByChannelGroupId]);
          return null;
        };
      `,
    },
    // Object used in nullish coalescing but only specific property needed
    {
      code: `
        const MyComponent = ({ theme }: { theme: { color?: string } }) => {
          const color = useMemo(() => {
            return theme?.color ?? 'default';
          }, [theme]);
          return <div style={{ color }}></div>;
        };
      `,
      errors: [avoid('theme', 'theme?.color')],
      output: `
        const MyComponent = ({ theme }: { theme: { color?: string } }) => {
          const color = useMemo(() => {
            return theme?.color ?? 'default';
          }, [theme?.color]);
          return <div style={{ color }}></div>;
        };
      `,
    },
    // Complex nested object access
    {
      code: `
        const MyComponent = ({ config }: { config: { api: { endpoints: { users: string } } } }) => {
          const endpoint = useMemo(() => {
            return config.api.endpoints.users;
          }, [config]);
          return <div>{endpoint}</div>;
        };
      `,
      errors: [avoid('config', 'config.api.endpoints.users')],
      output: `
        const MyComponent = ({ config }: { config: { api: { endpoints: { users: string } } } }) => {
          const endpoint = useMemo(() => {
            return config.api.endpoints.users;
          }, [config.api.endpoints.users]);
          return <div>{endpoint}</div>;
        };
      `,
    },
    // Object with array access
    {
      code: `
        const MyComponent = ({ data }: { data: { items: string[] } }) => {
          const firstItem = useMemo(() => {
            return data.items[0];
          }, [data]);
          return <div>{firstItem}</div>;
        };
      `,
      errors: [avoid('data', 'data.items[0]')],
      output: `
        const MyComponent = ({ data }: { data: { items: string[] } }) => {
          const firstItem = useMemo(() => {
            return data.items[0];
          }, [data.items[0]]);
          return <div>{firstItem}</div>;
        };
      `,
    },
    // Object with multiple array accesses
    {
      code: `
        const MyComponent = ({ matrix }: { matrix: { rows: number[][] } }) => {
          const value = useMemo(() => {
            return matrix.rows[0][1] + matrix.rows[1][0];
          }, [matrix]);
          return <div>{value}</div>;
        };
      `,
      errors: [avoid('matrix', 'matrix.rows[0][1], matrix.rows[1][0]')],
      output: `
        const MyComponent = ({ matrix }: { matrix: { rows: number[][] } }) => {
          const value = useMemo(() => {
            return matrix.rows[0][1] + matrix.rows[1][0];
          }, [matrix.rows[0][1], matrix.rows[1][0]]);
          return <div>{value}</div>;
        };
      `,
    },
    // Object with string literal property access
    {
      code: `
        const MyComponent = ({ data }: { data: { [key: string]: any } }) => {
          const value = useMemo(() => {
            return data['special-key'];
          }, [data]);
          return <div>{value}</div>;
        };
      `,
      errors: [avoid('data', 'data["special-key"]')],
      output: `
        const MyComponent = ({ data }: { data: { [key: string]: any } }) => {
          const value = useMemo(() => {
            return data['special-key'];
          }, [data["special-key"]]);
          return <div>{value}</div>;
        };
      `,
    },
    // Object used in binary expression should be considered used (Type A)
    {
      code: `
        const MyComponent = ({ unusedObject, usedValue }) => {
          const result = useMemo(() => {
            return usedValue * 2;
          }, [unusedObject, usedValue]);
          return <div>{result}</div>;
        };
      `,
      errors: [removeUnused('unusedObject')],
      output: `
        const MyComponent = ({ unusedObject, usedValue }) => {
          const result = useMemo(() => {
            return usedValue * 2;
          }, [usedValue]);
          return <div>{result}</div>;
        };
      `,
    },
    // Multiple unused objects
    {
      code: `
        const MyComponent = ({ unused1, unused2, used }) => {
          const result = useMemo(() => {
            return used.value;
          }, [unused1, unused2, used]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        removeUnused('unused1'),
        removeUnused('unused2'),
        avoid('used', 'used.value'),
      ],
      output: `
        const MyComponent = ({ unused1, unused2, used }) => {
          const result = useMemo(() => {
            return used.value;
          }, [unused2, used.value]);
          return <div>{result}</div>;
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.id, userData?.name')],
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
        avoid('userData', 'userData?.profile.address.city, userData?.profile'),
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
      errors: [avoid('userData', 'userData?.name, userData.id')],
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.name')],
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
      errors: [avoid('userData', 'userData?.name')],
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
      errors: [avoid('userData', 'userData?.getName')],
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
      errors: [avoid('userData', 'userData?.items[0], userData?.items')],
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.id, userData?.name')],
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
      errors: [avoid('userData', 'userData?.id, userData?.name')],
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
      errors: [avoid('userData', 'userData?.name')],
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
      errors: [avoid('userData', 'userData?.id, userData?.name')],
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
        avoid('userData', 'userData?.id'),
        avoid('userSettings', 'userSettings?.theme'),
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.id, userData?.status')],
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.status')],
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
      errors: [avoid('userData', 'userData?.getData')],
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
      errors: [avoid('userData', 'userData?.id')],
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
      errors: [avoid('userData', 'userData?.date.toISOString, userData?.date')],
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
      errors: [avoid('userData', 'userData?.items')],
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
        avoid(
          'userData',
          'userData?.profile.settings.theme.primary, userData?.profile',
        ),
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
    // TS assertion case
    {
      code: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData as User).name);
          }, [userData]);
        };
      `,
      errors: [avoid('userData', 'userData.name')],
      output: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData as User).name);
          }, [userData.name]);
        };
      `,
    },
    // TS assertion with optional chaining
    {
      code: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData?.profile as Profile).id);
          }, [userData]);
        };
      `,
      errors: [avoid('userData', 'userData?.profile.id, userData?.profile')],
      output: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData?.profile as Profile).id);
          }, [userData?.profile.id, userData?.profile]);
        };
      `,
    },
    // Wrapped dependency in array
    {
      code: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log(userData.name);
          }, [userData as any]);
        };
      `,
      errors: [avoid('userData', 'userData.name')],
      output: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log(userData.name);
          }, [userData.name]);
        };
      `,
    },
  ],
});
