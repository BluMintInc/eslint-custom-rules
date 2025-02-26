import { ruleTesterJsx } from '../utils/ruleTester';
import { preferGlobalRouterStateKey } from '../rules/prefer-global-router-state-key';

ruleTesterJsx.run('prefer-global-router-state-key', preferGlobalRouterStateKey, {
  valid: [
    // 1. Basic Cases
    // Using a global constant
    {
      code: `
        const MATCH_DIALOG_KEY = 'match-session' as const;

        function Component() {
          const [value, setValue] = useRouterState({ key: MATCH_DIALOG_KEY });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a type-safe function
    {
      code: `
        type ValidPrefix = 'match' | 'tournament' | 'session';

        function generateKey(prefix: ValidPrefix, id: string): string {
          return \`\${prefix}-\${id}\`;
        }

        function Component({ userId }) {
          const [value, setValue] = useRouterState({
            key: generateKey('match', userId)
          });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a prop with proper typing
    {
      code: `
        interface DialogProps {
          routerKey: string;
        }

        function Dialog({ routerKey }: DialogProps) {
          const [value, setValue] = useRouterState({ key: routerKey });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a variable
    {
      code: `
        function Component() {
          const matchKey = getMatchKey();
          const [value, setValue] = useRouterState({ key: matchKey });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a template literal with variables
    {
      code: `
        function Component({ id, type }) {
          const [value, setValue] = useRouterState({ key: \`\${type}-\${id}\` });
          return <div>{value}</div>;
        }
      `,
    },

    // 2. Advanced Type-Safe Patterns
    // Using a namespaced constant
    {
      code: `
        export const RouterKeys = {
          MATCH: 'match-session' as const,
          TOURNAMENT: 'tournament-details' as const,
          USER_PROFILE: 'user-profile' as const,
        };

        function Component() {
          const [value, setValue] = useRouterState({ key: RouterKeys.MATCH });
          return <div>{value}</div>;
        }
      `,
    },
    // Using an enum
    {
      code: `
        enum RouterStateKeys {
          MATCH = 'match-session',
          TOURNAMENT = 'tournament-details',
          USER_PROFILE = 'user-profile',
        }

        function Component() {
          const [value, setValue] = useRouterState({ key: RouterStateKeys.MATCH });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a type-safe utility function with generics
    {
      code: `
        type ValidNamespace = 'match' | 'tournament' | 'user';

        function createNamespacedKey<T extends ValidNamespace>(
          namespace: T,
          options: { prefix?: string; suffix?: string } = {}
        ): string {
          const { prefix, suffix } = options;
          return [prefix, namespace, suffix].filter(Boolean).join('-');
        }

        function Component() {
          const [value, setValue] = useRouterState({
            key: createNamespacedKey('match', { suffix: 'details' })
          });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a key composition utility
    {
      code: `
        const combineKeys = <T extends string[]>(...parts: T): string => {
          return parts.join('-');
        };

        function Component({ section, id }) {
          const [value, setValue] = useRouterState({
            key: combineKeys('tournament', section, id)
          });
          return <div>{value}</div>;
        }
      `,
    },

    // 3. Component Patterns
    // Using a custom hook with type-safe key generation
    {
      code: `
        function useMatchState(matchId: string) {
          const key = \`match-\${matchId}\`;
          return useRouterState({ key });
        }

        function MatchComponent({ matchId }) {
          const [value, setValue] = useMatchState(matchId);
          return <div>{value}</div>;
        }
      `,
    },
    // Using a higher-order component with router key
    {
      code: `
        interface WithRouterStateProps {
          routerStateKey: string;
        }

        function withRouterState<P extends WithRouterStateProps>(
          Component: React.ComponentType<P>
        ) {
          return function WrappedComponent(props: P) {
            const [value, setValue] = useRouterState({ key: props.routerStateKey });
            return <Component {...props} routerState={[value, setValue]} />;
          };
        }

        function MyComponent(props) {
          return <div>{props.routerState[0]}</div>;
        }

        const EnhancedComponent = withRouterState(MyComponent);
      `,
    },
    // Using a context provider for router state
    {
      code: `
        const RouterStateContext = React.createContext(null);

        function RouterStateProvider({ keyPrefix, children }) {
          const key = \`\${keyPrefix}-context\`;
          const state = useRouterState({ key });

          return (
            <RouterStateContext.Provider value={state}>
              {children}
            </RouterStateContext.Provider>
          );
        }
      `,
    },

    // 4. Testing Patterns
    // Using a test utility for generating keys
    {
      code: `
        const createTestKey = (prefix: string) => {
          return \`test-\${prefix}-\${Date.now()}\`;
        };

        describe('Router Tests', () => {
          it('should handle dynamic keys', () => {
            const testKey = createTestKey('tournament');
            const { result } = renderHook(() => useRouterState({ key: testKey }));
          });
        });
      `,
    },
    // Using a mock implementation for testing
    {
      code: `
        jest.mock('../hooks/useRouterState', () => ({
          useRouterState: jest.fn(({ key }) => {
            const mockState = mockRouterStates[key] || null;
            return [mockState, jest.fn()];
          }),
        }));

        test('component uses router state correctly', () => {
          const KEY = 'test-component-key';
          render(<Component routerKey={KEY} />);
        });
      `,
    },

    // 5. Edge Cases
    // Using a computed property name
    {
      code: `
        const KEYS = {
          MATCH: 'match',
          TOURNAMENT: 'tournament',
        };

        function Component({ type }) {
          const keyName = KEYS[type.toUpperCase()];
          const [value, setValue] = useRouterState({ key: keyName });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a function that returns a key
    {
      code: `
        function getKeyForEntity(entity: { type: string; id: string }) {
          return \`\${entity.type}-\${entity.id}\`;
        }

        function Component({ entity }) {
          const [value, setValue] = useRouterState({
            key: getKeyForEntity(entity)
          });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a key with conditional logic
    {
      code: `
        function Component({ id, isAdmin }) {
          const prefix = isAdmin ? 'admin' : 'user';
          const key = \`\${prefix}-\${id}\`;

          const [value, setValue] = useRouterState({ key });
          return <div>{value}</div>;
        }
      `,
    },
    // Using a key with default values
    {
      code: `
        function Component({ section = 'default', id = '0' }) {
          const key = \`section-\${section}-\${id}\`;
          const [value, setValue] = useRouterState({ key });
          return <div>{value}</div>;
        }
      `,
    },
  ],
  invalid: [
    // 1. Basic Invalid Cases
    // Using a string literal directly
    {
      code: `
        function Component() {
          const [value, setValue] = useRouterState({ key: 'match-session' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using a string literal with other properties
    {
      code: `
        function Component() {
          const [value, setValue] = useRouterState({
            key: 'tournament-details',
            location: 'queryParam'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },

    // 2. Complex Invalid Cases
    // Using multiple string literals in different components
    {
      code: `
        function MatchComponent() {
          const [value, setValue] = useRouterState({ key: 'match-view' });
          return <div>{value}</div>;
        }

        function TournamentComponent() {
          const [value, setValue] = useRouterState({ key: 'tournament-view' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using string literals in a custom hook
    {
      code: `
        function useCustomRouterState(id) {
          const [matchValue, setMatchValue] = useRouterState({ key: 'match-details' });
          const [tournamentValue, setTournamentValue] = useRouterState({ key: 'tournament-details' });

          return {
            match: [matchValue, setMatchValue],
            tournament: [tournamentValue, setTournamentValue],
          };
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using string literals with template expressions
    {
      code: `
        function Component({ id }) {
          // This should be invalid because 'user-profile-' is a string literal
          const [value, setValue] = useRouterState({ key: 'user-profile-' + id });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using string literals in conditional expressions
    {
      code: `
        function Component({ isAdmin }) {
          const [value, setValue] = useRouterState({
            key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
          });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using string literals in array mapping
    {
      code: `
        function MultiComponent({ sections }) {
          return (
            <div>
              {sections.map(section => {
                const [value, setValue] = useRouterState({ key: 'section-' + section.id });
                return <div key={section.id}>{value}</div>;
              })}
            </div>
          );
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
    // Using string literals in nested components
    {
      code: `
        function ParentComponent() {
          return (
            <div>
              <ChildComponent />
            </div>
          );
        }

        function ChildComponent() {
          const [value, setValue] = useRouterState({ key: 'child-component' });
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'preferGlobalRouterStateKey',
        },
      ],
    },
  ],
});
