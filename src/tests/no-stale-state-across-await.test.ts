import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

ruleTesterJsx.run('no-stale-state-across-await', noStaleStateAcrossAwait, {
  valid: [
    // Valid: Single update after await (atomic update)
    {
      code: `
        import React, { useState } from 'react';

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

    // Valid: No async boundaries
    {
      code: `
        import React, { useState } from 'react';

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

    // Valid: Different state setters
    {
      code: `
        import React, { useState } from 'react';

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
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            // No setter call after await
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Only calls after async boundary
    {
      code: `
        import React, { useState } from 'react';

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

    // Valid: .then() without double setter calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function loadProfile(id) {
            api.get(\`/users/\${id}\`).then(data => {
              setProfile(data);
            });
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: yield without double setter calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function* loadProfile(id) {
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Multiple async boundaries but no double setter calls for same setter
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [posts, setPosts] = useState([]);

          async function loadData(id) {
            const userData = await api.get(\`/users/\${id}\`);
            setProfile(userData);

            const postsData = await api.get(\`/users/\${id}/posts\`);
            setPosts(postsData);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Nested functions with separate scopes
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function outerFunction() {
            setProfile(null);

            async function innerFunction() {
              const data = await api.get('/users/1');
              setProfile(data);
            }

            innerFunction();
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Arrow function with async
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async (id) => {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Function expression
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async function(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Different setters, no stale state issue
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          async function fetchData() {
            try {
              const result = await api.get('/data');
              setData(result);
              setError(null);
            } catch (err) {
              setError(err.message);
            }
          }

          return <div>{data || error}</div>;
        }
      `,
    },

    // Valid: Different setters used before and after async
    {
      code: `
        import React, { useState } from 'react';

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

    // Valid: Setter calls in different control flow branches (no stale state)
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            if (id === 'cached') {
              setProfile(getCachedProfile());
            } else {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Promise.then() chain without double setter calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function loadProfile(id) {
            return api.get(\`/users/\${id}\`)
              .then(data => {
                setProfile(data);
                return data;
              });
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Generator function with yield
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function* profileGenerator(id) {
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Multiple async operations in sequence
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [posts, setPosts] = useState([]);

          async function loadUserData(id) {
            const userData = await api.get(\`/users/\${id}\`);
            setProfile(userData);

            const userPosts = await api.get(\`/users/\${id}/posts\`);
            setPosts(userPosts);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Async/await with try-catch
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [error, setError] = useState(null);

          async function loadProfile(id) {
            try {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
              setError(null);
            } catch (err) {
              setError(err.message);
            }
          }

          return <div>{profile?.name || error}</div>;
        }
      `,
    },

    // Valid: Setter calls in callback functions
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            setTimeout(() => {
              setProfile(data);
            }, 100);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: No useState usage
    {
      code: `
        import React from 'react';

        function Component() {
          async function doSomething() {
            const data = await api.get('/data');
            console.log(data);
          }

          return <div>Hello</div>;
        }
      `,
    },
  ],

  invalid: [
    // Invalid: Basic stale state pattern with await
    {
      code: `
        import React, { useState } from 'react';

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
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Stale state pattern with .then()
    {
      code: `
        import React, { useState } from 'react';

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
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Stale state pattern with yield
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function* loadProfile(id) {
            setProfile(null);
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Multiple setter calls across await
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            setProfile(undefined);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Invalid: Arrow function with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async (id) => {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Function expression with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          const loadProfile = async function(id) {
            setProfile(null);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          };

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Multiple async boundaries with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const userData = await api.get(\`/users/\${id}\`);
            const enrichedData = await api.get(\`/users/\${id}/details\`);
            setProfile({ ...userData, ...enrichedData });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Complex async flow with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          async function fetchData() {
            setData(null);
            try {
              const result = await api.get('/data');
              setData(result);
            } catch (err) {
              setData({ error: err.message });
            }
          }

          return <div>{data?.value || data?.error}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Invalid: Promise chain with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function loadProfile(id) {
            setProfile(null);
            return api.get(\`/users/\${id}\`)
              .then(data => {
                setProfile(data);
                return data;
              });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Generator with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function* profileGenerator(id) {
            setProfile(null);
            const data = yield api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Nested async with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);

            async function fetchUserData() {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            }

            await fetchUserData();
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Multiple useState hooks with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [settings, setSettings] = useState({});

          async function loadData(id) {
            setProfile(null);
            setSettings({});
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data.profile);
            setSettings(data.settings);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Invalid: Conditional stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id, reset = true) {
            if (reset) {
              setProfile(null);
            }
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Stale state in try-catch
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            try {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            } catch (err) {
              setProfile({ error: err.message });
            }
          }

          return <div>{profile?.name || profile?.error}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Invalid: Mixed async boundaries
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            const userData = await api.get(\`/users/\${id}\`);

            api.get(\`/users/\${id}/details\`).then(details => {
              setProfile({ ...userData, ...details });
            });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: setLoading pattern (common stale state issue)
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [loading, setLoading] = useState(false);

          async function loadProfile(id) {
            setLoading(true);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setLoading(false);
          }

          return <div>{loading ? 'Loading...' : profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Error handling with stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          async function fetchData() {
            setError(null);
            try {
              const result = await api.get('/data');
              setData(result);
            } catch (err) {
              setError(err.message);
            }
          }

          return <div>{data?.value || error}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },

    // Invalid: Conditional stale state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id, force = false) {
            if (force) {
              setProfile(null);
            }
            const data = await api.get(\`/users/\${id}\`);
            if (data) {
              setProfile(data);
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'staleStateAcrossAwait' }],
    },
  ],
});
