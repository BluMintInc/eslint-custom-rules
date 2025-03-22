import { ESLintUtils } from '@typescript-eslint/utils';
import rule from '../rules/react-memoize-literals';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('react-memoize-literals', rule, {
  valid: [
    // Constants outside component
    {
      code: `
        const EMPTY_ARRAY = [];
        const DEFAULT_CONFIG = { enabled: true };

        function UserProfile({ userId }) {
          return <div>{userId}</div>;
        }
      `,
    },
    // Memoized object with useMemo
    {
      code: `
        function UserProfile({ userId }) {
          const queryOptions = useMemo(() => ({
            staleTime: 5000,
            cacheOptions: {
              ttl: 60000,
              storage: { type: 'memory' }
            }
          }), []);

          return <div>{queryOptions.staleTime}</div>;
        }
      `,
    },
    // Memoized array with useMemo
    {
      code: `
        function UserProfile({ userId }) {
          const queryKey = useMemo(() => ['user', userId], [userId]);

          return <div>{queryKey[0]}</div>;
        }
      `,
    },
    // Memoized function with useCallback
    {
      code: `
        function UserProfile({ userId }) {
          const queryFn = useCallback(() => fetchUser(userId), [userId]);

          return <div onClick={queryFn}>{userId}</div>;
        }
      `,
    },
    // Direct hook argument (allowed)
    {
      code: `
        function UserProfile({ userId }) {
          const [searchResults, setSearchResults] = useState([]);

          return <div>{searchResults.length}</div>;
        }
      `,
    },

    // Custom hook with memoized return value
    {
      code: `
        function useUserSettings() {
          const onChange = useCallback(() => updateTheme(), []);

          return useMemo(() => ({
            theme: 'dark',
            onChange
          }), [onChange]);
        }
      `,
    },
    // Non-component/hook function (not flagged)
    {
      code: `
        function formatData(data) {
          const formatted = { ...data };
          const keys = Object.keys(data);

          return formatted;
        }
      `,
    },
  ],
  invalid: [
    // Unmemoized object in component
    {
      code: `
        function UserProfile({ userId }) {
          const userData = {
            id: userId,
            settings: { theme: 'dark' }
          };

          return <div>{userData.id}</div>;
        }
      `,
      errors: [
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeObjectLiteral' }
      ],
    },
    // Unmemoized nested object in hook parameter
    {
      code: `
        function UserProfile({ userId }) {
          useQuery({
            queryKey: ['user', userId],
            queryFn: () => fetchUser(userId),
            options: {
              staleTime: 5000,
              cacheOptions: {
                ttl: 60000,
                storage: { type: 'memory' }
              }
            }
          });

          return <div>{userId}</div>;
        }
      `,
      errors: [
        { messageId: 'memoizeArrayLiteral' },
        { messageId: 'memoizeFunctionLiteral' },
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeObjectLiteral' },
      ],
    },
    // Unmemoized array in component
    {
      code: `
        function UserProfile({ userId }) {
          const queryKey = ['user', userId];

          return <div>{queryKey[0]}</div>;
        }
      `,
      errors: [{ messageId: 'memoizeArrayLiteral' }],
    },
    // Unmemoized function in component
    {
      code: `
        function UserProfile({ userId }) {
          const queryFn = () => fetchUser(userId);

          return <div onClick={queryFn}>{userId}</div>;
        }
      `,
      errors: [{ messageId: 'memoizeFunctionLiteral' }],
    },
    // Unmemoized object returned from custom hook
    {
      code: `
        function useUserSettings() {
          // ...logic
          return {
            theme: 'dark',
            onChange: () => updateTheme()
          };
        }
      `,
      errors: [
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeFunctionLiteral' },
      ],
    },
    // Direct hook argument with object (we're not checking for this case yet)
    // This is a known limitation - we're flagging literals inside hook arguments
    // even though they're top-level
    {
      code: `
        function UserProfile() {
          useQuery({
            queryKey: ['users'],
            queryFn: () => fetchUsers()
          });

          return <div>Users</div>;
        }
      `,
      errors: [
        { messageId: 'memoizeArrayLiteral' },
        { messageId: 'memoizeFunctionLiteral' }
      ],
    },
    // Multiple unmemoized literals in component
    {
      code: `
        function UserProfile({ userId }) {
          const userData = useQuery({
            queryKey: ['user', userId],
            queryFn: () => fetchUser(userId),
            options: {
              staleTime: 5000,
              cacheOptions: {
                ttl: 60000,
                storage: { type: 'memory' }
              }
            }
          });

          const [searchResults, setSearchResults] = useState([]);

          return <ProfileDisplay data={userData} results={searchResults} />;
        }
      `,
      errors: [
        { messageId: 'memoizeArrayLiteral' },
        { messageId: 'memoizeFunctionLiteral' },
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeObjectLiteral' },
        { messageId: 'memoizeObjectLiteral' },
      ],
    },
  ],
});
