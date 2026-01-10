import { ruleTesterJsx } from '../utils/ruleTester';
import { reactMemoizeLiterals } from '../rules/react-memoize-literals';

ruleTesterJsx.run('react-memoize-literals', reactMemoizeLiterals, {
  valid: [
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
    // JSX props 'sx' and 'style' (and variations) are deep-compared and allowed
    {
      code: `
function Component() {
  return (
    <div
      sx={{ color: 'blue' }}
      style={{ padding: '10px' }}
      containerSx={{ margin: '10px' }}
      innerStyle={{ display: 'flex' }}
    />
  );
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
  ],
  invalid: [
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
    // Literal nested in an expression that is assigned and thrown (should NOT be exempt)
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
  ],
});
