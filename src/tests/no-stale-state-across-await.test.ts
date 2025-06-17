import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

ruleTesterJsx.run('no-stale-state-across-await', noStaleStateAcrossAwait, {
  valid: [
    // Valid: Single update after await (atomic update)
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: No useState at all
    {
      code: `
        function Component() {
          async function loadData() {
            const data = await api.get('/data');
            console.log(data);
          }

          return <div>Hello</div>;
        }
      `,
    },

    // Valid: useState but no async boundaries
    {
      code: `
        function Component() {
          const [count, setCount] = useState(0);

          function increment() {
            setCount(count + 1);
            setCount(count + 2);
          }

          return <div>{count}</div>;
        }
      `,
    },

    // Valid: Different state setters before and after
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);
          const [loading, setLoading] = useState(false);

          async function loadProfile(id) {
            setLoading(true);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{loading ? 'Loading...' : profile?.name}</div>;
        }
      `,
    },

    // Valid: Only calls before async boundary
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            console.log(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Only calls after async boundary
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Separate functions with their own scopes
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
          }

          async function saveProfile(data) {
            await api.post('/users', data);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Using .then() but different setters
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);
          const [error, setError] = useState(null);

          function loadProfile(id) {
            setError(null);
            api.get(\`/users/\${id}\`).then(data => {
              setProfile(data);
            });
          }

          return <div>{error || profile?.name}</div>;
        }
      `,
    },

    // Valid: yield expression but different setters
    {
      code: `
        function* Component() {
          const [profile, setProfile] = useState(null);
          const [loading, setLoading] = useState(false);

          function* loadProfile(id) {
            setLoading(true);
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{loading ? 'Loading...' : profile?.name}</div>;
        }
      `,
    },

    // Valid: Nested functions with separate scopes
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function outerFunction() {
            setProfile(null);

            async function innerFunction() {
              const data = await api.get('/users/1');
              setProfile(data);
            }

            await innerFunction();
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Arrow functions
    {
      code: `
        const Component = () => {
          const [profile, setProfile] = useState(null);

          const loadProfile = async (id) => {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        };
      `,
    },

    // Valid: Function expressions
    {
      code: `
        const Component = function() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async function(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        };
      `,
    },

    // Valid: Multiple async boundaries but same pattern
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);
          const [posts, setPosts] = useState([]);

          async function loadData(id) {
            const profileData = await api.get(\`/users/\${id}\`);
            setProfile(profileData);

            const postsData = await api.get(\`/users/\${id}/posts\`);
            setPosts(postsData);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Different setters before and after (loading pattern)
    {
      code: `
        function Component() {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);

          async function complexLoad() {
            setLoading(true);

            try {
              const result1 = await api.get('/step1');
              const result2 = await api.get('/step2');
              const final = await api.get('/final');

              setData(final);
            } catch (error) {
              console.error(error);
            } finally {
              setLoading(false);
            }
          }

          return <div>{loading ? 'Loading...' : data}</div>;
        }
      `,
    },

    // Valid: Promise.all pattern
    {
      code: `
        function Component() {
          const [results, setResults] = useState([]);

          async function loadAll() {
            const [data1, data2, data3] = await Promise.all([
              api.get('/data1'),
              api.get('/data2'),
              api.get('/data3')
            ]);

            setResults([data1, data2, data3]);
          }

          return <div>{results.length}</div>;
        }
      `,
    },
  ],

  invalid: [
    // Invalid: Basic case with await
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Using .then()
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          function loadProfile(id) {
            setProfile(null);
            api.get(\`/users/\${id}\`).then(data => {
              setProfile(data);
            });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Using yield
    {
      code: `
        function* Component() {
          const [profile, setProfile] = useState(null);

          function* loadProfile(id) {
            setProfile(null);
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Multiple calls before and after
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            setProfile(undefined);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setProfile({...data, loaded: true});
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Arrow function
    {
      code: `
        const Component = () => {
          const [profile, setProfile] = useState(null);

          const loadProfile = async (id) => {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        };
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Function expression
    {
      code: `
        const Component = function() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async function(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        };
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Multiple state variables, both violating
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);
          const [loading, setLoading] = useState(false);

          async function loadProfile(id) {
            setProfile(null);
            setLoading(true);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setLoading(false);
          }

          return <div>{loading ? 'Loading...' : profile?.name}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } },
        { messageId: 'staleStateAcrossAwait', data: { setterName: 'setLoading' } }
      ],
    },

    // Invalid: Multiple async boundaries
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const step1 = await api.get('/step1');
            const step2 = await api.get('/step2');
            setProfile(step2);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Complex nesting but still violating
    {
      code: `
        function Component() {
          const [data, setData] = useState(null);

          async function complexLoad() {
            setData(null);

            try {
              const result = await api.get('/data');
              if (result.success) {
                setData(result.data);
              }
            } catch (error) {
              setData({ error: true });
            }
          }

          return <div>{data}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setData' } }],
    },

    // Invalid: Chained .then() calls
    {
      code: `
        function Component() {
          const [result, setResult] = useState(null);

          function loadData() {
            setResult(null);
            api.get('/data')
              .then(response => response.json())
              .then(data => {
                setResult(data);
              });
          }

          return <div>{result}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setResult' } }],
    },

    // Invalid: Mixed await and .then()
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const userData = await api.get(\`/users/\${id}\`);

            api.get(\`/users/\${id}/details\`)
              .then(details => {
                setProfile({...userData, ...details});
              });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Generator function with yield
    {
      code: `
        function Component() {
          const [items, setItems] = useState([]);

          function* processItems() {
            setItems([]);
            const batch1 = yield fetchBatch(1);
            const batch2 = yield fetchBatch(2);
            setItems([...batch1, ...batch2]);
          }

          return <div>{items.length}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setItems' } }],
    },

    // Invalid: Async IIFE
    {
      code: `
        function Component() {
          const [data, setData] = useState(null);

          (async () => {
            setData(null);
            const result = await api.get('/data');
            setData(result);
          })();

          return <div>{data}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setData' } }],
    },

    // Invalid: useEffect with async function
    {
      code: `
        function Component() {
          const [profile, setProfile] = useState(null);

          useEffect(() => {
            async function loadProfile() {
              setProfile(null);
              const data = await api.get('/profile');
              setProfile(data);
            }
            loadProfile();
          }, []);

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setProfile' } }],
    },

    // Invalid: Event handler with async
    {
      code: `
        function Component() {
          const [status, setStatus] = useState('idle');

          const handleClick = async () => {
            setStatus('loading');
            await new Promise(resolve => setTimeout(resolve, 1000));
            setStatus('complete');
          };

          return <button onClick={handleClick}>{status}</button>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait', data: { setterName: 'setStatus' } }],
    },
  ],
});
