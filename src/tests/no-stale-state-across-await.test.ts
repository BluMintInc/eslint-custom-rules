import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

ruleTesterJsx.run('no-stale-state-across-await', noStaleStateAcrossAwait, {
  valid: [
    // Atomic update - good pattern
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

    // No async boundaries
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);

          function increment() {
            setCount(0);
            setCount(count + 1);
          }

          return <div>{count}</div>;
        }
      `,
    },

    // Different setters across await
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

    // Single setter call
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            const result = await api.get('/data');
            setData(result);
          }

          return <div>{data}</div>;
        }
      `,
    },

    // Nested functions should be analyzed separately
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function outerFunction() {
            setProfile(null);

            async function innerFunction() {
              const data = await api.get('/profile');
              setProfile(data);
            }

            innerFunction();
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Promise.then() with different setters
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [loading, setLoading] = useState(false);
          const [data, setData] = useState(null);

          function loadData() {
            setLoading(true);
            api.get('/data').then(result => {
              setData(result);
            });
          }

          return <div>{loading ? 'Loading...' : data}</div>;
        }
      `,
    },

    // Promise.then() with same setter - should NOT be flagged (callback is different scope)
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          function loadData() {
            setData(null);
            api.get('/data').then(result => {
              setData(result);
            });
          }

          return <div>{data}</div>;
        }
      `,
    },

    // Generator function with different setters
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [step, setStep] = useState(0);
          const [result, setResult] = useState(null);

          function* processSteps() {
            setStep(1);
            yield delay(1000);
            setResult('done');
          }

          return <div>Step: {step}, Result: {result}</div>;
        }
      `,
    },

    // No useState in function
    {
      code: `
        import React from 'react';

        function Component() {
          async function doSomething() {
            console.log('before');
            await delay(1000);
            console.log('after');
          }

          return <div>Hello</div>;
        }
      `,
    },

    // useState but no setter calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            await api.get('/data');
            // No setter calls
          }

          return <div>{data}</div>;
        }
      `,
    },

    // Conditional setter calls (still valid pattern)
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          async function loadData(shouldClear) {
            if (shouldClear) {
              setData(null);
            }
            const result = await api.get('/data');
            if (result.success) {
              setData(result.data);
            }
          }

          return <div>{data}</div>;
        }
      `,
    },
  ],

  invalid: [
    // Basic violation - same setter before and after await
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
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Violation with Promise.then() - but setter in callback is different scope
    // This should NOT be flagged because the second setData is in a callback function
    // Let's change this to a case that should be flagged
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          async function loadData() {
            setData(null);
            const result = await api.get('/data');
            setData(result);
          }

          return <div>{data}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Violation with yield
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [status, setStatus] = useState('idle');

          function* processData() {
            setStatus('processing');
            yield delay(1000);
            setStatus('done');
          }

          return <div>{status}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Multiple violations - same setter called multiple times across boundaries
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [state, setState] = useState('initial');

          async function process() {
            setState('step1');
            await delay(100);
            setState('step2');
            await delay(100);
            setState('final');
          }

          return <div>{state}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Multiple setters, both violating
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          async function loadData() {
            setData(null);
            setError(null);
            try {
              const result = await api.get('/data');
              setData(result);
            } catch (err) {
              setError(err);
            }
          }

          return <div>{error || data}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Arrow function with violation
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [loading, setLoading] = useState(false);

          const handleClick = async () => {
            setLoading(true);
            await doSomething();
            setLoading(false);
          };

          return <button onClick={handleClick}>{loading ? 'Loading...' : 'Click me'}</button>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Function expression with violation
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [count, setCount] = useState(0);

          const increment = async function() {
            setCount(0);
            await delay(100);
            setCount(prev => prev + 1);
          };

          return <div>{count}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Complex case with multiple async boundaries
    // Note: setStatus('processing') in .then() callback is in different scope, so not flagged
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [status, setStatus] = useState('idle');

          async function complexProcess() {
            setStatus('starting');
            await step1();

            api.get('/data').then(data => {
              setStatus('processing');
            });

            await step2();
            setStatus('done');
          }

          return <div>{status}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Violation in useEffect-like pattern
    {
      code: `
        import React, { useState, useEffect } from 'react';

        function Component() {
          const [data, setData] = useState(null);

          useEffect(() => {
            async function fetchData() {
              setData(null);
              const result = await fetch('/api/data');
              setData(result);
            }
            fetchData();
          }, []);

          return <div>{data}</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },

    // Violation with destructured useState
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [user, setUser] = useState(null);
          const [posts, setPosts] = useState([]);

          async function loadUserData(userId) {
            setUser(null);
            setPosts([]);

            const userData = await api.getUser(userId);
            setUser(userData);

            const userPosts = await api.getUserPosts(userId);
            setPosts(userPosts);
          }

          return <div>{user?.name} has {posts.length} posts</div>;
        }
      `,
      errors: [
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
        { messageId: 'staleStateAcrossAwait' },
      ],
    },
  ],
});
