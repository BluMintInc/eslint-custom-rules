import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

/*
 * Test suite for specific patterns mentioned in the feedback
 *
 * This test suite covers the exact patterns requested:
 * 1. Class Components with setState patterns
 * 2. useReducer patterns with dispatch across async
 * 3. Custom hooks with async state management
 * 4. useEffect patterns with async effects
 * 5. Advanced async patterns (Promise.all, async iterators)
 */

ruleTesterJsx.run(
  'no-stale-state-across-await-feedback-patterns',
  noStaleStateAcrossAwait,
  {
    valid: [
      // ===== 1. CLASS COMPONENTS =====
      // Note: The rule currently only tracks useState setters, not setState
      // This is by design as the rule is specifically for React hooks

      // Valid: Class component setState patterns (not tracked by this rule)
      {
        code: `
        class Component extends React.Component {
          async loadData() {
            this.setState({ loading: true });
            const data = await api.get('/data');
            this.setState({ data, loading: false });
          }
        }
      `,
      },

      // Valid: Class component with complex setState patterns
      {
        code: `
        class Component extends React.Component {
          state = { data: null, loading: false, error: null };

          async loadData() {
            this.setState({ loading: true, error: null });

            try {
              const data = await api.get('/data');
              this.setState({ data, loading: false });
            } catch (error) {
              this.setState({ error: error.message, loading: false });
            }
          }

          clearData() {
            this.setState({ data: null });
          }
        }
      `,
      },

      // ===== 2. useReducer PATTERNS =====
      // Note: The rule currently only tracks useState setters, not useReducer dispatch
      // This is by design as dispatch calls are different from useState setters

      // Valid: useReducer dispatch across async (not tracked by this rule)
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

      // Valid: Complex useReducer patterns
      {
        code: `
        function Component() {
          const [state, dispatch] = useReducer(reducer, initialState);

          async function loadData() {
            dispatch({ type: 'LOADING_START' });

            try {
              const data = await api.get('/data');
              dispatch({ type: 'LOADING_SUCCESS', payload: data });
            } catch (error) {
              dispatch({ type: 'LOADING_ERROR', payload: error.message });
            }
          }

          function resetData() {
            dispatch({ type: 'RESET' });
          }
        }
      `,
      },

      // ===== 3. CUSTOM HOOKS =====

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

      // Valid: Custom hook with truly separate loading state (different functions)
      {
        code: `
        function useAsyncData() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          function startLoading() {
            setLoading(true);
          }

          async function fetchData() {
            const result = await api.get('/data');
            setData(result);
            setLoading(false);
          }

          return { data, loading, fetchData, startLoading };
        }
      `,
      },

      // ===== 4. useEffect PATTERNS =====

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

      // Valid: useEffect with separate loading state (different functions)
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          useEffect(() => {
            setLoading(true);

            async function fetchData() {
              const result = await api.get('/data');
              setData(result);
            }

            fetchData().finally(() => setLoading(false));
          }, []);
        }
      `,
      },

      // ===== 5. ADVANCED ASYNC PATTERNS =====

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

      // Valid: Async iterators with different setters
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

      // Valid: Complex async iterator pattern
      {
        code: `
        function Component() {
          const [progress, setProgress] = useState(0);
          const [results, setResults] = useState([]);

          async function* processItems(items) {
            const results = [];
            for await (const [index, item] of items.entries()) {
              const processed = yield processItem(item);
              results.push(processed);
              setProgress((index + 1) / items.length * 100);
            }
            setResults(results);
          }
        }
      `,
      },
    ],

    invalid: [
      // ===== 3. CUSTOM HOOKS =====

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
        function useAsyncData() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          async function fetchData() {
            setData(null);
            setError(null);

            try {
              const result = await api.get('/data');
              setData(result);
            } catch (err) {
              setError(err.message);
            }
          }

          return { data, error, fetchData };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setError' },
          },
        ],
      },

      // Invalid: Custom hook with loading pattern violation
      {
        code: `
        function useAsyncData() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          async function fetchData() {
            setLoading(true);
            try {
              const result = await api.get('/data');
              setData(result);
            } finally {
              setLoading(false);
            }
          }

          return { data, loading, fetchData };
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setLoading' },
          },
        ],
      },

      // ===== 4. useEffect PATTERNS =====

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
          const [posts, setPosts] = useState([]);

          useEffect(() => {
            async function loadData() {
              setUsers([]);
              setPosts([]);

              const userData = await api.get('/users');
              setUsers(userData);

              const postsData = await api.get('/posts');
              setPosts(postsData);
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
            data: { setterName: 'setPosts' },
          },
        ],
      },

      // Invalid: useEffect with loading pattern violation
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          useEffect(() => {
            async function fetchData() {
              setLoading(true);
              try {
                const result = await api.get('/data');
                setData(result);
              } finally {
                setLoading(false);
              }
            }
            fetchData();
          }, []);
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setLoading' },
          },
        ],
      },

      // ===== 5. ADVANCED ASYNC PATTERNS =====

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

      // Invalid: Promise.all with complex violations
      {
        code: `
        function Component() {
          const [users, setUsers] = useState([]);
          const [posts, setPosts] = useState([]);
          const [loading, setLoading] = useState(false);

          async function loadMultiple() {
            setUsers([]);
            setPosts([]);
            setLoading(true);

            const [usersData, postsData] = await Promise.all([
              api.get('/users'),
              api.get('/posts')
            ]);

            setUsers(usersData);
            setPosts(postsData);
            setLoading(false);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setUsers' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setPosts' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setLoading' },
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

      // Invalid: Complex async iterator with multiple violations
      {
        code: `
        function Component() {
          const [status, setStatus] = useState('idle');
          const [progress, setProgress] = useState(0);
          const [results, setResults] = useState([]);

          async function* processItems(items) {
            setStatus('starting');
            setProgress(0);
            setResults([]);

            for await (const [index, item] of items.entries()) {
              const processed = yield processItem(item);
              setProgress((index + 1) / items.length * 100);
            }

            setStatus('complete');
            setResults(allResults);
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
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setResults' },
          },
        ],
      },

      // Invalid: Promise.race with violations
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

      // Invalid: Promise.allSettled with violations
      {
        code: `
        function Component() {
          const [results, setResults] = useState([]);

          async function loadData() {
            setResults([]);

            const results = await Promise.allSettled([
              api.get('/data1'),
              api.get('/data2'),
              api.get('/data3')
            ]);

            setResults(results);
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setResults' },
          },
        ],
      },

      // Invalid: Mixed Promise patterns with violations
      {
        code: `
        function Component() {
          const [data, setData] = useState(null);
          const [status, setStatus] = useState('idle');

          async function complexLoad() {
            setData(null);
            setStatus('loading');

            const initial = await Promise.resolve(api.get('/initial'));
            const processed = await Promise.all([
              api.process(initial),
              api.validate(initial)
            ]);

            setData(processed);
            setStatus('complete');
          }
        }
      `,
        errors: [
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setData' },
          },
          {
            messageId: 'staleStateAcrossAwait',
            data: { setterName: 'setStatus' },
          },
        ],
      },
    ],
  },
);
