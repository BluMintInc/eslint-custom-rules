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

      // 16. Complex member expressions (allowed - permissive)
      {
        code: `
        function Component() {
          const keys = {
            user: 'user-profile'
          };
          const [value] = useRouterState({ key: keys.user });
          return <div>{value}</div>;
        }
        `,
      },

      // 17. Array access (allowed - permissive)
      {
        code: `
        function Component() {
          const keys = ['user-profile', 'user-settings'];
          const [value] = useRouterState({ key: keys[0] });
          return <div>{value}</div>;
        }
        `,
      },

      // 18. Spread operator (allowed - permissive for complex cases)
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
        output: `
        function Component() {
          const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          return <div>{value}</div>;
        }
        `,
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
        output: `
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
        output: `
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
        output: `
        function Component() {
          const [value1] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
          const [value2] = useRouterState({ key: QUERY_KEY_USER_SETTINGS });
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
        output: `
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
    ],
  },
);
