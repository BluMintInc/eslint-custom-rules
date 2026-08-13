import path from 'path';
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { parse } from '@typescript-eslint/parser';
import { ruleTesterJsx, withParserOptions } from '../utils/ruleTester';
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

// Regression cases for issue #1401: the fixer emitted `state?[0]` (a syntax
// error — it parses as a conditional expression) instead of `state?.[0]` when
// narrowing an optional-chained computed access. Kept in a named array so the
// parse-assertion block below can prove every fixed output round-trips through
// the parser: RuleTester compares fix output as text and never re-parses it,
// which is exactly how this bug shipped.
const optionalComputedFixCases = [
  // Exact shape from agora's useRouterStateFallback.tsx (issue #1401):
  // optional-chained computed access on the base object.
  {
    code: `
      const useRouterStateFallback = ({ state, defaultStateValue, setDefaultStateValue }) => {
        const stateValue = useMemo(() => {
          return state?.[0] || defaultStateValue;
        }, [defaultStateValue, state]);
        const setStateValue = useMemo(() => {
          return state?.[1] || setDefaultStateValue;
        }, [state, setDefaultStateValue]);
        return [stateValue, setStateValue];
      };
    `,
    errors: [avoid('state', 'state?.[0]'), avoid('state', 'state?.[1]')],
    output: `
      const useRouterStateFallback = ({ state, defaultStateValue, setDefaultStateValue }) => {
        const stateValue = useMemo(() => {
          return state?.[0] || defaultStateValue;
        }, [defaultStateValue, state?.[0]]);
        const setStateValue = useMemo(() => {
          return state?.[1] || setDefaultStateValue;
        }, [state?.[1], setDefaultStateValue]);
        return [stateValue, setStateValue];
      };
    `,
  },
  // Plain computed access on the base object stays bracket-only.
  {
    code: `
      const MyComponent = ({ state, fallback }) => {
        const first = useMemo(() => {
          return state[0] ?? fallback;
        }, [state, fallback]);
        return <div>{first}</div>;
      };
    `,
    errors: [avoid('state', 'state[0]')],
    output: `
      const MyComponent = ({ state, fallback }) => {
        const first = useMemo(() => {
          return state[0] ?? fallback;
        }, [state[0], fallback]);
        return <div>{first}</div>;
      };
    `,
  },
  // Optional-chained dot access keeps its `?.` marker.
  {
    code: `
      const MyComponent = ({ state }) => {
        const label = useMemo(() => {
          return state?.label;
        }, [state]);
        return <div>{label}</div>;
      };
    `,
    errors: [avoid('state', 'state?.label')],
    output: `
      const MyComponent = ({ state }) => {
        const label = useMemo(() => {
          return state?.label;
        }, [state?.label]);
        return <div>{label}</div>;
      };
    `,
  },
  // Optional-chained computed access with a string key renders as ?.["key"].
  {
    code: `
      const MyComponent = ({ state }) => {
        const special = useMemo(() => {
          return state?.["special-key"];
        }, [state]);
        return <div>{special}</div>;
      };
    `,
    errors: [avoid('state', 'state?.["special-key"]')],
    output: `
      const MyComponent = ({ state }) => {
        const special = useMemo(() => {
          return state?.["special-key"];
        }, [state?.["special-key"]]);
        return <div>{special}</div>;
      };
    `,
  },
  // Mixed chain: optional dot link followed by a plain bracket. The path stops
  // at the optional link (issue #1985). Emitting `a?.b[0]` was the bug: the
  // author's `?.` says `a.b` may be absent, and a dependency array is
  // evaluated eagerly on EVERY render — including renders where the memo is
  // reused and the body never runs — so the bracket throws where the body
  // would not. `a?.b` is coarser and cannot throw. `?.` marker placement stays
  // covered by the two cases below, which emit their brackets in full.
  {
    code: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a?.b[0];
        }, [a]);
        return <div>{first}</div>;
      };
    `,
    errors: [avoid('a', 'a?.b')],
    output: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a?.b[0];
        }, [a?.b]);
        return <div>{first}</div>;
      };
    `,
  },
  // Mixed chain: plain dot link followed by an optional bracket. The `?.`
  // marker must sit on the bracket link (a.b?.[0]), NOT migrate to the base
  // (a?.b[0]) — the base rendering would throw at dep-evaluation time when
  // `a` is defined but `a.b` is not.
  {
    code: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a.b?.[0];
        }, [a]);
        return <div>{first}</div>;
      };
    `,
    errors: [avoid('a', 'a.b?.[0]')],
    output: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a.b?.[0];
        }, [a.b?.[0]]);
        return <div>{first}</div>;
      };
    `,
  },
  // Fully optional mixed chain keeps every marker.
  {
    code: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a?.b?.[0];
        }, [a]);
        return <div>{first}</div>;
      };
    `,
    errors: [avoid('a', 'a?.b?.[0], a?.b')],
    output: `
      const MyComponent = ({ a }) => {
        const first = useMemo(() => {
          return a?.b?.[0];
        }, [a?.b?.[0], a?.b]);
        return <div>{first}</div>;
      };
    `,
  },
];

describe('no-entire-object-hook-deps fixed outputs parse (issue #1401)', () => {
  // why: scope analysis inside parseForESLint dereferences node.range, so
  // range/loc must be enabled or every parse crashes with a TypeError
  // instead of reporting syntax validity.
  const parseAsTsx = (code: string) =>
    parse(code, { ecmaFeatures: { jsx: true }, range: true, loc: true });

  it('rejects the pre-fix broken shape, proving these assertions bite', () => {
    expect(() =>
      parseAsTsx(`
        const stateValue = useMemo(() => {
          return state?.[0] || defaultStateValue;
        }, [defaultStateValue, state?[0]]);
      `),
    ).toThrow(/expected/);
  });

  optionalComputedFixCases.forEach(({ code, output }) => {
    const summary = code.trim().split('\n')[2]?.trim();
    it(`emits parseable output for: ${summary}`, () => {
      expect(() => parseAsTsx(output)).not.toThrow();
    });
  });
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

// why: fixtures for issue #1547 carry real `react-hooks/exhaustive-deps`
// disable directives, and ESLint reports "Definition for rule ... was not
// found" for a directive naming a rule its Linter cannot resolve. A no-op stub
// makes the directive resolvable without suppressing anything: it names a
// different rule than the one under test.
ruleTesterJsx.defineRule('react-hooks/exhaustive-deps', {
  meta: {
    type: 'problem',
    docs: {
      description: 'Stub standing in for the react-hooks plugin rule.',
      recommended: false,
    },
    schema: [],
    messages: {},
  },
  defaultOptions: [],
  create: () => ({}),
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
    // TS assertion in object literal property value requires entire object
    {
      code: `
        const MyComponent = ({ userData }) => {
          const item = useMemo(() => ({
            user: userData as User,
            name: userData.name
          }), [userData]);
          return item;
        };
      `,
    },
    // TS assertion in computed property key requires entire object
    {
      code: `
        const MyComponent = ({ userData }) => {
          const item = useMemo(() => ({
            [(userData as string)]: 'value',
            name: userData.name
          }), [userData]);
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
    // Regression (#1176): a function returned via a shorthand property inside an
    // `as const` object is a usage of the dependency, not an unused dependency.
    // The dependency drives the memoized return value, so it must NOT be reported.
    {
      code: `
        const useOAuthCustom = () => {
          const connectOAuthCustom = useLatestCallback(async (method) => method);
          return useMemo(() => {
            return { connectOAuthCustom } as const;
          }, [connectOAuthCustom]);
        };
      `,
    },
    // Regression (#1176): same pattern with a concise arrow body.
    {
      code: `
        const useOAuthCustom = () => {
          const connectOAuthCustom = useLatestCallback(async (method) => method);
          return useMemo(() => ({ connectOAuthCustom } as const), [connectOAuthCustom]);
        };
      `,
    },
    // Regression (#1176): shorthand function alongside another shorthand value in
    // an `as const` object — both dependencies are used in the returned object.
    {
      code: `
        const useHandlers = () => {
          const connectOAuthCustom = useLatestCallback(async (method) => method);
          const disconnect = useLatestCallback(() => undefined);
          return useMemo(() => {
            return { connectOAuthCustom, disconnect } as const;
          }, [connectOAuthCustom, disconnect]);
        };
      `,
    },
    // Regression (#1176): an object used only inside JSX within an `as const`
    // memo return is a usage and must NOT be reported as unused.
    {
      code: `
        const RolesCentralized = ({ obj, roles }) => {
          const dialogProps = useMemo(() => {
            return {
              Wrapper: (
                <Ctx.Provider dataOverride={obj}>
                  <RoleProvider roles={roles}>
                    <Fragment />
                  </RoleProvider>
                </Ctx.Provider>
              ),
            } as const;
          }, [obj, roles]);
          return dialogProps;
        };
      `,
    },
    // Regression (#1291): the hook indexes into the dependency with a computed
    // key that is neither a plain identifier nor a literal. In these shapes the
    // access reads arbitrary elements across an iteration, so there is no single
    // narrowable field and the whole-object dependency is correct. The rule must
    // NOT report (and must not suggest an out-of-scope "field" like the index var).
    //
    // Exact issue repro: podiumGroups[assertSafe(index)] inside a sibling .map()
    // callback whose own `index` iterates a *different* array.
    {
      code: `
        const MyComponent = ({ podiumGroups }) => {
          const placements = useMemo(() => {
            return PODIUM_SLOT_PLACEMENTS.map((slotPlacement, index) => {
              const group = podiumGroups[assertSafe(index)];
              return group?.placement ?? slotPlacement;
            });
          }, [podiumGroups]);
          return <div>{placements}</div>;
        };
      `,
    },
    // Literal-index variant with the loop index identifier (regression guard —
    // an Identifier computed key already needed the entire object; lock it in).
    {
      code: `
        const MyComponent = ({ podiumGroups }) => {
          const placements = useMemo(() => {
            return PODIUM_SLOT_PLACEMENTS.map((slotPlacement, index) => {
              const group = podiumGroups[index];
              return group?.placement ?? slotPlacement;
            });
          }, [podiumGroups]);
          return <div>{placements}</div>;
        };
      `,
    },
    // Non-literal computed key: BinaryExpression obj[i + 1]
    {
      code: `
        const MyComponent = ({ obj }) => {
          const value = useMemo(() => {
            return items.map((item, i) => obj[i + 1]);
          }, [obj]);
          return <div>{value}</div>;
        };
      `,
    },
    // Non-literal computed key: MemberExpression obj[keys[j]]
    {
      code: `
        const MyComponent = ({ obj, keys }) => {
          const value = useMemo(() => {
            return keys.map((key, j) => obj[keys[j]]);
          }, [obj, keys]);
          return <div>{value}</div>;
        };
      `,
    },
    // Non-literal computed key: CallExpression obj[getKey()]
    {
      code: `
        const MyComponent = ({ obj }) => {
          const value = useMemo(() => {
            return obj[getKey()];
          }, [obj]);
          return <div>{value}</div>;
        };
      `,
    },
    // Non-literal computed key: TSAsExpression obj[k as string]
    {
      code: `
        const MyComponent = ({ obj, k }) => {
          const value = useMemo(() => {
            return obj[k as string];
          }, [obj]);
          return <div>{value}</div>;
        };
      `,
    },
    // Non-literal computed key on a nested property: obj.rows[fn(i)]
    {
      code: `
        const MyComponent = ({ obj }) => {
          const value = useMemo(() => {
            return list.map((item, i) => obj.rows[fn(i)]);
          }, [obj]);
          return <div>{value}</div>;
        };
      `,
    },
    // useCallback variant with dynamic computed key
    {
      code: `
        const MyComponent = ({ podiumGroups }) => {
          const handler = useCallback(() => {
            return PODIUM_SLOT_PLACEMENTS.map((slotPlacement, index) => {
              const group = podiumGroups[assertSafe(index)];
              return group?.placement ?? slotPlacement;
            });
          }, [podiumGroups]);
          return <button onClick={handler}>Go</button>;
        };
      `,
    },
    // useEffect variant with dynamic computed key
    {
      code: `
        const MyComponent = ({ podiumGroups }) => {
          useEffect(() => {
            PODIUM_SLOT_PLACEMENTS.forEach((slotPlacement, index) => {
              const group = podiumGroups[assertSafe(index)];
              log(group?.placement ?? slotPlacement);
            });
          }, [podiumGroups]);
          return <div />;
        };
      `,
    },
    // Template literal computed key: obj[`row-${i}`]
    {
      code: `
        const MyComponent = ({ obj }) => {
          const value = useMemo(() => {
            return list.map((item, i) => obj[\`row-\${i}\`]);
          }, [obj]);
          return <div>{value}</div>;
        };
      `,
    },
    // Boolean literal computed key: no rendering the fixer can guarantee
    // round-trips (the fixer used to emit the unparseable wildcard `flags[*]`),
    // so narrowing is declined and the entire object stays a valid dependency.
    {
      code: `
        const MyComponent = ({ flags }) => {
          const value = useMemo(() => {
            return flags[true];
          }, [flags]);
          return <div>{value}</div>;
        };
      `,
    },
    // Reset-on-scope-change (issue #1546): `status` and `filter` are deliberate
    // re-run TRIGGERS for the effect, not values its body reads. The effect
    // never calls setStatus/setFilter, so there is no circular dependency and
    // deleting the triggers would silently stop the reset from happening.
    {
      code: `
        const useResettingPagination = (status, filter, isPaginated) => {
          const [pageSize, setPageSize] = useState(10);
          useEffect(() => {
            if (!isPaginated) {
              return;
            }
            setPageSize(10);
          }, [isPaginated, status, filter]);
          return { pageSize };
        };
      `,
    },
    // Several unread triggers at once, none of them written by the body.
    {
      code: `
        const useResetOnScope = (status, filter, negativeFilter) => {
          const [page, setPage] = useState(0);
          useEffect(() => {
            setPage(0);
          }, [status, filter, negativeFilter]);
          return page;
        };
      `,
    },
    // Trigger alongside a dependency the body genuinely reads.
    {
      code: `
        const useResetOnScopeChange = (status, logger) => {
          const [page, setPage] = useState(0);
          useEffect(() => {
            logger(page);
            setPage(0);
          }, [logger, status]);
          return page;
        };
      `,
    },
    // The effect calls a setter, but for an unrelated value: `status` is still
    // a trigger, not something the effect writes.
    {
      code: `
        const useResetSelection = (status) => {
          const [selected, setSelected] = useState();
          useEffect(() => {
            setSelected(undefined);
          }, [status]);
          return selected;
        };
      `,
    },
    // Near-miss setter name: `setPageSize` does not correspond to dep `status`,
    // so the dep remains a trigger rather than a circular dependency.
    {
      code: `
        const useNearMissSetter = (status) => {
          const [pageSize, setPageSize] = useState(10);
          useEffect(() => {
            setPageSize(10);
          }, [status]);
          return pageSize;
        };
      `,
    },
    // Setter for the dep's own value is absent even though the body nests
    // callbacks: `startTransition` wraps an unrelated setter.
    {
      code: `
        const useTransitionReset = (status, filter) => {
          const [pageSize, setPageSize] = useState(10);
          useEffect(() => {
            startTransition(() => {
              setPageSize(10);
            });
          }, [status, filter]);
          return pageSize;
        };
      `,
    },
    // An effect that only fires an imperative side effect keeps its triggers.
    {
      code: `
        const useTrackScopeChange = (status, filter) => {
          useEffect(() => {
            analytics.track('scope-changed');
          }, [status, filter]);
        };
      `,
    },
    // Issue #1547: agora's EventEndedText.tsx. `hydrated` is an intentional
    // recompute trigger that forces the single post-mount recompute refreshing
    // the suppressed SSR value; deleting it leaves a stale timestamp. The
    // exhaustive-deps disable sits above the hook call and carries a `--`
    // justification.
    {
      code: `
        const EventEndedText = ({ endDate }) => {
          const hydrated = useHydrated();
          // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrated is an intentional recompute trigger (not read in-body)
          const label = useMemo(() => formatRelative({ date: toValidDate(endDate) }), [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // Issue #1547: agora's useGuards.tsx. The hash is the change detector for a
    // mutable `hooks` map deliberately kept out of the array, and the disable
    // comment sits immediately above the closing `}, [...])` line.
    {
      code: `
        const useGuards = (hooks) => {
          const shouldShowHash = useHashOf(hooks);
          const guards = useMemo(() => {
            return Object.entries(hooks).reduce((acc, [key, hook]) => {
              acc[key] = hook;
              return acc;
            }, {});
            // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldShowHash detects changes to the mutable hooks map
          }, [shouldShowHash]);
          return guards;
        };
      `,
    },
    // Line-comment form with no justification, above the hook call.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // Block-comment form of the next-line directive.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          const label = useMemo(() => {
            return format(endDate);
            /* eslint-disable-next-line react-hooks/exhaustive-deps */
          }, [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // The rule appears among several rules in one directive.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps, no-console
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // The rule listed after another rule, with a justification.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          // eslint-disable-next-line no-console, react-hooks/exhaustive-deps -- hydrated is a recompute trigger
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // Directive above the dependency array in a multi-argument layout.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          const label = useMemo(
            () => format(endDate),
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [endDate, hydrated],
          );
          return <span>{label}</span>;
        };
      `,
    },
    // Same-line form on the dependency array line.
    {
      code: `
        const MyComponent = ({ endDate, hydrated }) => {
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
          return <span>{label}</span>;
        };
      `,
    },
    // File-level disable marks every array in the file as manually managed.
    {
      code: `
        /* eslint-disable react-hooks/exhaustive-deps */
        const MyComponent = ({ endDate, hydrated }) => {
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
    },
    // useCallback arrays are manually managed the same way.
    {
      code: `
        const MyComponent = ({ onDone, status }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- status deliberately re-creates the handler
          const handleClick = useCallback(() => {
            onDone();
          }, [onDone, status]);
          return <button onClick={handleClick}>Go</button>;
        };
      `,
    },
    // Composes with the issue #1546 setter gate: even a circular effect
    // dependency survives once the author takes manual control of the array.
    {
      code: `
        const MyComponent = ({ count, threshold }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- the array is managed by hand
          useEffect(() => {
            const sync = async () => {
              const next = await fetchNext(threshold);
              if (next) {
                setCount(0);
              }
            };
            sync();
          }, [threshold, count]);
          return null;
        };
      `,
    },
    // Issue #1985: the truncated dependency the fixer emits is itself accepted,
    // so `--fix` reaches a fixpoint instead of re-reporting its own output.
    // Each of these is the exact array the matching invalid case below emits.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            if (a.b) { return a.b.c; }
            return 'none';
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    {
      code: `
        const MyComponent = ({ u }: { u: { date?: Date } }) => {
          const result = useMemo(() => {
            if (u.date) { return u.date.toISOString(); }
            return 'No date';
          }, [u.date]);
          return <div>{result}</div>;
        };
      `,
    },
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: { d: string } } } }) => {
          const result = useMemo(() => {
            return a?.b instanceof Object ? a?.b.c.d : 'none';
          }, [a?.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // The fully optional chain's own fixpoint: its trailing method segment is
    // safe to evaluate and must stay accepted.
    {
      code: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date?.toISOString() ?? 'No date';
          }, [userData?.date?.toISOString, userData?.date]);
          return <div>{result}</div>;
        };
      `,
    },
  ],
  invalid: [
    ...optionalComputedFixCases,
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
    // Nested field access. `useCallback` hands its body back rather than
    // running it, so the deep dereference happens whenever the consumer invokes
    // the result — possibly never, possibly only once the data has arrived —
    // while the array is evaluated on every render. The dependency therefore
    // stops at the receiver (issue #1991); the narrowing away from the entire
    // object survives.
    {
      code: `
        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user]);
          return <button onClick={showAddress}>Show Address</button>;
        };
      `,
      errors: [avoid('user', 'user.address')],
      output: `
        const MyComponent = ({ user }: { user: { address: { city: string } } }) => {
          const showAddress = useCallback(() => {
            console.log(user.address.city);
          }, [user.address]);
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
        avoid(
          'userData',
          'userData?.profile?.address?.city, userData?.profile',
        ),
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { profile?: { address?: { city?: string } } } }) => {
          const city = useMemo(() => {
            return userData?.profile?.address?.city;
          }, [userData?.profile?.address?.city, userData?.profile]);
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
      errors: [avoid('userData', 'userData?.items?.[0], userData?.items')],
      output: `
        const MyComponent = ({ userData }: { userData: { items?: string[] } }) => {
          const firstItem = useMemo(() => {
            return userData?.items?.[0];
          }, [userData?.items?.[0], userData?.items]);
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
    // Edge case: Optional chaining with instanceof check. The reported shape of
    // issue #1985: `userData?.date.toISOString` is reachable in the body only
    // because the `instanceof` narrowed it, and `.toISOString` is a
    // prototype-shared reference that pins the memo to a constant besides. The
    // dependency stops at the receiver.
    {
      code: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date instanceof Date ? userData?.date.toISOString() : 'No date';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('userData', 'userData?.date')],
      output: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date instanceof Date ? userData?.date.toISOString() : 'No date';
          }, [userData?.date]);
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
          'userData?.profile?.settings?.theme?.primary, userData?.profile',
        ),
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { profile?: { settings?: { theme?: { primary?: string } } } } }) => {
          const result = useMemo(() => {
            return userData?.profile?.settings?.theme?.primary || 'default';
          }, [userData?.profile?.settings?.theme?.primary, userData?.profile]);
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
    // TS assertion with optional chaining. The path stops at the optional link
    // (issue #1985): the body reads `.id` only because `as Profile` asserts
    // away the nullishness the author's own `?.` declared, and a type
    // assertion has no runtime effect at all. The dependency array carries
    // neither the assertion nor the body's laziness.
    {
      code: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData?.profile as Profile).id);
          }, [userData]);
        };
      `,
      errors: [avoid('userData', 'userData?.profile')],
      output: `
        const MyComponent = ({ userData }) => {
          useCallback(() => {
            console.log((userData?.profile as Profile).id);
          }, [userData?.profile]);
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
    // Circular dependency (issue #1546): the effect writes the very value it
    // depends on, and the setter call is buried inside a nested async function.
    // Unlike a reset trigger, this dependency re-triggers the effect itself.
    {
      code: `
        const MyComponent = ({ count, threshold }) => {
          useEffect(() => {
            const sync = async () => {
              const next = await fetchNext(threshold);
              if (next) {
                setCount(0);
              }
            };
            sync();
          }, [threshold, count]);
          return null;
        };
      `,
      errors: [removeUnused('count')],
      output: `
        const MyComponent = ({ count, threshold }) => {
          useEffect(() => {
            const sync = async () => {
              const next = await fetchNext(threshold);
              if (next) {
                setCount(0);
              }
            };
            sync();
          }, [threshold]);
          return null;
        };
      `,
    },
    // Circular dependency whose setter sits inside a startTransition callback.
    {
      code: `
        const MyComponent = ({ pageSize, status }) => {
          useEffect(() => {
            startTransition(() => {
              setPageSize(10);
            });
          }, [status, pageSize]);
          return null;
        };
      `,
      errors: [removeUnused('pageSize')],
      output: `
        const MyComponent = ({ pageSize, status }) => {
          useEffect(() => {
            startTransition(() => {
              setPageSize(10);
            });
          }, [status]);
          return null;
        };
      `,
    },
    // Single-character dependency: dep `a` corresponds to setter `setA`.
    {
      code: `
        const MyComponent = ({ a }) => {
          useEffect(() => {
            setA(undefined);
          }, [a]);
          return null;
        };
      `,
      errors: [removeUnused('a')],
      output: `
        const MyComponent = ({ a }) => {
          useEffect(() => {
            setA(undefined);
          }, []);
          return null;
        };
      `,
    },
    // Value-producing hooks are unaffected: an unread dependency in a
    // useCallback is dead weight regardless of any setter call.
    {
      code: `
        const MyComponent = ({ status, onDone }) => {
          const handleClick = useCallback(() => {
            onDone();
          }, [onDone, status]);
          return <button onClick={handleClick}>Go</button>;
        };
      `,
      errors: [removeUnused('status')],
      output: `
        const MyComponent = ({ status, onDone }) => {
          const handleClick = useCallback(() => {
            onDone();
          }, [onDone]);
          return <button onClick={handleClick}>Go</button>;
        };
      `,
    },
    // Issue #1547: the agora shape WITHOUT a disable comment still reports and
    // still autofixes — the exemption is not a blanket off-switch.
    {
      code: `
        const EventEndedText = ({ endDate }) => {
          const hydrated = useHydrated();
          const label = useMemo(() => formatRelative({ date: toValidDate(endDate) }), [endDate, hydrated]);
          return <span>{label}</span>;
        };
      `,
      errors: [removeUnused('hydrated')],
      output: `
        const EventEndedText = ({ endDate }) => {
          const hydrated = useHydrated();
          const label = useMemo(() => formatRelative({ date: toValidDate(endDate) }), [endDate]);
          return <span>{label}</span>;
        };
      `,
    },
    // A disable directive naming a different rule says nothing about the
    // dependency array.
    {
      code: `
        const MyComponent = ({ value, trigger }) => {
          // eslint-disable-next-line no-console
          const result = useMemo(() => {
            console.log(value.total);
            return value.total * 2;
          }, [value.total, trigger]);
          return <div>{result}</div>;
        };
      `,
      errors: [removeUnused('trigger')],
      output: `
        const MyComponent = ({ value, trigger }) => {
          // eslint-disable-next-line no-console
          const result = useMemo(() => {
            console.log(value.total);
            return value.total * 2;
          }, [value.total]);
          return <div>{result}</div>;
        };
      `,
    },
    // The exemption is scoped to the hook the directive covers: a neighbouring
    // hook with its own array is still pruned.
    {
      code: `
        const MyComponent = ({ endDate, hydrated, onDone, status }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrated is a recompute trigger
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          const handleClick = useCallback(() => {
            onDone();
          }, [onDone, status]);
          return <button onClick={handleClick}>{label}</button>;
        };
      `,
      errors: [removeUnused('status')],
      output: `
        const MyComponent = ({ endDate, hydrated, onDone, status }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrated is a recompute trigger
          const label = useMemo(() => {
            return format(endDate);
          }, [endDate, hydrated]);
          const handleClick = useCallback(() => {
            onDone();
          }, [onDone]);
          return <button onClick={handleClick}>{label}</button>;
        };
      `,
    },
    // Prose that merely mentions the rule name is not a directive.
    {
      code: `
        const MyComponent = ({ value, trigger }) => {
          // we removed the exhaustive-deps disable that used to live here
          const result = useMemo(() => {
            return value * 2;
          }, [value, trigger]);
          return <div>{result}</div>;
        };
      `,
      errors: [removeUnused('trigger')],
      output: `
        const MyComponent = ({ value, trigger }) => {
          // we removed the exhaustive-deps disable that used to live here
          const result = useMemo(() => {
            return value * 2;
          }, [value]);
          return <div>{result}</div>;
        };
      `,
    },
    // A manually managed array is still narrowed: taking control of which
    // dependencies are listed says nothing about depending on an entire object.
    {
      code: `
        const MyComponent = ({ user, trigger }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger is deliberate
          const greeting = useMemo(() => {
            return 'Hello ' + user.name;
          }, [user, trigger]);
          return <div>{greeting}</div>;
        };
      `,
      errors: [avoid('user', 'user.name')],
      output: `
        const MyComponent = ({ user, trigger }) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger is deliberate
          const greeting = useMemo(() => {
            return 'Hello ' + user.name;
          }, [user.name, trigger]);
          return <div>{greeting}</div>;
        };
      `,
    },
    // Issue #1985 — a dependency array is an array literal, so every element is
    // evaluated eagerly on every render, outside the `if`, the `&&`, the
    // ternary and the `!` that made the deep access safe inside the hook body.
    // Extending a dependency path through such a link turns guarded code into
    // an unconditional TypeError (and a TS18048 under strictNullChecks). The
    // path therefore stops at the guarded link: coarser, never incorrect.
    //
    // Truthiness guard via `if`.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            if (a.b) { return a.b.c; }
            return 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            if (a.b) { return a.b.c; }
            return 'none';
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // Truthiness guard via `&&`: the left operand decides whether the right
    // one runs at all, and the array reproduces neither operand's order.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b && a.b.c;
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b && a.b.c;
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // Truthiness guard via an early return.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            if (!a.b) { return 'none'; }
            return a.b.c;
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            if (!a.b) { return 'none'; }
            return a.b.c;
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // Truthiness guard via a ternary.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b ? a.b.c : 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b ? a.b.c : 'none';
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // Guard via `typeof`.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return typeof a.b === 'object' ? a.b.c : 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return typeof a.b === 'object' ? a.b.c : 'none';
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // A guarded receiver whose called member is a prototype method: the
    // dependency stops at the receiver on both counts. Depending on
    // `u.date.toISOString` would dereference the guarded value AND pin a
    // constant — `Date.prototype.toISOString` is the same reference for every
    // date, so the memo would never invalidate again.
    {
      code: `
        const MyComponent = ({ u }: { u: { date?: Date } }) => {
          const result = useMemo(() => {
            if (u.date) { return u.date.toISOString(); }
            return 'No date';
          }, [u]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('u', 'u.date')],
      output: `
        const MyComponent = ({ u }: { u: { date?: Date } }) => {
          const result = useMemo(() => {
            if (u.date) { return u.date.toISOString(); }
            return 'No date';
          }, [u.date]);
          return <div>{result}</div>;
        };
      `,
    },
    // A non-null assertion is the author's guard, and it exists only in the
    // type system. Before the fix this row emitted `u.date.toISOString` with no
    // shorter entry beside it, so there was nothing to fall back to.
    {
      code: `
        const MyComponent = ({ u }: { u: { date?: Date } }) => {
          const result = useMemo(() => {
            return u.date!.toISOString();
          }, [u]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('u', 'u.date')],
      output: `
        const MyComponent = ({ u }: { u: { date?: Date } }) => {
          const result = useMemo(() => {
            return u.date!.toISOString();
          }, [u.date]);
          return <div>{result}</div>;
        };
      `,
    },
    // A non-null assertion in front of a plain property, with no call
    // involved: the same signal, reached through the path rather than a callee.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b!.c;
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: string } } }) => {
          const result = useMemo(() => {
            return a.b!.c;
          }, [a.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // An `instanceof` narrowing over an optional link, reading a property of
    // the narrowed value.
    {
      code: `
        const MyComponent = ({ a }: { a: { list?: string[] } }) => {
          const result = useMemo(() => {
            return a?.list instanceof Array ? a?.list.length : 0;
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a?.list')],
      output: `
        const MyComponent = ({ a }: { a: { list?: string[] } }) => {
          const result = useMemo(() => {
            return a?.list instanceof Array ? a?.list.length : 0;
          }, [a?.list]);
          return <div>{result}</div>;
        };
      `,
    },
    // Two non-optional links after an optional one: truncation happens at the
    // FIRST unsafe link, not the last.
    {
      code: `
        const MyComponent = ({ a }: { a: { b?: { c: { d: string } } } }) => {
          const result = useMemo(() => {
            return a?.b instanceof Object ? a?.b.c.d : 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a?.b')],
      output: `
        const MyComponent = ({ a }: { a: { b?: { c: { d: string } } } }) => {
          const result = useMemo(() => {
            return a?.b instanceof Object ? a?.b.c.d : 'none';
          }, [a?.b]);
          return <div>{result}</div>;
        };
      `,
    },
    // A called member on a chained receiver is dropped even where no guard
    // narrowed it: `Date.prototype.toISOString` is one shared value, so
    // depending on it would freeze the memo forever.
    {
      code: `
        const MyComponent = ({ u }: { u: { date: Date } }) => {
          const result = useMemo(() => {
            return u.date.toISOString();
          }, [u]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('u', 'u.date')],
      output: `
        const MyComponent = ({ u }: { u: { date: Date } }) => {
          const result = useMemo(() => {
            return u.date.toISOString();
          }, [u.date]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control for the guard signal: the guard names a SIBLING path, so
    // the read path keeps every link. Without this, "truncate everything under
    // any condition" would be indistinguishable from the fix.
    {
      code: `
        const MyComponent = ({ a }: { a: { enabled?: boolean; config: { value: string } } }) => {
          const result = useMemo(() => {
            if (a.enabled) { return a.config.value; }
            return 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.config.value, a.enabled')],
      output: `
        const MyComponent = ({ a }: { a: { enabled?: boolean; config: { value: string } } }) => {
          const result = useMemo(() => {
            if (a.enabled) { return a.config.value; }
            return 'none';
          }, [a.config.value, a.enabled]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control: a condition establishes something about its OWN
    // outermost link only. `if (a.b.c)` dereferences `a.b` unconditionally, so
    // it must not truncate anything at `a.b`.
    {
      code: `
        const MyComponent = ({ a }: { a: { b: { c?: string } } }) => {
          const result = useMemo(() => {
            if (a.b.c) { return a.b.c; }
            return 'none';
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b.c')],
      output: `
        const MyComponent = ({ a }: { a: { b: { c?: string } } }) => {
          const result = useMemo(() => {
            if (a.b.c) { return a.b.c; }
            return 'none';
          }, [a.b.c]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control: an unguarded deep path is untouched. Truncating this
    // one would gut the rule's whole purpose.
    {
      code: `
        const MyComponent = ({ a }: { a: { b: { c: { d: string } } } }) => {
          const result = useMemo(() => {
            return a.b.c.d;
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b.c.d')],
      output: `
        const MyComponent = ({ a }: { a: { b: { c: { d: string } } } }) => {
          const result = useMemo(() => {
            return a.b.c.d;
          }, [a.b.c.d]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control for the callee signal: a chain spelled fully optional
    // short-circuits instead of throwing, so its per-link rendering survives
    // intact — including the trailing method segment. This is the #1521-era
    // behaviour issue #1985 must not regress.
    {
      code: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date?.toISOString() ?? 'No date';
          }, [userData]);
          return <div>{result}</div>;
        };
      `,
      errors: [
        avoid('userData', 'userData?.date?.toISOString, userData?.date'),
      ],
      output: `
        const MyComponent = ({ userData }: { userData: { date?: Date } }) => {
          const result = useMemo(() => {
            return userData?.date?.toISOString() ?? 'No date';
          }, [userData?.date?.toISOString, userData?.date]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control: a function-valued data property held directly on the
    // dependency object still narrows. Falling back to the receiver here would
    // surrender the narrowing entirely, and such a property is per-instance
    // state whose identity legitimately changes.
    {
      code: `
        const MyComponent = ({ userData }: { userData: { getName?: () => string } }) => {
          const name = useMemo(() => {
            return userData?.getName?.() ?? 'anon';
          }, [userData]);
          return <div>{name}</div>;
        };
      `,
      errors: [avoid('userData', 'userData?.getName')],
      output: `
        const MyComponent = ({ userData }: { userData: { getName?: () => string } }) => {
          const name = useMemo(() => {
            return userData?.getName?.() ?? 'anon';
          }, [userData?.getName]);
          return <div>{name}</div>;
        };
      `,
    },
    // Issue #1991 — a condition is not the only licence a hook body holds. A
    // `catch` swallows the very TypeError a deep dereference raises, and a body
    // that runs later may not run at all on the render whose array is being
    // evaluated. Neither licence travels into the array, so a path resting on
    // one stops exactly where a guarded path does.
    //
    // The reported shape: with `user = {}` the input never throws, while the
    // untruncated array throws while React evaluates it, outside the `try`.
    {
      code: `
        const MyComponent = ({ user }) => {
          useEffect(() => {
            try { console.log(user.profile.email); } catch (e) {}
          }, [user]);
        };
      `,
      errors: [avoid('user', 'user.profile')],
      output: `
        const MyComponent = ({ user }) => {
          useEffect(() => {
            try { console.log(user.profile.email); } catch (e) {}
          }, [user.profile]);
        };
      `,
    },
    // The `useCallback` arm: the body runs on invocation, the array on every
    // render.
    {
      code: `
        const MyComponent = ({ data }: { data: { user?: { id: string } } }) => {
          const submit = useCallback(() => {
            send(data.user.id);
          }, [data]);
          return <button onClick={submit}>Send</button>;
        };
      `,
      errors: [avoid('data', 'data.user')],
      output: `
        const MyComponent = ({ data }: { data: { user?: { id: string } } }) => {
          const submit = useCallback(() => {
            send(data.user.id);
          }, [data.user]);
          return <button onClick={submit}>Send</button>;
        };
      `,
    },
    // The inner-callback arm: a `useMemo` body is eager, but the callback it
    // hands to `map` runs once per element — never, over an empty list.
    {
      code: `
        const MyComponent = ({ user, rows }: { user: { profile?: { email: string } }; rows: string[] }) => {
          const emails = useMemo(() => {
            return rows.map(() => user.profile.email);
          }, [user, rows]);
          return <div>{emails}</div>;
        };
      `,
      errors: [avoid('user', 'user.profile')],
      output: `
        const MyComponent = ({ user, rows }: { user: { profile?: { email: string } }; rows: string[] }) => {
          const emails = useMemo(() => {
            return rows.map(() => user.profile.email);
          }, [user.profile, rows]);
          return <div>{emails}</div>;
        };
      `,
    },
    // A `catch` body runs only if something threw, so it establishes nothing
    // about the render evaluating the array either.
    {
      code: `
        const MyComponent = ({ user }: { user: { profile?: { email: string } } }) => {
          useEffect(() => {
            try { risky(); } catch (e) { console.log(user.profile.email); }
          }, [user]);
        };
      `,
      errors: [avoid('user', 'user.profile')],
      output: `
        const MyComponent = ({ user }: { user: { profile?: { email: string } } }) => {
          useEffect(() => {
            try { risky(); } catch (e) { console.log(user.profile.email); }
          }, [user.profile]);
        };
      `,
    },
    // An inner function declaration is deferred for the same reason as a
    // callback expression, and the licence reaches every link below the first
    // whichever hook holds it.
    {
      code: `
        const MyComponent = ({ user }: { user: { profile?: { contact?: { email: string } } } }) => {
          useEffect(() => {
            function notify() {
              console.log(user.profile.contact.email);
            }
            notify();
          }, [user]);
        };
      `,
      errors: [avoid('user', 'user.profile')],
      output: `
        const MyComponent = ({ user }: { user: { profile?: { contact?: { email: string } } } }) => {
          useEffect(() => {
            function notify() {
              console.log(user.profile.contact.email);
            }
            notify();
          }, [user.profile]);
        };
      `,
    },
    // Negative control for the deferred arm: a `useEffect` body runs, so a deep
    // path it reads eagerly keeps every link. Scoping the deferral to "any hook
    // body" instead of "a body the hook does not run" would truncate this one
    // and cost the rule its whole point.
    {
      code: `
        const MyComponent = ({ a }: { a: { b: { c: { d: string } } } }) => {
          useEffect(() => {
            console.log(a.b.c.d);
          }, [a]);
        };
      `,
      errors: [avoid('a', 'a.b.c.d')],
      output: `
        const MyComponent = ({ a }: { a: { b: { c: { d: string } } } }) => {
          useEffect(() => {
            console.log(a.b.c.d);
          }, [a.b.c.d]);
        };
      `,
    },
    // Negative control for the `try` arm: a `try`/`finally` with no handler
    // re-raises, so the block swallows nothing and the path is untouched.
    {
      code: `
        const MyComponent = ({ a }: { a: { b: { c: string } } }) => {
          const result = useMemo(() => {
            try { return a.b.c; } finally { done(); }
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b.c')],
      output: `
        const MyComponent = ({ a }: { a: { b: { c: string } } }) => {
          const result = useMemo(() => {
            try { return a.b.c; } finally { done(); }
          }, [a.b.c]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control: an optional link short-circuits rather than throwing,
    // so it survives evaluation outside the `try` and extends the dependency
    // past the first link.
    {
      code: `
        const MyComponent = ({ a }: { a: { b: { c?: { d: string } } } }) => {
          const result = useMemo(() => {
            try { return a.b?.c?.d; } catch (e) { return 'none'; }
          }, [a]);
          return <div>{result}</div>;
        };
      `,
      errors: [avoid('a', 'a.b?.c?.d, a.b?.c')],
      output: `
        const MyComponent = ({ a }: { a: { b: { c?: { d: string } } } }) => {
          const result = useMemo(() => {
            try { return a.b?.c?.d; } catch (e) { return 'none'; }
          }, [a.b?.c?.d, a.b?.c]);
          return <div>{result}</div>;
        };
      `,
    },
    // Negative control: a single-link path is what the array already
    // dereferences, so no deferred position can shorten it further.
    {
      code: `
        const MyComponent = ({ user }: { user: { name: string } }) => {
          const greet = useCallback(() => {
            try { console.log(user.name); } catch (e) {}
          }, [user]);
          return <button onClick={greet}>Greet</button>;
        };
      `,
      errors: [avoid('user', 'user.name')],
      output: `
        const MyComponent = ({ user }: { user: { name: string } }) => {
          const greet = useCallback(() => {
            try { console.log(user.name); } catch (e) {}
          }, [user.name]);
          return <button onClick={greet}>Greet</button>;
        };
      `,
    },
  ],
});

// why (issue #1721): a member that resolves to a method is a reference to the
// *prototype's* function, which is the same value for every instance
// (`new Set().has === new Set().has`). Narrowing a dependency to `set.has`
// therefore pins a constant and the hook never invalidates again. Recognising
// that needs the type checker, so these cases carry the full typed-program
// parser configuration the shared JSX tester does not declare — the untyped
// suite above cannot exercise this branch at all and would pass vacuously.
const typedParserOptions = {
  ecmaVersion: 2020,
  sourceType: 'module',
  ecmaFeatures: { jsx: true },
  project: './tsconfig.json',
  tsconfigRootDir: path.join(__dirname, '..', '..'),
  createDefaultProgram: true,
} as const;

// why: the typed cases below are only meaningful if the type checker actually
// resolved something. Without `parserOptions.project` the parser hands the rule
// an isolated program in which `Set` — declared in lib.d.ts — resolves to no
// symbol at all, so the method carve-out cannot fire and the rule still narrows
// to `arrivalIds.has`. Asserting both halves on one snippet proves those cases
// pass because type information was available, not because the rule went quiet
// for some unrelated reason. The negative control also pins the gate itself: a
// consumer without `project` keeps the pre-existing behaviour exactly.
describe('no-entire-object-hook-deps method carve-out is type-driven (issue #1721)', () => {
  const setMethodSnippet = `
const Component = ({ arrivalIds, rows }: { arrivalIds: Set<string>; rows: { id: string }[] }) => {
  const visible = useMemo(() => {
    return rows.filter((row) => arrivalIds.has(row.id));
  }, [rows, arrivalIds]);
  return <div>{visible.length}</div>;
};
`;

  const lint = (parserOptions: Record<string, unknown>) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      tsParser as unknown as Linter.ParserModule,
    );
    linter.defineRule(
      'no-entire-object-hook-deps',
      noEntireObjectHookDeps as unknown as Parameters<Linter['defineRule']>[1],
    );
    return linter
      .verify(
        setMethodSnippet,
        {
          parser: '@typescript-eslint/parser',
          parserOptions,
          rules: { 'no-entire-object-hook-deps': 'error' },
        } as Linter.Config,
        'src/components/TypeDrivenProbe.tsx',
      )
      .filter((message) => message.ruleId === 'no-entire-object-hook-deps');
  };

  it('narrows a Set method to a prototype reference without type information', () => {
    const messages = lint({
      ecmaVersion: 2020,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.fix?.text).toBe('arrivalIds.has');
  });

  it('keeps the whole Set once the type of `has` resolves', () => {
    expect(lint(typedParserOptions)).toHaveLength(0);
  });
});

ruleTesterJsx.run('no-entire-object-hook-deps', noEntireObjectHookDeps, {
  valid: withParserOptions(typedParserOptions, [
    // Set.prototype.has — agora's ListNotifications.tsx:194 (arrivalIds).
    {
      filename: 'src/components/SetMethodDep.tsx',
      code: `
const Component = ({ arrivalIds, rows }: { arrivalIds: Set<string>; rows: { id: string }[] }) => {
  const visible = useMemo(() => {
    return rows.filter((row) => arrivalIds.has(row.id));
  }, [rows, arrivalIds]);
  return <div>{visible.length}</div>;
};
`,
    },
    // Map.prototype.get — agora's TeamsCarouselWrapper.tsx:68 (teamIndexMap).
    {
      filename: 'src/components/MapMethodDep.tsx',
      code: `
const Component = ({ teamIndexMap }: { teamIndexMap: Map<string, number> }) => {
  const renderHit = useCallback((id: string) => {
    return teamIndexMap.get(id) || 0;
  }, [teamIndexMap]);
  return <div>{renderHit('a')}</div>;
};
`,
    },
    // Function.prototype.call — agora's GliderComponent.tsx:167 (onLoad).
    {
      filename: 'src/components/FunctionCallDep.tsx',
      code: `
const Component = ({ onLoad }: { onLoad: (index: number) => void }) => {
  const handleLoad = useCallback((index: number) => {
    onLoad.call(null, index);
  }, [onLoad]);
  return <div>{handleLoad}</div>;
};
`,
    },
    // Function.prototype.bind / Function.prototype.apply are the same shared
    // reference as .call, so they must be treated identically.
    {
      filename: 'src/components/FunctionBindDep.tsx',
      code: `
const Component = ({ onSelect }: { onSelect: (id: string) => void }) => {
  const bound = useMemo(() => onSelect.bind(null), [onSelect]);
  return <div>{bound}</div>;
};
`,
    },
    {
      filename: 'src/components/FunctionApplyDep.tsx',
      code: `
const Component = ({ onSubmit }: { onSubmit: (id: string) => void }) => {
  const submit = useCallback((id: string) => {
    onSubmit.apply(null, [id]);
  }, [onSubmit]);
  return <div>{submit}</div>;
};
`,
    },
    // A user-defined class instance — agora's ListChronological.tsx:54
    // (relativeFormatter). The hand-maintained ARRAY_METHODS/STRING_METHODS
    // lists can never cover this; only the checker can.
    {
      filename: 'src/components/ClassMethodDep.tsx',
      code: `
class RelativeTimeFormatter {
  public format(value: number): string {
    return String(value);
  }
}
const Component = ({ relativeFormatter, value }: { relativeFormatter: RelativeTimeFormatter; value: number }) => {
  const label = useMemo(() => {
    return relativeFormatter.format(value);
  }, [relativeFormatter, value]);
  return <span>{label}</span>;
};
`,
    },
    // A method read without calling it is the same shared reference.
    {
      filename: 'src/components/UncalledMethodDep.tsx',
      code: `
const Component = ({ registry }: { registry: Map<string, number> }) => {
  const lookup = useMemo(() => {
    const read = registry.get;
    return read;
  }, [registry]);
  return <div>{lookup}</div>;
};
`,
    },
  ]),
  invalid: withParserOptions(typedParserOptions, [
    // Negative control: a plain data property must STILL narrow. Without this
    // the method carve-out would be indistinguishable from disabling the rule
    // whenever type information is available.
    {
      filename: 'src/components/DataPropertyDep.tsx',
      code: `
const Component = ({ user }: { user: { id: string; name: string } }) => {
  const label = useMemo(() => user.id, [user]);
  return <span>{label}</span>;
};
`,
      errors: [avoid('user', 'user.id')],
      output: `
const Component = ({ user }: { user: { id: string; name: string } }) => {
  const label = useMemo(() => user.id, [user.id]);
  return <span>{label}</span>;
};
`,
    },
    // Negative control: a nested data property on a typed object narrows too,
    // and a sibling dependency whose method is called keeps its whole object.
    {
      filename: 'src/components/MixedDep.tsx',
      code: `
const Component = ({ ids, user }: { ids: Set<string>; user: { id: string; name: string } }) => {
  const label = useMemo(() => {
    return ids.has(user.id) ? user.name : '';
  }, [ids, user]);
  return <span>{label}</span>;
};
`,
      errors: [avoid('user', 'user.id, user.name')],
      output: `
const Component = ({ ids, user }: { ids: Set<string>; user: { id: string; name: string } }) => {
  const label = useMemo(() => {
    return ids.has(user.id) ? user.name : '';
  }, [ids, user.id, user.name]);
  return <span>{label}</span>;
};
`,
    },
  ]),
});
