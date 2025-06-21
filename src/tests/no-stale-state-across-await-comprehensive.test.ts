import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

/*
 * Comprehensive test suite for no-stale-state-across-await rule
 *
 * This test suite covers:
 * 1. Class Components with setState patterns
 * 2. useReducer patterns with dispatch across async
 * 3. Custom hooks with async state management
 * 4. useEffect patterns with async effects
 * 5. Advanced async patterns (Promise.all, async iterators)
 * 6. False positive scenarios (rule should NOT fire)
 * 7. False negative scenarios (rule SHOULD fire)
 * 8. Edge cases and complex patterns
 */

ruleTesterJsx.run(
  'no-stale-state-across-await-comprehensive',
  noStaleStateAcrossAwait,
  {
    valid: [
      // ===== CLASS COMPONENTS =====

      // Valid: Class component with setState - no violation (different methods)
      {
        code: `
        class Component extends React.Component {
          state = { loading: false, data: null };

          clearData() {
            this.setState({ data: null });
          }

          async loadData() {
            const data = await api.get('/data');
            this.setState({ data, loading: false });
          }
        }
      `,
      },

      // Valid: Class component with setState - only after async
      {
        code: `
        class Component extends React.Component {
          state = { loading: false, data: null };

          async loadData() {
            const data = await api.get('/data');
            this.setState({ data });
            this.setState({ loading: false });
          }
        }
      `,
      },

      // ===== useReducer PATTERNS =====

      // Valid: useReducer with different dispatch calls (no violation)
      {
        code: `
        function Component() {
          const [state, dispatch] = useReducer(reducer, initialState);

          async function loadData() {
            dispatch({ type: 'LOADING' });
            const data = await api.get('/data');
            dispatch({ type: 'SUCCESS', data });
          }
        }
      `,
      },

      // Valid: useReducer with only post-async dispatch
      {
        code: `
        function Component() {
          const [state, dispatch] = useReducer(reducer, initialState);

          async function loadData() {
            const data = await api.get('/data');
            dispatch({ type: 'SUCCESS', data });
            dispatch({ type: 'COMPLETE' });
          }
        }
      `,
      },

      // ===== CUSTOM HOOKS =====

      // Valid: Custom hook with atomic update
      {
        code: `
        function useAsyncData() {
          const [data, setData] = useState(null);

          async function fetchData() {
            const result = await api.get('/data');
            setData(result);
          }

          return { data, fetchData };
        }
      `,
      },

      // Valid: Custom hook with different state setters
      {
        code: `
        function useAsyncData() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          async function fetchData() {
            setLoading(true);
            const result = await api.get('/data');
            setData(result);
          }

          return { data, loading, fetchData };
        }
      `,
      },

      // ===== useEffect PATTERNS =====

      // Valid: useEffect with atomic update
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          useEffect(() => {
            async function fetchData() {
              const result = await api.get('/data');
              setData(result);
            }
            fetchData();
          }, []);
        }
      `,
      },

      // Valid: useEffect with different setters
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          useEffect(() => {
            async function fetchData() {
              setLoading(true);
              const result = await api.get('/data');
              setData(result);
            }
            fetchData();
          }, []);
        }
      `,
      },

      // ===== ADVANCED ASYNC PATTERNS =====

      // Valid: Promise.all with different setters
      {
        code: `
        function Component() {
          const [users, setUsers] = useState([]);
          const [posts, setPosts] = useState([]);

          async function loadMultiple() {
            const [usersData, postsData] = await Promise.all([
              api.get('/users'),
              api.get('/posts')
            ]);
            setUsers(usersData);
            setPosts(postsData);
          }
        }
      `,
      },

      // Valid: Async iterator with different setters
      {
        code: `
        function Component() {
          const [status, setStatus] = useState('idle');
          const [items, setItems] = useState([]);

          async function* processData() {
            setStatus('processing');
            for await (const item of dataStream) {
              yield item;
            }
            setItems(processedItems);
          }
        }
      `,
      },

      // ===== FALSE POSITIVE PREVENTION =====

      // Valid: Nested functions with separate scopes
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function outerFunction() {
            setData(null);

            async function innerFunction() {
              const result = await api.get('/data');
              setData(result);
            }

            return innerFunction();
          }
        }
      `,
      },

      // Valid: Truly separate conditional branches (different functions)
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function loadCachedData() {
            setData(cachedData);
          }

          async function loadFreshData() {
            const result = await api.get('/data');
            setData(result);
          }
        }
      `,
      },

      // Valid: Multiple async boundaries but no same-setter violations
      {
        code: `
        function Component() {
          const [users, setUsers] = useState([]);
          const [posts, setPosts] = useState([]);
          const [comments, setComments] = useState([]);

          async function loadAllData() {
            const usersData = await api.get('/users');
            setUsers(usersData);

            const postsData = await api.get('/posts');
            setPosts(postsData);

            const commentsData = await api.get('/comments');
            setComments(commentsData);
          }
        }
      `,
      },

      // Valid: Error handling without violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          async function loadData() {
            try {
              const result = await api.get('/data');
              setData(result);
            } catch (err) {
              setError(err.message);
            }
          }
        }
      `,
      },

      // Valid: Loop patterns without violations
      {
        code: `
        function Component() {
          const [items, setItems] = useState([]);

          async function loadItems(ids) {
            const results = [];
            for (const id of ids) {
              const item = await api.get(\`/items/\${id}\`);
              results.push(item);
            }
            setItems(results);
          }
        }
      `,
      },

      // Valid: Complex Promise chains without violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function loadData() {
            return api.get('/data')
              .then(response => response.json())
              .then(data => api.enrich(data))
              .then(enrichedData => {
                setData(enrichedData);
              });
          }
        }
      `,
      },

      // Valid: Generator function without violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function* dataGenerator() {
            const result = yield api.get('/data');
            setData(result);
          }
        }
      `,
      },

      // Valid: Mixed async patterns without violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [status, setStatus] = useState('idle');

          async function complexLoad() {
            setStatus('loading');

            const initial = await api.get('/initial');

            return api.process(initial)
              .then(processed => {
                setData(processed);
                return processed;
              });
          }
        }
      `,
      },

      // Valid: Destructured useState with different patterns
      {
        code: `
        function Component() {
          const [state, setState] = useState({ data: null, loading: false });

          async function loadData() {
            const result = await api.get('/data');
            setState({ data: result, loading: false });
          }
        }
      `,
      },

      // Valid: Multiple useState hooks with complex patterns
      {
        code: `
        function Component() {
          const [user, setUser] = useState(null);
          const [profile, setProfile] = useState(null);
          const [settings, setSettings] = useState({});

          async function loadUserData(userId) {
            const userData = await api.get(\`/users/\${userId}\`);
            setUser(userData);

            const profileData = await api.get(\`/profiles/\${userId}\`);
            setProfile(profileData);

            const settingsData = await api.get(\`/settings/\${userId}\`);
            setSettings(settingsData);
          }
        }
      `,
      },

      // Valid: Async function with no await (edge case)
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);
            setData(cachedData);
          }
        }
      `,
      },

      // Valid: Function with no useState calls
      {
        code: `
        async function utilityFunction() {
          const data = await api.get('/data');
          return data;
        }
      `,
      },

      // Valid: Empty function body
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function emptyFunction() {
            // Empty
          }
        }
      `,
      },

      // Valid: Single setter call
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            const result = await api.get('/data');
            setData(result);
          }
        }
      `,
      },

      // Valid: Callback patterns without violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function loadData() {
            api.get('/data', (result) => {
              setData(result);
            });
          }
        }
      `,
      },

      // Valid: setTimeout/setInterval patterns
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            const result = await api.get('/data');

            setTimeout(() => {
              setData(result);
            }, 100);
          }
        }
      `,
      },
    ],

    invalid: [
      // ===== CLASS COMPONENTS =====

      // Invalid: Class component setState patterns (Note: This rule focuses on useState, not setState)
      // The rule currently only tracks useState setters, so setState violations won't be caught
      // This is by design as the rule is specifically for React hooks

      // ===== useReducer PATTERNS =====

      // Invalid: useReducer dispatch across async (Note: dispatch is not a useState setter)
      // The rule currently only tracks useState setters, not useReducer dispatch
      // This is by design as dispatch calls are different from useState setters

      // ===== CUSTOM HOOKS =====

      // Invalid: Custom hook with async state management violation
      {
        code: `
        function useAsyncData() {
          const [data, setData] = useState(null);

          async function fetchData() {
            setData(null);
            const result = await api.get('/data');
            setData(result);
          }

          return { data, fetchData };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Custom hook with complex violation
      {
        code: `
        function useComplexData() {
          const [data, setData] = useState(null);
          const [cache, setCache] = useState({});

          async function fetchData(id) {
            setData(null);
            setCache({});

            const result = await api.get(\`/data/\${id}\`);

            setData(result);
            setCache({ [id]: result });
          }

          return { data, cache, fetchData };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setCache' },
          },
        ],
      },

      // ===== useEffect PATTERNS =====

      // Invalid: useEffect with async effects and state updates
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          useEffect(() => {
            async function fetchData() {
              setData(null);
              const result = await api.get('/data');
              setData(result);
            }
            fetchData();
          }, []);
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: useEffect with complex async pattern
      {
        code: `
        function Component() {
          const [users, setUsers] = useState([]);
          const [loading, setLoading] = useState(false);

          useEffect(() => {
            async function loadData() {
              setUsers([]);
              setLoading(true);

              const userData = await api.get('/users');

              setUsers(userData);
              setLoading(false);
            }
            loadData();
          }, []);
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setUsers' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setLoading' },
          },
        ],
      },

      // ===== ADVANCED ASYNC PATTERNS =====

      // Invalid: Promise.all with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadMultiple() {
            setData(null);
            const [users, posts] = await Promise.all([
              api.get('/users'),
              api.get('/posts')
            ]);
            setData({ users, posts });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Async iterators with violations
      {
        code: `
        function Component() {
          const [status, setStatus] = useState('idle');

          async function* processData() {
            setStatus('processing');
            for await (const item of dataStream) {
              yield item;
            }
            setStatus('complete');
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setStatus' },
          },
        ],
      },

      // Invalid: Complex Promise chains with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function loadData() {
            setData(null);

            return api.get('/data')
              .then(response => response.json())
              .then(processedData => {
                setData(processedData);
              });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Nested Promise chains with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function loadData() {
            setData(null);

            return api.get('/initial')
              .then(initial => {
                return api.process(initial)
                  .then(processed => {
                    setData(processed);
                  });
              });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Generator with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          function* loadData() {
            setData(null);
            const result = yield api.get('/data');
            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Mixed async patterns with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function complexLoad() {
            setData(null);

            const initial = await api.get('/initial');

            return api.process(initial)
              .then(processed => {
                setData(processed);
                return processed;
              });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Error handling with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);

            try {
              const result = await api.get('/data');
              setData(result);
            } catch (error) {
              setData({ error: error.message });
            }
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Loop patterns with violations
      {
        code: `
        function Component() {
          const [items, setItems] = useState([]);

          async function loadItems(ids) {
            setItems([]);

            for (const id of ids) {
              const item = await api.get(\`/items/\${id}\`);
              // This creates a violation as setItems is called before and after await
            }

            setItems(allItems);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setItems' },
          },
        ],
      },

      // Invalid: Conditional async with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData(shouldLoad) {
            setData(null);

            if (shouldLoad) {
              const result = await api.get('/data');
              setData(result);
            }
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Conditional branches with async violation (even with early return)
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData(useCache) {
            if (useCache) {
              setData(cachedData);
              return;
            }

            const result = await api.get('/data');
            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Multiple async boundaries with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);

            const step1 = await api.get('/step1');
            const step2 = await api.get('/step2');
            const step3 = await api.get('/step3');

            setData({ step1, step2, step3 });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Arrow function with violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          const loadData = async () => {
            setData(null);
            const result = await api.get('/data');
            setData(result);
          };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Function expression with violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          const loadData = async function() {
            setData(null);
            const result = await api.get('/data');
            setData(result);
          };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Destructured useState with violation
      {
        code: `
        function Component() {
          const [{ data }, setData] = useState({ data: null });

          async function loadData() {
            setData({ data: null });
            const result = await api.get('/data');
            setData({ data: result });
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Complex control flow with violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData(options) {
            setData(null);

            let result;
            if (options.useCache) {
              result = await getCachedData();
            } else {
              result = await api.get('/data');
            }

            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Nested async with violation in outer scope
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function outerFunction() {
            setData(null);

            async function innerFunction() {
              return await api.get('/data');
            }

            const result = await innerFunction();
            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Promise race with violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);

            const result = await Promise.race([
              api.get('/data1'),
              api.get('/data2')
            ]);

            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Promise.allSettled with violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);

            const results = await Promise.allSettled([
              api.get('/data1'),
              api.get('/data2')
            ]);

            setData(results);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },

      // Invalid: Async generator with multiple violations
      {
        code: `
        function Component() {
          const [status, setStatus] = useState('idle');
          const [progress, setProgress] = useState(0);

          async function* processItems() {
            setStatus('starting');
            setProgress(0);

            for await (const item of items) {
              yield item;
            }

            setStatus('complete');
            setProgress(100);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setStatus' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setProgress' },
          },
        ],
      },

      // Invalid: Timeout with async violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);

          async function loadDataWithTimeout() {
            setData(null);

            const timeoutPromise = new Promise(resolve =>
              setTimeout(resolve, 5000)
            );

            await Promise.race([
              api.get('/data'),
              timeoutPromise
            ]);

            setData(result);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
        ],
      },
    ],
  },
);
