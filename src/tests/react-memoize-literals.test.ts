import { ruleTesterJsx } from '../utils/ruleTester';
import { reactMemoizeLiterals } from '../rules/react-memoize-literals';

ruleTesterJsx.run('react-memoize-literals', reactMemoizeLiterals, {
  valid: [
    {
      // Module-scope SCREAMING_SNAKE_CASE constant is NOT a component; the object
      // returned from its .map callback is created once at import, never per render.
      code: `
        const CHANNEL_OPTIONS = ['push', 'sms'].map((channel) => {
          return { value: channel, label: channel };
        });
        export { CHANNEL_OPTIONS };
      `,
    },
    {
      // Same shape with an inline array literal returned from the callback.
      code: `
        const MENU_ITEMS = ['a', 'b'].map((id) => {
          return [id, id];
        });
        export { MENU_ITEMS };
      `,
    },
    // Memoized references for objects, arrays, and functions
    {
      code: `
const EMPTY_ARRAY: string[] = [];

function UserProfile({ userId }) {
  const queryFn = useCallback(() => fetchUser(userId), [userId]);
  const queryKey = useMemo(() => ['user', userId], [userId]);
  const cacheOptions = useMemo(
    () => ({
      ttl: 60000,
      storage: { type: 'memory' },
    }),
    [],
  );
  const queryOptions = useMemo(
    () => ({
      staleTime: 5000,
      cacheOptions,
    }),
    [cacheOptions],
  );
  const userData = useQuery({
    queryKey,
    queryFn,
    options: queryOptions,
  });
  const [searchResults] = useState(EMPTY_ARRAY);
  return <ProfileDisplay data={userData} results={searchResults} />;
}
      `,
    },
    // Top-level hook arguments with primitives are allowed
    {
      code: `
function Component({ resolver }) {
  useForm({ mode: 'onBlur', resolver });
  return null;
}
      `,
    },
    // useState with top-level array literal (allowed)
    {
      code: `
function Component() {
  const [items] = useState([]);
  return <List items={items} />;
}
      `,
    },
    // useEffect callback literals are ignored
    {
      code: `
function Component({ dep }) {
  useEffect(() => {
    const settings = { enabled: true };
    return () => console.log(dep, settings.enabled);
  }, [dep]);
}
      `,
    },
    // Optional chaining on safe hooks should still skip literals
    {
      code: `
function Component({ dep, value }) {
  React?.useEffect(() => {
    const payload = { value };
    return () => console.log(dep, payload.value);
  }, [dep, value]);
}
      `,
    },
    // Optional chaining on useMemo callbacks should be ignored
    {
      code: `
function Component({ value }) {
  const memoized = hooks?.useMemo(() => ({ value }), [value]);
  return <div>{memoized?.value}</div>;
}
      `,
    },
    // useEffect callback wrapped in a type assertion is allowed
    {
      code: `
function Component({ dep }) {
  useEffect((() => {
    const payload = {};
    return () => console.log(payload, dep);
  }) as () => void, [dep]);
}
      `,
    },
    // Custom hook returning memoized value
    {
      code: `
function useSettings() {
  return useMemo(() => ({ theme: 'dark' }), []);
}
      `,
    },
    // Non-component function is out of scope
    {
      code: `
function helper() {
  const defaults = { enabled: true };
  return defaults.enabled;
}
      `,
    },
    // Object literal inside useMemo callback should be skipped
    {
      code: `
function Component({ value }) {
  const memoized = useMemo(() => ({ value }), [value]);
  return <div>{memoized.value}</div>;
}
      `,
    },
    // Custom hook returning identifier
    {
      code: `
function useFeatureToggle(enabled) {
  const state = useMemo(() => ({ enabled }), [enabled]);
  return state;
}
      `,
    },
    // Module-level constant usage
    {
      code: `
const DEFAULT_CONFIG = { mode: 'read-only' };
function Component() {
  const [config] = useState(DEFAULT_CONFIG);
  return <pre>{config.mode}</pre>;
}
      `,
    },
    // Hook argument uses identifiers only
    {
      code: `
function Component({ queryKey, resolver }) {
  useQuery({ queryKey, resolver });
  return null;
}
      `,
    },
    // Direct hook argument wrapped in assertion is allowed
    {
      code: `
function Component({ queryKey }) {
  useQuery({ queryKey } as const);
  return null;
}
      `,
    },
    // Direct hook argument wrapped in satisfies expression is allowed
    {
      code: `
type QueryOptions = { queryKey: string[] };
function Component({ queryKey }: { queryKey: string[] }) {
  useQuery({ queryKey } satisfies QueryOptions);
  return null;
}
      `,
    },
    // Inline JSX props handled by other rules; should not trigger here
    {
      code: `
function Component({ onClick }) {
  const handler = useCallback(() => onClick(), [onClick]);
  return <button onClick={handler}>Click</button>;
}
      `,
    },
    // useLatestCallback with nested literals
    {
      code: `
import useLatestCallback from 'use-latest-callback';
export const useReproduction = () => {
  const address = '0x123';
  const offchainTransfer = useLatestCallback(
    async () => {
      const offchainTokens = [
        {
          chainId: 'offchain',
          address,
        },
      ];
      throw new Error('test');
    }
  );
  return offchainTransfer;
};
      `,
    },
    // useDeepCompare hooks with literals
    {
      code: `
import { useDeepCompareMemo, useDeepCompareCallback, useDeepCompareEffect } from '@blumintinc/use-deep-compare';
const MyComponent = ({ params }) => {
  const result = useDeepCompareMemo(() => {
    return { data: params };
  }, [params]);
  const cb = useDeepCompareCallback(() => {
    console.log({ data: params });
  }, [params]);
  useDeepCompareEffect(() => {
    console.log({ data: params });
  }, [params]);
};
      `,
    },
    // useProgressionCallback with literals
    {
      code: `
export const useReproduction = () => {
  const cb = useProgressionCallback(() => {
    return { status: 'success' };
  }, []);
};
      `,
    },
    // useLatestCallback with Promise.all (Issue #1159)
    {
      code: `
function MyComponent() {
  const refreshUser = useLatestCallback(() => {
    const [, userWithClaims] = [
      current.reload(),
      mergeFetchedClaims(current),
    ];
    setUserInternal({ ...userWithClaims, _isFetchedFromRemote: true });
  });
  return null;
}
      `,
    },
    // async function boundaries
    {
      code: `
const MyComponent = () => {
  const handleAsync = useCallback(async () => {
    const data = { key: 'value' };
    await doSomething(data);
  }, []);
  return <button onClick={handleAsync}>Click</button>;
};
      `,
    },
    // Direct throw of object literal
    {
      code: `
function MyComponent({ isError }) {
  if (isError) {
    throw { message: 'Something went wrong', code: 'INTERNAL' };
  }
  return <div>Success</div>;
}
      `,
    },
    // Literal assigned to variable and then thrown
    {
      code: `
import { HttpsError } from '../../functions/src/util/errors/HttpsError';
import useLatestCallback from 'use-latest-callback';

export const useUserTransaction = () => {
  const fromPath = undefined;

  const getValidatedFromPath = useLatestCallback(() => {
    if (!fromPath) {
      const authError = new HttpsError({
        code: 'unauthenticated',
        message: 'User must be authenticated to create a transaction.',
        details: { userUid: 'guest' },
      });
      throw authError;
    }
    return fromPath;
  });
};
      `,
    },
    // Array literal thrown
    {
      code: `
function MyComponent({ isError }) {
  if (isError) {
    throw ['error1', 'error2'];
  }
  return <div>Success</div>;
}
      `,
    },
    // Inline function thrown
    {
      code: `
function MyComponent({ isError }) {
  if (isError) {
    throw () => new Error('thrown function');
  }
  return <div>Success</div>;
}
      `,
    },
    // Literal thrown in a terminal way from component body
    {
      code: `
        function Component() {
          const error = { message: 'error' };
          throw error;
        }
      `,
    },
    // Variable used only in a throw (terminal usage)
    {
      code: `
        function Component() {
          const err = { message: 'error' };
          throw err;
        }
      `,
    },
    // Conditional expression in throw path
    {
      code: `
        function Component({ condition }) {
          const error = condition ? { message: 'A' } : { message: 'B' };
          throw error;
        }
      `,
    },
    // Logical expression in throw path
    {
      code: `
        function Component({ condition }) {
          const error = condition || { message: 'Fallback' };
          throw error;
        }
      `,
    },
    // Direct throw with conditional expression
    {
      code: `
        function Component({ condition }) {
          throw condition ? { message: 'A' } : { message: 'B' };
        }
      `,
    },
    // MUI sx prop object literal should not be flagged (issue #1169)
    {
      code: `
import Stack from '@mui/material/Stack';

const Example = () => (
  <Stack
    sx={{
      backgroundColor: 'red',
      textWrap: 'nowrap',
    }}
  />
);
      `,
    },
    // standard style prop inline object is exempt
    {
      code: `
const Box = () => (
  <div style={{ display: 'flex', gap: 8 }} />
);
      `,
    },
    // sx on various MUI components
    {
      code: `
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const Card = () => (
  <Box sx={{ p: 2, borderRadius: 1 }}>
    <Typography sx={{ fontWeight: 700, color: 'primary.main' }}>
      Hello
    </Typography>
  </Box>
);
      `,
    },
    // sx with many properties
    {
      code: `
const Widget = () => (
  <div
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      p: 3,
      m: 1,
      borderRadius: 2,
      boxShadow: 3,
    }}
  />
);
      `,
    },
    // empty sx object is exempt
    {
      code: `
const Widget = () => <div sx={{}} />;
      `,
    },
    // style with multiple properties
    {
      code: `
const Overlay = () => (
  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%' }} />
);
      `,
    },
    // sx with a conditional (ternary) value — both branches are style objects
    {
      code: `
const Toggle = ({ active }) => (
  <div sx={active ? { color: 'red' } : { color: 'blue' }} />
);
      `,
    },
    // sx with a logical && fallback
    {
      code: `
const Highlight = ({ active }) => (
  <div sx={active && { fontWeight: 700 }} />
);
      `,
    },
    // sx with a logical || default
    {
      code: `
const Themed = ({ custom }) => (
  <div sx={custom || { p: 2 }} />
);
      `,
    },
    // sx as an array of style objects (supported by MUI)
    {
      code: `
const Stacked = () => (
  <div sx={[{ p: 2 }, { m: 1 }]} />
);
      `,
    },
    // sx array mixing a literal with a conditional style entry
    {
      code: `
const Stacked = ({ active }) => (
  <div sx={[{ p: 2 }, active && { color: 'red' }]} />
);
      `,
    },
    // sx object literal wrapped in an `as const` assertion
    {
      code: `
const Pinned = () => (
  <div sx={{ position: 'sticky', top: 0 } as const} />
);
      `,
    },
    // style with a conditional value
    {
      code: `
const Drawer = ({ open }) => (
  <div style={open ? { display: 'block' } : { display: 'none' }} />
);
      `,
    },
    // nested combination: ternary whose branches are an array and an object
    {
      code: `
const Variant = ({ stacked }) => (
  <div sx={stacked ? [{ p: 1 }, { m: 1 }] : { p: 2 }} />
);
      `,
    },
    // Issue #1280: a nested object literal inside a responsive inline sx value
    // must be exempt, just like the flat inline sx value already is. MUI
    // reprocesses the whole sx object subtree each render, so no nested part of
    // it benefits from referential stability.
    {
      code: `
const HostEventButton = () => {
  return (
    <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
      Host
    </Box>
  );
};
      `,
    },
    // Issue #1280 regression guard: deeply-nested style objects must be exempt.
    {
      code: `
const Panel = () => {
  return <Box sx={{ '& .child': { p: { xs: 1, md: 2 } } }} />;
};
      `,
    },
    // Issue #1280: nested object under a standard style prop is exempt too.
    {
      code: `
const Overlay = () => (
  <div style={{ inset: { top: 0, left: 0 } }} />
);
      `,
    },
    // Issue #1280: a nested object reached through a conditional sx branch is
    // still under the sx attribute, so it must be exempt.
    {
      code: `
const Toggle = ({ active }) => (
  <div sx={active ? { display: { xs: 'none', md: 'inline' } } : { display: 'flex' }} />
);
      `,
    },
    // Issue #1280: a nested object inside an sx array entry is exempt.
    {
      code: `
const Stacked = () => (
  <div sx={[{ p: 2 }, { display: { xs: 'none', md: 'inline' } }]} />
);
      `,
    },
    // Issue #1251: a hook returning an object literal whose members include a
    // JSX element (a "Portal") must NOT be flagged as hookReturnLiteral. A React
    // element is a fresh reference on every render by design, so the returned
    // object can never be stabilised by useMemo — same "no stability benefit"
    // rationale as the sx/style JSX-attribute exemption (#1169/#1108).
    // Shorthand property referencing a local JSX binding.
    {
      code: `
export function useWidget() {
  const Portal = <div />;
  return { Portal };
}
      `,
    },
    // Realistic shape: stable callback + primitive + JSX Portal, returned as const.
    {
      code: `
import { useCallback } from 'react';
export function useThing({ id }) {
  const onClick = useCallback(() => id, [id]);
  const Portal = <span>{id}</span>;
  return { onClick, Portal } as const;
}
      `,
    },
    // Inline JSX-valued property.
    {
      code: `
export function useDialog() {
  return { Portal: <div /> };
}
      `,
    },
    // Inline JSX fragment value.
    {
      code: `
export function useDrawer() {
  return { Portal: <></> };
}
      `,
    },
    // Shorthand referencing a local JSX fragment binding.
    {
      code: `
export function useSnackbarAlert() {
  const Portal = <>alert</>;
  return { Portal };
}
      `,
    },
    // Canonical BluMint Portal-hook pattern: memoized callback + JSX Portal.
    {
      code: `
import { useCallback } from 'react';
export function useGuardFlow() {
  const guard = useCallback(() => true, []);
  const Portal = <div />;
  return { guard, Portal } as const;
}
      `,
    },
    // JSX Portal alongside plain-data members is still exempt (the JSX member
    // alone makes the whole object non-stabilisable).
    {
      code: `
import { useCallback } from 'react';
export function useErrorAlert() {
  const catchError = useCallback(() => {}, []);
  const Portal = <div />;
  return { catchError, Portal, retries: 0 };
}
      `,
    },
    // Array literal returned from a hook containing an inline JSX element.
    {
      code: `
export function usePortals() {
  return [<div />];
}
      `,
    },
    // Array literal mixing a JSX binding and an inline JSX element.
    {
      code: `
export function useMixedPortals() {
  const Portal = <div />;
  return [Portal, <span />];
}
      `,
    },
    // Concise-arrow hook (non-block body) returning object with inline JSX.
    // Tests the ArrowFunctionExpression concise-body path in isReturnValueFromHook.
    {
      code: `
const usePanel = () => ({ Portal: <section /> });
      `,
    },
    // JSX value wrapped in TS assertion — unwrapNestedExpressions must strip
    // the assertion before isJSXNode sees the JSXElement.
    {
      code: `
export function useAlert() {
  return { Portal: <div /> as unknown };
}
      `,
    },
    // Iteration-method callbacks are invoked synchronously during render and
    // discarded; their identity is never observed, so they must not be flagged.
    // (issue #1290)
    //
    // Idiomatic list render — the .map callback's identity is never observed.
    {
      code: `
        const List = ({ items }) => (
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      `,
    },
    // Block-body map callback returning JSX.
    {
      code: `
        const Picker = ({ presets, labels }) => (
          <ul>
            {presets.map((preset) => {
              const label = labels[preset];
              return <li key={preset}>{label}</li>;
            })}
          </ul>
        );
      `,
    },
    // Chained iteration callbacks (.filter then .map) are equally safe.
    {
      code: `
        const Filtered = ({ items }) => (
          <ul>
            {items
              .filter((item) => item.active)
              .map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
          </ul>
        );
      `,
    },
    // .forEach callback with a block body and side effects.
    {
      code: `
        const Logger = ({ items }) => {
          items.forEach((item) => {
            trackImpression(item);
          });
          return null;
        };
      `,
    },
    // .reduce callback (two-argument form) is exempt too.
    {
      code: `
        const Summary = ({ items }) => {
          const total = items.reduce((sum, item) => sum + item.value, 0);
          return <span>{total}</span>;
        };
      `,
    },
    // .sort comparator inside a component is a synchronously-invoked callback.
    {
      code: `
        const Sorted = ({ items }) => (
          <ul>
            {items
              .sort((a, b) => a.rank - b.rank)
              .map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
          </ul>
        );
      `,
    },
    // Issue #1319: an object/array literal RETURNED FROM (or created directly
    // inside) an Array iteration-method callback must not be flagged. The
    // memoizable unit is the enclosing `.map()` CallExpression, not the inner
    // literal — `const tabs = useMemo(() => arr.map(...), [arr])`. useMemo can't
    // run per-iteration inside a .map loop, and a per-iteration object closing
    // over the callback param can't be hoisted to module scope, so the rule's
    // remediation is unfollowable at the literal node.
    //
    // Block-body map callback returning an object literal.
    {
      code: `
        const StreamSettingsLayout = () => {
          const tabs = TAB_PANES.map(({ value, customization }) => {
            return { value, customization };
          });
          return <TabsRouted tabs={tabs} />;
        };
      `,
    },
    // Concise-body map callback returning an object literal.
    {
      code: `
        const ComponentA = () => {
          const tabs = TAB_PANES.map(({ value }) => ({ value }));
          return <TabsRouted tabs={tabs} />;
        };
      `,
    },
    // Block-body map callback returning an array literal.
    {
      code: `
        const ComponentB = () => {
          const rows = ITEMS.map((value) => {
            return [value, value];
          });
          return <TabsRouted tabs={rows} />;
        };
      `,
    },
    // Map callback inline inside JSX, returning an object literal (as const).
    {
      code: `
        const List = () => {
          return (
            <Tabs tabs={PANES.map(({ value, customization }) => {
              return { value, customization } as const;
            })} />
          );
        };
      `,
    },
    // #1319: concise-body map callback returning an array literal.
    {
      code: `
        const Rows = () => {
          const rows = ITEMS.map((v) => [v, v * 2]);
          return <List rows={rows} />;
        };
      `,
    },
    // #1319: nested .map inside .map — the inner object literal's nearest
    // enclosing function is the inner iteration callback, so it is exempt.
    {
      code: `
        const Grid = ({ rows }) => {
          const cells = rows.map((row) => row.map((cell) => ({ value: cell })));
          return <Table cells={cells} />;
        };
      `,
    },
    // #1319: .flatMap callback returning an array literal is exempt.
    {
      code: `
        const Flat = ({ groups }) => {
          const all = groups.flatMap((group) => [group.id, group.name]);
          return <List items={all} />;
        };
      `,
    },
    // #1319: an object literal built inside a .filter predicate body is exempt.
    {
      code: `
        const Active = ({ items }) => {
          const filtered = items.filter((item) => {
            const meta = { active: item.active };
            return meta.active;
          });
          return <List items={filtered} />;
        };
      `,
    },
    // #1319: an object literal constructed inside a .forEach side effect is exempt.
    {
      code: `
        const Tracker = ({ items }) => {
          items.forEach((item) => {
            logEvent({ id: item.id, type: 'view' });
          });
          return null;
        };
      `,
    },
    // #1319: a .reduce callback returning an object literal accumulator is exempt
    // (the seed is a module-level identifier, so only the returned literal is at
    // issue, and its nearest enclosing function is the reduce callback).
    {
      code: `
        const Grouped = ({ items }) => {
          const grouped = items.reduce((acc, item) => {
            return { ...acc, [item.id]: item };
          }, INITIAL_GROUPS);
          return <View data={grouped} />;
        };
      `,
    },
    // #1319: deeply nested object literals inside the mapped object are all
    // exempt — every one's nearest enclosing function is the map callback.
    {
      code: `
        const Deep = ({ items }) => {
          const rows = items.map((item) => ({
            meta: { id: item.id, nested: { deep: true } },
          }));
          return <Table rows={rows} />;
        };
      `,
    },
    // Issue #1329: an object literal passed ONLY as an argument to a plain
    // synchronous call whose primitive result is consumed immediately (here a
    // boolean feeding a ternary test) never crosses a memoization boundary, so
    // it must NOT be flagged.
    {
      code: `
    function isMutable({
      isOpen,
      isContinuous,
    }: {
      isOpen: boolean;
      isContinuous: boolean;
    }) {
      return isOpen || isContinuous;
    }
    const Component = ({
      isOpen,
      isContinuous,
    }: {
      isOpen: boolean;
      isContinuous: boolean;
    }) => {
      const isQueueMutable = isMutable({ isOpen, isContinuous });
      return isQueueMutable ? <button /> : null;
    };
  `,
    },
    // #1329: inline call result used directly as a ternary test, no variable.
    {
      code: `
        const Component = ({ isOpen }) => {
          return isMutable({ isOpen }) ? <button /> : null;
        };
      `,
    },
    // #1329: call result negated in an if-test.
    {
      code: `
        const Component = ({ isOpen }) => {
          if (!isMutable({ isOpen })) return null;
          return <button />;
        };
      `,
    },
    // #1329: call result compared (=== 0) through an intermediate variable.
    {
      code: `
        const Component = ({ isOpen }) => {
          const n = count({ isOpen });
          return n === 0 ? <a /> : <b />;
        };
      `,
    },
    // #1329: array literal argument whose call result is consumed as a boolean.
    {
      code: `
        const Component = ({ isOpen }) => {
          const empty = isEmpty([1, 2]);
          return empty ? <a /> : <b />;
        };
      `,
    },
    // #1329: inline call result used directly as a while-test.
    {
      code: `
        const Component = ({ isOpen }) => {
          while (check({ isOpen })) {
            doWork();
          }
          return null;
        };
      `,
    },
    // #1329: call result feeding a logical chain that lands in a ternary test.
    {
      code: `
        const Component = ({ isOpen, other }) => {
          return (isMutable({ isOpen }) || other) ? <a /> : <b />;
        };
      `,
    },
    // #1329: call result compared inline (no variable).
    {
      code: `
        const Component = ({ isOpen }) => {
          return count({ isOpen }) > 0 ? <a /> : null;
        };
      `,
    },
    // #1329: argument wrapped in an as-const assertion, result in a ternary test.
    {
      code: `
        const Component = ({ isOpen }) => {
          const flag = check({ isOpen } as const);
          return flag ? <a /> : null;
        };
      `,
    },
    // #1347: a jest.mock() factory is not a render body. The test double is
    // never rendered by React, and jest's out-of-scope-variable restriction
    // makes both suggested remediations (module constant / imported useMemo)
    // unavailable, so the rule has no satisfiable form here.
    {
      code: `
        const mockRankedTeamIds = jest.fn();
        jest.mock('../../contexts/BracketSeedsContext', () => {
          return {
            useBracketSeeds: () => {
              return { rankedTeamIds: mockRankedTeamIds() };
            },
          };
        });
      `,
    },
    // #1347: same shape, generalized — a use*-keyed property nested inside an
    // arbitrary non-component callback is not a hook.
    {
      code: `
        registerModule('some/module', () => {
          return {
            useThing: () => {
              return { value: compute() };
            },
          };
        });
      `,
    },
    // #1347: hoisting the literal to a local inside a mock factory must not
    // trip the "New object literal inside hook" messageId either.
    {
      code: `
        const mockRankedTeamIds = jest.fn();
        jest.mock('../../contexts/BracketSeedsContext', () => {
          return {
            useBracketSeeds: () => {
              const value = { rankedTeamIds: mockRankedTeamIds() };
              return value;
            },
          };
        });
      `,
    },
    // #1347: the mock's hook is a local binding rather than an inline property
    // value, so only the jest-factory carve-out can clear it.
    {
      code: `
        jest.mock('./ctx', () => {
          const useThing = () => ({ a: 1 });
          return { useThing };
        });
      `,
    },
    // #1347: jest.doMock factories are module factories too.
    {
      code: `
        jest.doMock('./ctx', () => ({
          useThing: () => {
            return { a: 1 };
          },
        }));
      `,
    },
    // #1347: jest.setMock factories are module factories too.
    {
      code: `
        jest.setMock('./ctx', () => ({
          useThing: () => {
            return { a: 1 };
          },
        }));
      `,
    },
    // #1347: a factory written as a function expression with a block body.
    {
      code: `
        jest.mock('./ctx', function () {
          return {
            useThing: () => {
              return { a: 1 };
            },
          };
        });
      `,
    },
    // #1347: an ES-module-shaped mock nests the hook under `default`.
    {
      code: `
        jest.mock('./x', () => ({
          __esModule: true,
          default: {
            useThing: () => {
              return { a: 1 };
            },
          },
        }));
      `,
    },
    // #1347: a mocked component inside a factory follows the componentLiteral
    // path and is exempt for the same reason.
    {
      code: `
        jest.mock('./Foo', () => ({
          Foo: () => {
            const s = { a: 1 };
            return s;
          },
        }));
      `,
    },
    // #1347: object-method shorthand keyed with a hook name inside a factory
    // callback is not a hook either.
    {
      code: `
        registerModule('m', () => ({
          useThing() {
            return { a: 1 };
          },
        }));
      `,
    },
    // #1347: a component-named property key inside a factory callback is not a
    // component.
    {
      code: `
        registerModule('m', () => ({
          Widget: () => {
            return { a: 1 };
          },
        }));
      `,
    },
    // #1347: the factory callback may be nested several callbacks deep.
    {
      code: `
        describe('x', () => {
          beforeEach(() => {
            const m = {
              useThing: () => {
                return { a: 1 };
              },
            };
          });
        });
      `,
    },
    // #1329 follow-up: the fix's own real-world motivating shape. A boolean-returning
    // plain call's result feeds an object member AND a hook dependency array — neither
    // is a primitive-test position, so isPrimitivelyConsumed returns false and the
    // ARGUMENT literal is still reported. The boolean result cannot carry the literal's
    // reference, so its identity never reaches a memoization boundary.
    {
      code: `
        function isMutable({ isOpen, isContinuous }) {
          return isOpen || isContinuous;
        }
        const useSeeding = ({ isOpen, isContinuous, matchId }) => {
          const isSeedingMutable = isMutable({ isOpen, isContinuous });
          return useDeepCompareMemo(() => {
            return { matchId, isSeedingMutable };
          }, [matchId, isSeedingMutable]);
        };
      `,
    },
    // #1329 follow-up: same call, result simply returned. Returning a boolean cannot
    // expose the argument literal's identity to any caller.
    {
      code: `
        function isMutable({ isOpen }) {
          return !!isOpen;
        }
        const useReturned = ({ isOpen }) => {
          return isMutable({ isOpen });
        };
      `,
    },
    // #1349: an explicit primitive return annotation proves the result cannot
    // carry the argument, even though the parameter is a whole binding.
    {
      code: `
        function check(o): boolean {
          return !!o;
        }
        const useThing = ({ isOpen }) => {
          const flag = check({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
    },
    // #1349: an arrow callee with an expression body is classified from that
    // expression.
    {
      code: `
        const isMutable = ({ isOpen }) => !!isOpen;
        const useThing = ({ isOpen }) => {
          const flag = isMutable({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
    },
    // #1349: a union of primitives is still primitive.
    {
      code: `
        function label({ isOpen }): string | number {
          return isOpen ? 'on' : 0;
        }
        const useThing = ({ isOpen }) => {
          const l = label({ isOpen });
          return useMemo(() => ({ l }), [l]);
        };
      `,
    },
    // #1349: a self-recursive callee terminates — a returned call classifies as
    // indeterminate rather than being followed.
    {
      code: `
        function walk({ depth }) {
          if (depth <= 0) return 0;
          return walk({ depth: depth - 1 });
        }
        const useThing = ({ depth }) => {
          const d = walk({ depth });
          return useMemo(() => ({ d }), [d]);
        };
      `,
    },
    // #1349: mutually recursive callees terminate for the same reason.
    {
      code: `
        function even({ n }) {
          if (n === 0) return true;
          return odd({ n: n - 1 });
        }
        function odd({ n }) {
          if (n === 0) return false;
          return even({ n: n - 1 });
        }
        const useThing = ({ n }) => {
          const e = even({ n });
          return useMemo(() => ({ e }), [e]);
        };
      `,
    },
    // #1349: a hoisted function declaration resolves even when it appears after
    // the consumer.
    {
      code: `
        const useThing = ({ isOpen }) => {
          const flag = isMutable({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
        function isMutable({ isOpen }) {
          return !!isOpen;
        }
      `,
    },
    // #1349: leaking a destructured PROPERTY out of the callee is harmless — the
    // argument literal's own identity stays inside the call.
    {
      code: `
        function record({ isOpen }) {
          globalThis.lastIsOpen = isOpen;
          return !!isOpen;
        }
        const useThing = ({ isOpen }) => {
          const flag = record({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
    },
    // #1349: an unclassifiable return is safe when no return expression can
    // syntactically reach a whole-parameter binding.
    {
      code: `
        function stamp({ isOpen }) {
          return computeGlobal(isOpen);
        }
        const useThing = ({ isOpen }) => {
          const s = stamp({ isOpen });
          return useMemo(() => ({ s }), [s]);
        };
      `,
    },
    // #1349: the nearest binding wins — a block-scoped primitive callee shadows
    // an outer object-returning one of the same name.
    {
      code: `
        function check(o) {
          return { o };
        }
        {
          function check({ isOpen }) {
            return !!isOpen;
          }
          const useThing = ({ isOpen }) => {
            const flag = check({ isOpen });
            return useMemo(() => ({ flag }), [flag]);
          };
        }
      `,
    },
    // #1349: a callee with an empty body falls off the end, yielding undefined.
    {
      code: `
        function noop({ isOpen }) {}
        const useThing = ({ isOpen }) => {
          const r = noop({ isOpen });
          return useMemo(() => ({ r }), [r]);
        };
      `,
    },
    // #1349: a type-predicate annotation is a boolean at runtime.
    {
      code: `
        function isThing(o): o is Thing {
          return true;
        }
        const useThing = ({ isOpen }) => {
          const flag = isThing({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
    },
    // #1349: array literal arguments qualify for the same exemption.
    {
      code: `
        function total({ length }) {
          return length;
        }
        const useThing = ({ isOpen }) => {
          const n = total([isOpen]);
          return useMemo(() => ({ n }), [n]);
        };
      `,
    },
  ],
  invalid: [
    // #1329 provided case: the useEffect dep-array literal and the JSX-prop
    // literal both cross a memoization boundary and must STILL fire (2 errors).
    {
      code: `
    const Component = ({ isOpen }) => {
      useEffect(() => {}, [{ isOpen }]);
      return <Child config={{ isOpen }} />;
    };
  `,
      errors: 2,
    },
    // #1329 over-correction guard: call result flows to a JSX prop → still flagged.
    {
      code: `
        const Component = ({ isOpen }) => {
          const cfg = build({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1329 over-correction guard: inline arg whose call result feeds a JSX
    // attribute directly → still flagged (the callee observes the reference).
    {
      code: `
        const Component = () => {
          return <Box sx={combine({ color: 'red' })} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1329 over-correction guard: call result used in a hook dependency array
    // → still flagged (identity crosses a memoization boundary).
    {
      code: `
        const Component = ({ isOpen }) => {
          const x = build({ isOpen });
          useEffect(() => {}, [x]);
          return null;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1329 over-correction guard: member call (callee is a MemberExpression)
    // → still flagged even though the result is consumed primitively.
    {
      code: `
        const Component = ({ isOpen }) => {
          const x = utils.check({ isOpen });
          return x ? <a /> : null;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1329 over-correction guard: call result returned directly (escapes) →
    // still flagged.
    {
      code: `
        const Component = ({ isOpen }) => {
          return build({ isOpen });
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1329 over-correction guard: bare call statement (result unused) → still
    // flagged, since dead results can't be proven primitive.
    {
      code: `
        const Component = ({ isOpen }) => {
          build({ isOpen });
          return null;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: an imported callee hides its implementation,
    // so nothing proves the result cannot carry the reference.
    {
      code: `
        import { isMutable } from './isMutable';
        const useThing = ({ isOpen }) => {
          const flag = isMutable({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: an unresolvable global callee is equally
    // opaque.
    {
      code: `
        const useThing = ({ isOpen }) => {
          const flag = globalIsMutable({ isOpen });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: an identity callee hands the argument's own
    // reference straight back onto a JSX prop.
    {
      code: `
        function identity(o) {
          return o;
        }
        const Component = ({ isOpen }) => {
          const cfg = identity({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: wrapping the parameter in a fresh object
    // still carries the reference out.
    {
      code: `
        function wrap(o) {
          return { inner: o };
        }
        const Component = ({ isOpen }) => {
          const cfg = wrap({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: a union containing an object type is not
    // primitive.
    {
      code: `
        function pick({ isOpen }): boolean | Config {
          return isOpen;
        }
        const useThing = ({ isOpen }) => {
          const p = pick({ isOpen });
          return useMemo(() => ({ p }), [p]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: an async callee hands back a promise object.
    {
      code: `
        async function loadIt({ isOpen }) {
          return !!isOpen;
        }
        const useThing = ({ isOpen }) => {
          const p = loadIt({ isOpen });
          return useMemo(() => ({ p }), [p]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: a generator callee hands back an iterator
    // object.
    {
      code: `
        function* streamIt({ isOpen }) {
          yield !!isOpen;
        }
        const useThing = ({ isOpen }) => {
          const g = streamIt({ isOpen });
          return useMemo(() => ({ g }), [g]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: a callee binding reassigned after
    // initialization may hold a different function when the call runs.
    {
      code: `
        let pick = ({ isOpen }) => !!isOpen;
        pick = (o) => o;
        const Component = ({ isOpen }) => {
          const cfg = pick({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: `arguments` exposes the raw argument list
    // even when every parameter is destructured.
    {
      code: `
        function sneaky({ isOpen }) {
          return arguments[0];
        }
        const Component = ({ isOpen }) => {
          const cfg = sneaky({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: a rest parameter is a whole-parameter
    // binding, so returning an element of it escapes.
    {
      code: `
        function grab(...rest) {
          return rest[0];
        }
        const Component = ({ isOpen }) => {
          const cfg = grab({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 deliberate conservatism: a callee returning a FRESH object makes the
    // result genuinely unstable, and the argument report is the only signal the
    // rule emits for it, so the exemption stays off.
    {
      code: `
        function build({ isOpen }) {
          return { isOpen };
        }
        const useThing = ({ isOpen }) => {
          const cfg = build({ isOpen });
          return useMemo(() => ({ cfg }), [cfg]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349: the exemption covers only the argument itself — a literal NESTED
    // inside an exempt argument is still reported (one error, not two).
    {
      code: `
        function isMutable({ isOpen }) {
          return !!isOpen;
        }
        const useThing = ({ isOpen }) => {
          const flag = isMutable({ isOpen, nested: { deep: true } });
          return useMemo(() => ({ flag }), [flag]);
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: a parameter shadowing an outer primitive
    // callee hides the implementation actually invoked.
    {
      code: `
        function check({ isOpen }) {
          return !!isOpen;
        }
        const Component = ({ isOpen, check }) => {
          const cfg = check({ isOpen });
          return <Child config={cfg} />;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // #1349 over-correction guard: shadowing in the other direction — a
    // block-scoped object-returning callee wins over an outer primitive one.
    {
      code: `
        function check({ isOpen }) {
          return !!isOpen;
        }
        {
          function check(o) {
            return { o };
          }
          const Component = ({ isOpen }) => {
            const cfg = check({ isOpen });
            return <Child config={cfg} />;
          };
        }
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // REGRESSION GUARD — the SCREAMING_SNAKE_CASE fix must NOT over-correct: a
    // real PascalCase component that builds an object literal in its body must
    // STILL report componentLiteral.
    {
      code: `
        export const MyComponent = () => {
          const style = { color: 'red' };
          return style;
        };
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // Variable with no usages (dead code) - should still be reported as unmemoized
    {
      code: `
        function Component() {
          const err = { message: 'unused' };
        }
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // Variable with multiple usages where only some are terminal (should NOT be exempt)
    {
      code: `
        function Component() {
          const err = { code: 'ERR' };
          useEffect(() => console.log(err), [err]);
          throw err;
        }
      `,
      errors: [{ messageId: 'componentLiteral' }],
    },
    // Literal nested in an expression that is assigned and thrown (should NOT be
    // exempt). The array literal and its nested object literal are still flagged
    // even though the result is thrown; the `.map` callback `i => i` is exempt as
    // a synchronously-invoked iteration callback (issue #1290), so 2 errors.
    {
      code: `
        function Component() {
          const x = [
            { a: 1 }
          ].map(i => i);
          throw x;
        }
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
    // Literal thrown inside nested function is NOT terminal for component
    {
      code: `
        function Component() {
          const error = { message: 'error' };
          const callback = () => {
            throw error;
          };
          return <button onClick={callback}>Throw</button>;
        }
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
    // Component-level object literal
    {
      code: `
function UserProfile() {
  const defaultConfig = { enabled: true };
  return <div>{defaultConfig.enabled ? 'Enabled' : 'Disabled'}</div>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "UserProfile"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Suggestions wrap literals and include dependency placeholder
    {
      code: `
function Component() {
  const options = { debounce: 50 };
  return <div>{options.debounce}</div>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "Component"',
            memoHook: 'useMemo',
          },
          suggestions: [
            {
              messageId: 'memoizeLiteralSuggestion',
              output:
                '\n' +
                'function Component() {\n' +
                '  const options = useMemo(() => ({ debounce: 50 }), [/* __TODO_MEMOIZATION_DEPENDENCIES__ */]);\n' +
                '  return <div>{options.debounce}</div>;\n' +
                '}\n' +
                '      ',
            },
          ],
        },
      ],
    },
    // Suggestions for inline function include dependency placeholder comment
    {
      code: `
function Component({ onClick }) {
  const handleClick = () => onClick();
  return <button onClick={handleClick}>Click</button>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Component"',
            memoHook: 'useCallback',
          },
          suggestions: [
            {
              messageId: 'memoizeLiteralSuggestion',
              output:
                '\n' +
                'function Component({ onClick }) {\n' +
                '  const handleClick = useCallback(() => onClick(), [/* __TODO_MEMOIZATION_DEPENDENCIES__ */]);\n' +
                '  return <button onClick={handleClick}>Click</button>;\n' +
                '}\n' +
                '      ',
            },
          ],
        },
      ],
    },
    // Component-level array literal
    {
      code: `
const Component = () => {
  const items = [];
  return <List items={items} />;
};
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'array literal',
            context: 'component "Component"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Component-level inline function
    {
      code: `
function Dashboard({ userId }) {
  const load = () => fetchUser(userId);
  return <button onClick={load}>Load</button>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Dashboard"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Non-hook literal used only for computation still flags
    {
      code: `
function Component({ condition }) {
  const defaults = { enabled: true };
  const isEnabled = defaults.enabled && condition;
  return <div>{isEnabled ? 'On' : 'Off'}</div>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "Component"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Function declaration literal inside component
    {
      code: `
function Component({ userId }) {
  function load() {
    return fetchUser(userId);
  }
  return <button onClick={load}>Load</button>;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Component"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Nested component declaration should not be skipped
    {
      code: `
function Component() {
  function InnerComponent() {
    return <div />;
  }
  return <InnerComponent />;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Component"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Nested objects in hook argument
    {
      code: `
function Component() {
  const userKey = getUserKey();
  const queryKey = userKey;
  useQuery({
    queryKey,
    options: {
      staleTime: 5000,
      storage: { type: 'memory' },
    },
  });
}
      `,
      errors: [
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useQuery',
          },
        },
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useQuery',
          },
        },
      ],
    },
    // Nested function in hook argument
    {
      code: `
function Component({ userId }) {
  const queryKey = buildQueryKey(userId);
  useQuery({
    queryKey,
    queryFn: () => fetchUser(userId),
  });
}
      `,
      errors: [
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'inline function',
            hookName: 'useQuery',
          },
        },
      ],
    },
    // Nested array in hook argument
    {
      code: `
function Component() {
  useData({
    defaults: [1, 2, 3],
  });
}
      `,
      errors: [
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'array literal',
            hookName: 'useData',
          },
        },
      ],
    },
    // Custom hook returning object literal
    {
      code: `
function useUserSettings() {
  return { theme: 'dark' };
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useUserSettings',
          },
        },
      ],
    },
    // Hook return with TS wrappers should still report as hook return
    {
      code: `
const useFlags = () => ({ enabled: true } as const);
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useFlags',
          },
        },
      ],
    },
    // Hook return wrapped in assertion inside block body should be treated as hook return
    {
      code: `
function useSettings() {
  return { theme: 'dark' } as const;
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useSettings',
          },
        },
      ],
    },
    // Hook return wrapped in satisfies and non-null assertions inside block body
    {
      code: `
type Settings = { theme: string };
function useTypedSettings() {
  return ({ theme: 'dark' } satisfies Settings)!;
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useTypedSettings',
          },
        },
      ],
    },
    // Regression guard (#1251): a hook returning a plain array literal with no
    // JSX members is fully stabilisable and must STAY flagged.
    {
      code: `
function useIds() {
  return [1, 2, 3];
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'array literal',
            hookName: 'useIds',
          },
        },
      ],
    },
    // Regression guard (#1251): shorthand property whose binding is NOT a JSX
    // element must still be flagged — the guard must not over-exempt.
    {
      code: `
function useTheme() {
  const Portal = 'dark';
  return { Portal };
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useTheme',
          },
        },
      ],
    },
    // Regression guard (#1251): plain-data object return from a hook — must
    // still fire even when property names superficially resemble JSX patterns.
    {
      code: `
function usePortalConfig() {
  return { portalId: 'main', enabled: true };
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'usePortalConfig',
          },
        },
      ],
    },
    // Regression guard (#1251): concise-arrow hook returning plain object with
    // no JSX must still be reported.
    {
      code: `
const useConfig = () => ({ theme: 'dark', mode: 'auto' });
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useConfig',
          },
        },
      ],
    },
    // Literal returned from nested function inside hook should not be treated as a hook return
    {
      code: `
function useValue() {
  const getValue = () => {
    return { value: 42 };
  };
  return getValue;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'hook "useValue"',
            memoHook: 'useCallback',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'hook "useValue"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Named function expression component passed to HOC should be detected
    {
      code: `
const Memoized = memo(function MyComponent({ onClick }) {
  const handler = () => onClick();
  const options = { debounce: 100 };
  return <button onClick={handler}>{options.debounce}</button>;
});
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "MyComponent"',
            memoHook: 'useCallback',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Anonymous component wrapped in HOC should still be detected
    {
      code: `
const Memoized = memo(() => {
  const handler = () => doWork();
  const options = { debounce: 50 };
  return <button onClick={handler}>{options.debounce}</button>;
});
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Memoized"',
            memoHook: 'useCallback',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "Memoized"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Name resolution should pass through satisfies/non-null wrappers
    {
      code: `
type FC<P = {}> = (props: P) => unknown;

const Memoized = (memo(() => {
  const handler = () => doWork();
  const options = { debounce: 50 } as const;
  return <button onClick={handler}>{options.debounce}</button>;
})) satisfies FC;

const MemoizedNonNull = (memo(() => {
  const handler = () => doWork();
  const options = { debounce: 75 };
  return <button onClick={handler}>{options.debounce}</button>;
}))!;
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Memoized"',
            memoHook: 'useCallback',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "Memoized"',
            memoHook: 'useMemo',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "MemoizedNonNull"',
            memoHook: 'useCallback',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MemoizedNonNull"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Custom hook returning array literal
    {
      code: `
const useIds = () => [1, 2, 3];
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'array literal',
            hookName: 'useIds',
          },
        },
      ],
    },
    // Custom hook returning object with nested function
    {
      code: `
function useActions() {
  return {
    onSave: () => persist(),
  };
}
      `,
      errors: [
        {
          messageId: 'hookReturnLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useActions',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'hook "useActions"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Inline function argument in component body
    {
      code: `
function Component({ logger }) {
  logEvent(() => logger('clicked'));
  return null;
}
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "Component"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Nested literals under hook with multiple layers
    {
      code: `
function Component() {
  useForm({
    defaultValues: {
      settings: {
        notifications: { email: true },
      },
    },
  });
}
      `,
      errors: [
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useForm',
          },
        },
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useForm',
          },
        },
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useForm',
          },
        },
      ],
    },
    // Optional chaining on hook calls still reports nested literals
    {
      code: `
function Component() {
  const client = getClient();
  client?.useQuery({
    queryKey: ['user'],
    options: { staleTime: 5000 },
  });
}
      `,
      errors: [
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'array literal',
            hookName: 'useQuery',
          },
        },
        {
          messageId: 'nestedHookLiteral',
          data: {
            literalType: 'object literal',
            hookName: 'useQuery',
          },
        },
      ],
    },
    // Unmemoized async function in component
    {
      code: `
const MyComponent = () => {
  const handleAsync = async () => {
    console.log('async');
  };
  return <button onClick={handleAsync}>Click</button>;
};
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "MyComponent"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // REGRESSION GUARD: non-style prop object literal must still be reported
    {
      code: `
const MyComponent = () => (
  <SomeComponent data={{ id: 1, label: 'hello' }} />
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: config prop object literal must still be reported
    {
      code: `
const MyComponent = ({ id }) => (
  <Chart config={{ type: 'bar', responsive: true }} />
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: options prop object literal must still be reported
    {
      code: `
const MyComponent = () => (
  <DatePicker options={{ format: 'yyyy-MM-dd' }} />
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: an object literal passed to a function call still reports
    // even when the call result feeds sx — the callee observes the reference.
    {
      code: `
const MyComponent = ({ active }) => (
  <div sx={makeSx({ color: 'red' })} />
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: an object literal as a JSX child expression (container
    // parent is the element, not a style attribute) still reports.
    {
      code: `
const MyComponent = () => (
  <div>{{ a: 1 }}</div>
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: array/object literals under a non-style prop still report
    // (the array is the direct value of `data`, and its element is nested within).
    {
      code: `
const MyComponent = () => (
  <SomeComponent data={[{ id: 1 }]} />
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'array literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // Scope control (#1290): the .map callback itself is exempt, but an inline
    // function passed as a JSX-attribute prop *inside* the callback body is a
    // separate node whose identity IS observed by the child, so it stays
    // flagged. Only the onClick handler is reported, not the map callback.
    {
      code: `
const List = ({ items, onSelect }) => (
  <ul>
    {items.map((item) => (
      <li key={item.id} onClick={() => onSelect(item.id)}>{item.name}</li>
    ))}
  </ul>
);
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'inline function',
            context: 'component "List"',
            memoHook: 'useCallback',
          },
        },
      ],
    },
    // Scope control (#1319 regression guard): the iteration exemption must key
    // on the NEAREST enclosing function, not any ancestor. Here two nodes stay
    // flagged, and the .map callback itself remains exempt (#1290):
    //   1. the onClick inline function `() => handle(...)` — its NEAREST
    //      enclosing function is itself (not the .map callback), and its
    //      identity is observed by the child, so it stays flagged (mirrors the
    //      #1290 "nested JSX-attribute callback still flagged" guard); and
    //   2. the object literal `{ id: item.id }` — its NEAREST enclosing function
    //      is the onClick arrow (a nested, non-iteration callback), NOT the .map
    //      callback, so the iteration exemption must NOT reach it.
    // If the guard keyed on ANY ancestor instead of the nearest function, both
    // would be wrongly exempted — this case pins that regression.
    {
      code: `
    const Menu = () => {
      return (
        <ul>
          {ITEMS.map((item) => (
            <li key={item.id} onClick={() => handle({ id: item.id })}>
              {item.label}
            </li>
          ))}
        </ul>
      );
    };
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
    // Scope control (#1319 regression guard): an object literal inside a nested
    // regular ARROW function declared within the map callback must STAY flagged —
    // its nearest enclosing function is `build`, not the iteration callback. The
    // nested `build` arrow itself is also flagged (its own nearest function is
    // itself, which is not an iteration callback). The map callback is exempt.
    {
      code: `
        const Builder = ({ items }) => {
          const rows = items.map((item) => {
            const build = () => ({ id: item.id });
            return build();
          });
          return <List rows={rows} />;
        };
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
    // Scope control (#1319 regression guard): an object literal inside a nested
    // FUNCTION DECLARATION within the map callback must STAY flagged — the
    // nearest enclosing function is `make`, not the iteration callback.
    {
      code: `
        const Factory = ({ items }) => {
          const rows = items.map((item) => {
            function make() {
              return { id: item.id };
            }
            return make();
          });
          return <List rows={rows} />;
        };
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
    // #1347 regression guard: a genuine module-scope hook must STILL be flagged.
    {
      code: `
        export const useRealHook = () => {
          return { a: 1 };
        };
      `,
      errors: [{ messageId: 'hookReturnLiteral' }],
    },
    // #1347 regression guard: the factory carve-out requires an ENCLOSING
    // function — a module-scope object of hooks is a real hooks namespace.
    {
      code: `
        export const hooks = {
          useThing: () => {
            return { a: 1 };
          },
        };
      `,
      errors: [{ messageId: 'hookReturnLiteral' }],
    },
    // #1347 regression guard: a NAMED hook factory (zustand/tRPC shape) is not
    // a callback argument, so its returned hook keeps its hook status and the
    // unstable literal it returns stays reported.
    {
      code: `
        export function createApi(client) {
          return {
            useUser: () => {
              return { name: client.name };
            },
          };
        }
      `,
      errors: [{ messageId: 'hookReturnLiteral' }],
    },
    // #1347 regression guard: inside a real render body the literals stay
    // reported, and the hook-keyed property still owns its own return value.
    {
      code: `
        function MyComponent() {
          const api = {
            useThing: () => {
              return { a: 1 };
            },
          };
          return api;
        }
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
        { messageId: 'hookReturnLiteral' },
      ],
    },
    // #1347 regression guard: same shape through a memo() wrapper — the
    // transparent-callee walk still resolves the enclosing component.
    {
      code: `
        const MyComponent = memo(() => {
          const api = {
            useThing: () => {
              return { a: 1 };
            },
          };
          return api;
        });
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
        { messageId: 'hookReturnLiteral' },
      ],
    },
    // #1347 regression guard: the jest carve-out is jest-specific, not "any
    // enclosing function".
    {
      code: `
        function setup() {
          const useThing = () => {
            return { a: 1 };
          };
          return useThing;
        }
      `,
      errors: [{ messageId: 'hookReturnLiteral' }],
    },
    // #1347 regression guard: the jest carve-out is lexical, not file-wide — a
    // hook declared outside the factory is still analyzed.
    {
      code: `
        jest.mock('./x');
        export const useThing = () => {
          return { a: 1 };
        };
      `,
      errors: [{ messageId: 'hookReturnLiteral' }],
    },
    // #1347: a hook-keyed property built inside a factory callback that sits in
    // a render body is attributed to the COMPONENT rather than to a hook that
    // does not exist — the literal is still inside a render body, so the report
    // count is unchanged.
    {
      code: `
        function MyComponent() {
          registerModule('m', () => ({
            useThing: () => ({ a: 1 }),
          }));
          const s = { a: 1 };
          return s;
        }
      `,
      errors: [
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
        { messageId: 'componentLiteral' },
      ],
    },
  ],
});

// Variable-mediated sx/style exemption (#1274): a literal whose every usage
// resolves to a style JSX attribute value is exempt just like the inline form.
ruleTesterJsx.run('react-memoize-literals', reactMemoizeLiterals, {
  valid: [
    // object literal assigned to a variable whose only use is an sx value
    {
      code: `
const Panel = () => {
  const panelSx = { px: 2, color: 'primary.main' };
  return <Box sx={panelSx} />;
};
      `,
    },
    // variable used as a standard style attribute value
    {
      code: `
const Overlay = () => {
  const overlayStyle = { position: 'absolute', top: 0 };
  return <div style={overlayStyle} />;
};
      `,
    },
    // every reference resolves to an sx value (used on two elements)
    {
      code: `
const Pair = () => {
  const sharedSx = { p: 2 };
  return (
    <>
      <Box sx={sharedSx} />
      <Box sx={sharedSx} />
    </>
  );
};
      `,
    },
    // variable consumed via an sx-supported form (array element inside sx)
    {
      code: `
const Stacked = ({ active }) => {
  const baseSx = { p: 2 };
  return <Box sx={[baseSx, active && { color: 'red' }]} />;
};
      `,
    },
  ],
  invalid: [
    // REGRESSION GUARD: variable used as a NON-style prop still reports.
    {
      code: `
const MyComponent = () => {
  const data = { id: 1, label: 'hello' };
  return <SomeComponent data={data} />;
};
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: reference passed through a function call still reports,
    // even though the call result feeds sx — the callee observes the reference.
    {
      code: `
const MyComponent = () => {
  const maybeSx = { color: 'red' };
  return <Box sx={combine(maybeSx)} />;
};
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
    // REGRESSION GUARD: mixed usage — one sx reference plus one non-style
    // reference — keeps the literal reported (not ALL usages are style values).
    {
      code: `
const MyComponent = () => {
  const styleish = { color: 'red' };
  useEffect(() => { track(styleish); }, []);
  return <Box sx={styleish} />;
};
      `,
      errors: [
        {
          messageId: 'componentLiteral',
          data: {
            literalType: 'object literal',
            context: 'component "MyComponent"',
            memoHook: 'useMemo',
          },
        },
      ],
    },
  ],
});
