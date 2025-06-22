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
      errors: [
        {
          messageId: 'removeUnusedDependency',
          data: {
            objectName: 'channelGroupActive',
          },
        },
      ],
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
    // Object used in conditional but only specific property needed
    {
      code: `
        const MyComponent = ({ config }: { config: { value: string } }) => {
          const value = useMemo(() => {
            return config ? config.value : null;
          }, [config]);
          return <div>{value}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'config',
            fields: 'config.value',
          },
        },
      ],
      output: `
        const MyComponent = ({ config }: { config: { value: string } }) => {
          const value = useMemo(() => {
            return config ? config.value : null;
          }, [config.value]);
          return <div>{value}</div>;
        };
      `,
    },
    // Object used in logical AND but only specific property needed
    {
      code: `
        const MyComponent = ({ settings }: { settings: { enabled: boolean } }) => {
          const isEnabled = useMemo(() => {
            return settings && settings.enabled;
          }, [settings]);
          return <div>{isEnabled}</div>;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'settings',
            fields: 'settings.enabled',
          },
        },
      ],
      output: `
        const MyComponent = ({ settings }: { settings: { enabled: boolean } }) => {
          const isEnabled = useMemo(() => {
            return settings && settings.enabled;
          }, [settings.enabled]);
          return <div>{isEnabled}</div>;
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
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'theme',
            fields: 'theme?.color',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'config',
            fields: 'config.api.endpoints.users',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'data',
            fields: 'data.items[0]',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'matrix',
            fields: 'matrix.rows[0][1], matrix.rows[1][0]',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'data',
            fields: 'data["special-key"]',
          },
        },
      ],
      output: `
        const MyComponent = ({ data }: { data: { [key: string]: any } }) => {
          const value = useMemo(() => {
            return data['special-key'];
          }, [data["special-key"]]);
          return <div>{value}</div>;
        };
      `,
    },
    // Object not used at all - should be removed
    {
      code: `
        const MyComponent = ({ unusedObject, usedValue }) => {
          const result = useMemo(() => {
            return usedValue * 2;
          }, [unusedObject, usedValue]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        {
          messageId: 'removeUnusedDependency',
          data: {
            objectName: 'unusedObject',
          },
        },
        {
          messageId: 'removeUnusedDependency',
          data: {
            objectName: 'usedValue',
          },
        },
      ],
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
        {
          messageId: 'removeUnusedDependency',
          data: {
            objectName: 'unused1',
          },
        },
        {
          messageId: 'removeUnusedDependency',
          data: {
            objectName: 'unused2',
          },
        },
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'used',
            fields: 'used.value',
          },
        },
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
  ],
});
