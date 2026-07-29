import { ruleTesterJsx } from '../utils/ruleTester';
import { preferGlobalRouterStateKey } from '../rules/prefer-global-router-state-key';

const stringLiteralError = (keyValue: string) => ({
  messageId: 'preferGlobalRouterStateKey' as const,
  data: { keyValue },
});

const invalidSourceError = (variableName: string) => ({
  messageId: 'invalidQueryKeySource' as const,
  data: { variableName },
});

ruleTesterJsx.run(
  'prefer-global-router-state-key',
  preferGlobalRouterStateKey,
  {
    valid: [
      // 1. Import Patterns - Namespace imports
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import * as QueryKeys from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_SETTINGS });
          return <div>{value}</div>;
        }
        `,
      },

      // 2. Import Patterns - Default imports
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 3. Import Patterns - Named imports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_SETTINGS } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: QUERY_KEY_SETTINGS });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 4. Import Patterns - Re-exports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/constants';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import { QUERY_KEY_USER_PROFILE as USER_KEY } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: USER_KEY });
          return <div>{value}</div>;
        }
        `,
      },

      // 5. React Hook Integration - useEffect dependencies
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });

          useEffect(() => {
            // some effect
          }, [value]);

          return <div>{value}</div>;
        }
        `,
      },

      // 6. React Hook Integration - useCallback/useMemo
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const memoizedKey = useMemo(() => QUERY_KEY_USER_PROFILE, []);
          const [value] = useRouterState({ key: memoizedKey });
          return <div>{value}</div>;
        }
        `,
      },

      // 7. React Hook Integration - Custom hook patterns
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function useCustomRouter() {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
      },

      // 8. TypeScript Patterns - Type assertions
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const key = QUERY_KEY_USER_PROFILE as const;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 9. TypeScript Patterns - Interface/type usage
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        interface RouterConfig {
          key: string;
        }

        function Component() {
          const config: RouterConfig = { key: QUERY_KEY_USER_PROFILE };
          const [value] = useRouterState(config);
          return <div>{value}</div>;
        }
        `,
      },

      // 10. Complex React Patterns - Higher-order components
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <Component {...props} routerValue={value} />;
        };
        `,
      },

      // 11. Async/Dynamic Patterns - Variables derived from constants (simple case)
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const key = QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 12. Template literals with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [value] = useRouterState({ key: \`\${QUERY_KEY_USER_PROFILE}-\${id}\` });
          return <div>{value}</div>;
        }
        `,
      },

      // 13. Conditional expressions with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_ADMIN_PROFILE } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const key = isAdmin ? QUERY_KEY_ADMIN_PROFILE : QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
      },

      // 14. Function calls returning keys (allowed - permissive)
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function getKey() {
          return QUERY_KEY_USER_PROFILE;
        }

        function Component() {
          const [value] = useRouterState({ key: getKey() });
          return <div>{value}</div>;
        }
        `,
      },

      // 15. Function calls with string literals (allowed - permissive)
      {
        code: `
        function getKey() {
          return 'user-profile';
        }

        function Component() {
          const [value] = useRouterState({ key: getKey() });
          return <div>{value}</div>;
        }
        `,
      },

      // 17. Spread operator (allowed - permissive for complex cases)
      {
        code: `
        function Component() {
          const config = { key: 'user-profile' };
          const [value] = useRouterState({ ...config });
          return <div>{value}</div>;
        }
        `,
      },

      // 19. Relative imports
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 20. Mixed import styles
      {
        code: `
        import queryKeys, { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: queryKeys.QUERY_KEY_SETTINGS });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 21. Template literals with only separators
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ id }) {
          const [value] = useRouterState({ key: \`\${QUERY_KEY_USER_PROFILE}_\${id}\` });
          return <div>{value}</div>;
        }
        `,
      },

      // 22. Binary expressions with query keys
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ suffix }) {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE + suffix });
          return <div>{value}</div>;
        }
        `,
      },

      // 23. Sibling of queryKeys.ts reaches it as './queryKeys'
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
      },

      // 24. Relative specifier whose text omits the 'util' segment
      {
        filename: 'src/util/notification/actions/buildProfileUrl.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../routing/queryKeys';

        export const buildProfileUrl = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
      },

      // 25. Depth-correct relative specifier from a nested component
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // A destructured callback parameter iterating a global constant array cannot be
      // replaced by a single QUERY_KEY_* constant.
      `
import { GROUP_IDS } from '../../util/routing/groupIds';
export const useGroupIdMap = () => {
  const routerStates = GROUP_IDS.map(({ key, location }) => {
    return useRouterState({ key, location });
  });
  return routerStates;
};
`,

      // 27. A plain function parameter is decided by the caller
      {
        code: `
        function useKey(key) {
          return useRouterState({ key });
        }
        `,
      },

      // 28. A renamed destructured parameter is still a parameter
      {
        code: `
        export const useKeys = (entries) => {
          return entries.map(({ key: k }) => useRouterState({ key: k }));
        };
        `,
      },

      // 29. A parameter with a default value
      {
        code: `
        export const useKey = ({ key = 'fallback' }) => {
          return useRouterState({ key });
        };
        `,
      },

      // 30. A nested callback resolves the outer function's parameter
      {
        code: `
        export const useKey = (key) => {
          return useMemo(() => {
            return useRouterState({ key });
          }, [key]);
        };
        `,
      },

      // 31. A callback parameter shadows an outer literal of the same name
      {
        code: `
        const key = 'user-profile';

        export const useKeys = (entries) => {
          return entries.map((key) => useRouterState({ key }));
        };
        `,
      },

      // 32. A typed parameter of a class method
      {
        code: `
        class RouterStates {
          public build(key: string) {
            return useRouterState({ key });
          }
        }
        `,
      },

      // 33. A rest parameter element reaching useRouterState
      {
        code: `
        export const useKeys = (...keys) => {
          return keys.map((key) => useRouterState({ key }));
        };
        `,
      },

      // 34. A destructured parameter of a function expression, not an arrow
      {
        code: `
        export const useKeys = (entries) => {
          return entries.flatMap(function ({ key }) {
            return useRouterState({ key });
          });
        };
        `,
      },
    ],
    invalid: [
      // 1. Basic string literals
      {
        code: `
        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
      },

      // 2a. Merge with existing queryKeys import
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-settings' });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return <div>{value}</div>;
        }
        `,
      },
      // 2b. Namespace import should qualify constant
      {
        code: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import * as QueryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QueryKeys.QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },
      // 2c. Default import should qualify constant
      {
        code: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-settings' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import queryKeys from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: queryKeys.QUERY_KEY_USER_SETTINGS });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 2. String literals in template expressions
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile-' + id")],
      },

      // 3. String literals in conditional expressions
      {
        code: `
        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError("isAdmin ? 'admin-dashboard' : 'user-dashboard'"),
        ],
      },

      // 4. Template literals with static content
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`user-profile-\${id}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`user-profile-${id}`')],
      },

      // 5. Variables not from query keys
      {
        code: `
        function Component() {
          const key = 'user-profile';
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 6. Variables from wrong import source
      {
        code: `
        import { USER_PROFILE_KEY } from '@/constants/other';

        function Component() {
          const [value] = useRouterState({ key: USER_PROFILE_KEY });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('USER_PROFILE_KEY')],
      },

      // 7. Non-QUERY_KEY constants from correct source
      {
        code: `
        import { OTHER_CONSTANT } from '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: OTHER_CONSTANT });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('OTHER_CONSTANT')],
      },

      // 8. Mixed valid and invalid in conditional
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

        function Component({ isAdmin }) {
          const [value] = useRouterState({
            key: isAdmin ? QUERY_KEY_USER_PROFILE : 'admin-dashboard'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError(
            "isAdmin ? QUERY_KEY_USER_PROFILE : 'admin-dashboard'",
          ),
        ],
      },

      // 9. Member expression without validated source
      {
        code: `
        function Component() {
          const keys = { user: 'user-profile' };
          const [value] = useRouterState({ key: keys.user });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('keys.user')],
      },

      // 10. Array member expression without validated source
      {
        code: `
        function Component() {
          const keys = ['user-profile', 'user-settings'];
          const [value] = useRouterState({ key: keys[0] });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('keys[0]')],
      },

      // 11. Import from unrelated queryKeys path should be rejected
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from './some/other/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('QUERY_KEY_USER_PROFILE')],
      },

      // 9. String literals in custom hooks
      {
        code: `
        function useCustomRouter() {
          return useRouterState({ key: 'user-profile' });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function useCustomRouter() {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        }

        function Component() {
          const [value] = useCustomRouter();
          return <div>{value}</div>;
        }
        `,
      },

      // 10. String literals in HOCs
      {
        code: `
        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: 'user-profile' });
          return <Component {...props} routerValue={value} />;
        };
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        const withRouter = (Component) => (props) => {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <Component {...props} routerValue={value} />;
        };
        `,
      },

      // 11. Multiple string literals
      {
        code: `
        function Component() {
          const [value1] = useRouterState({ key: 'user-profile' });
          const [value2] = useRouterState({ key: 'user-settings' });
          return <div>{value1} {value2}</div>;
        }
        `,
        errors: [
          stringLiteralError("'user-profile'"),
          stringLiteralError("'user-settings'"),
        ],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: 'user-settings' });
          return <div>{value1} {value2}</div>;
        }
        `,
      },

      // 12. String literals with other properties
      {
        code: `
        function Component() {
          const [value] = useRouterState({
            key: 'user-profile',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({
            key: QUERY_KEY_USER_PROFILE,
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
        `,
      },

      // 13. Template literals with significant static content
      {
        code: `
        function Component({ id }) {
          const [value] = useRouterState({ key: \`userProfile\${id}\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`userProfile${id}`')],
      },

      // 14. Binary expressions with string literals
      {
        code: `
        function Component({ suffix }) {
          const [value] = useRouterState({ key: 'user-profile' + suffix });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile' + suffix")],
      },

      // 15. Namespace import with wrong property (currently not detected - complex to implement)
      // This would require static analysis of the imported module

      // 16. Type assertion on string literal
      {
        code: `
        function Component() {
          const key = 'user-profile' as const;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 17. Conditional with both branches invalid
      {
        code: `
        function Component({ type }) {
          const [value] = useRouterState({
            key: type === 'admin' ? 'admin-profile' : 'user-profile'
          });
          return <div>{value}</div>;
        }
        `,
        errors: [
          stringLiteralError(
            "type === 'admin' ? 'admin-profile' : 'user-profile'",
          ),
        ],
      },

      // 18. Mixed import sources - some valid, some invalid
      {
        code: `
        import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';
        import { OTHER_KEY } from '@/constants/other';

        function Component({ useOther }) {
          const key = useOther ? OTHER_KEY : QUERY_KEY_USER_PROFILE;
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 19. Template literal with only static content
      {
        code: `
        function Component() {
          const [value] = useRouterState({ key: \`userProfile\` });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError('`userProfile`')],
      },

      // 20. Async patterns with string literals
      {
        code: `
        function Component() {
          const [key, setKey] = useState('initial-key');
          const [value] = useRouterState({ key });

          useEffect(() => {
            setKey('updated-key');
          }, []);

          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },
      // 21. Side-effect queryKeys import should still add named import
      {
        code: `
        import '@/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },
      // 22. Should NOT merge with type-only import
      {
        code: "import type { SomeType } from '@/util/routing/queryKeys';\n\nfunction Component() {\n  const [value] = useRouterState({ key: 'user-profile' });\n  return <div>{value}</div>;\n}",
        output:
          "import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';\nimport type { SomeType } from '@/util/routing/queryKeys';\n\nfunction Component() {\n  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });\n  return <div>{value}</div>;\n}",
        errors: [stringLiteralError("'user-profile'")],
      },

      // 23. Two directories below src/ reaches queryKeys with two '../'
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        function TeamCard() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 24. A deeper file gets more '../', proving the count follows real depth
      {
        filename: 'src/components/a/b/c/Bar.tsx',
        code: `
        function Bar() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../../../util/routing/queryKeys';

        function Bar() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 25. A file directly in src/ descends into the target directory
      {
        filename: 'src/index.tsx',
        code: `
        function App() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from './util/routing/queryKeys';

        function App() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 26. A sibling of queryKeys.ts imports it by file name alone
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        export const useProfileKey = () => {
          return useRouterState({ key: 'user-profile' });
        };
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          return useRouterState({ key: QUERY_KEY_USER_PROFILE });
        };
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 27. An existing relative import is extended, never duplicated
      {
        filename: 'src/components/tournament/TeamCard.tsx',
        code: `
        import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: 'user-settings' });
          return <div>{profile}{settings}</div>;
        }
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return <div>{profile}{settings}</div>;
        }
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 28. A sibling's './queryKeys' import is extended, never duplicated
      {
        filename: 'src/util/routing/useProfileKey.ts',
        code: `
        import { QUERY_KEY_USER_PROFILE } from './queryKeys';

        export const useProfileKey = () => {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: 'user-settings' });
          return [profile, settings];
        };
        `,
        output: `
        import { QUERY_KEY_USER_PROFILE, QUERY_KEY_USER_SETTINGS } from './queryKeys';

        export const useProfileKey = () => {
          const [profile] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [settings] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
          return [profile, settings];
        };
        `,
        errors: [stringLiteralError("'user-settings'")],
      },

      // 29. Outside src/, the bare specifier that tsconfig paths resolve is kept
      {
        filename: 'pages/legacy/Widget.tsx',
        code: `
        function Widget() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

        function Widget() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 30. An absolute filename derives the same relative specifier
      {
        filename: '/repo/src/components/tournament/TeamCard.tsx',
        code: `
        function TeamCard() {
          const [value] = useRouterState({ key: 'user-profile' });
          return <div>{value}</div>;
        }
        `,
        output: `import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

        function TeamCard() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
        errors: [stringLiteralError("'user-profile'")],
      },

      // 31. A module-scope local variable is substitutable, unlike a parameter
      {
        code: `
        const key = 'user-profile';

        function Component() {
          const [value] = useRouterState({ key });
          return <div>{value}</div>;
        }
        `,
        errors: [invalidSourceError('key')],
      },

      // 32. An inner local shadowing a parameter of the same name still reports
      {
        code: `
        export const useKey = (key) => {
          const inner = () => {
            const key = 'user-profile';
            return useRouterState({ key });
          };
          return inner();
        };
        `,
        errors: [invalidSourceError('key')],
      },

      // 33. An identifier named 'key' imported from an unrelated module
      {
        code: `
        import { key } from '../../util/routing/groupIds';

        export const useGroupKey = () => {
          return useRouterState({ key });
        };
        `,
        errors: [invalidSourceError('key')],
      },

      // 34. A parameter inside a ternary alongside a string literal
      {
        code: `
        export const useKey = (key) => {
          return useRouterState({ key: key ? key : 'user-profile' });
        };
        `,
        errors: [stringLiteralError("key ? key : 'user-profile'")],
      },

      // 35. A parameter reached through a member expression is not a bare binding
      {
        code: `
        export const useKey = ({ keys }) => {
          return useRouterState({ key: keys.user });
        };
        `,
        errors: [invalidSourceError('keys.user')],
      },
    ],
  },
);
