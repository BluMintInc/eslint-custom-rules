import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

/*
 * Note: Loading sentinel pattern with explicit disable comment
 *
 * When intentionally using loading sentinels (e.g., setProfile('loading')),
 * the rule should be disabled with an explicit comment to document the intent:
 *
 * // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await
 * setProfile('loading');
 *
 * This pattern is discouraged by default but can be used when necessary.
 */

const expectStaleStateError = (
  setterName: string,
  boundaryType: string,
) => ({
  messageId: 'staleStateAcrossAwait' as const,
  data: { setterName, boundaryType },
});

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

    // Valid: No useState calls
    {
      code: `
        async function fetchData() {
          const data = await api.get('/data');
          return data;
        }
      `,
    },

    // Valid: useState calls without async boundaries
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

    // Valid: Different setters across await
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

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Setter calls in different functions
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function clearProfile() {
            setProfile(null);
          }

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Only calls before await
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);
            setProfile(undefined);
            const data = await api.get(\`/users/\${id}\`);
            console.log(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Only calls after await
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setProfile(data.processed);
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

          async function loadProfile(id) {
            setProfile(null);

            const nestedFunction = async () => {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            };

            await nestedFunction();
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Using .then() without setter calls across boundary
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

    // Valid: Generator function without violations
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

    // Valid: Multiple async boundaries but no violations
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

    // Valid: Complex control flow without violations
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            if (id) {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            } else {
              setProfile(null);
            }
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

    // Valid: Multiple useState hooks with different setters (no violations)
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [loading, setLoading] = useState(false);
          const [error, setError] = useState(null);

          async function loadProfile(id) {
            setLoading(true);

            try {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            } catch (err) {
              setError(err.message);
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },

    // Valid: Conditional setter calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            const data = await api.get(\`/users/\${id}\`);
            if (data.isValid) {
              setProfile(data);
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
    },
  ],

  invalid: [
    // Invalid: Basic violation with await
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
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Violation with .then()
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
      errors: [
        expectStaleStateError('setProfile', 'a .then() callback'),
      ],
    },

    // Invalid: Violation with yield
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
      errors: [
        expectStaleStateError('setProfile', 'a yield boundary'),
      ],
    },

    // Invalid: Multiple calls before and after
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
            setProfile(data.processed);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Multiple async boundaries with violation
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
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Arrow function with violation
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
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Function expression with violation
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
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Complex control flow with violation
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
            } catch (error) {
              setProfile({ error: error.message });
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Multiple setters both violating
    {
      code: `
        import React, { useState } from 'react';

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

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
        expectStaleStateError('setLoading', 'an await boundary'),
      ],
    },

    // Invalid: Nested async with violation in outer function
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            setProfile(null);

            const processData = async (rawData) => {
              return await api.process(rawData);
            };

            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Promise chain with violation
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function loadProfile(id) {
            setProfile(null);

            return api.get(\`/users/\${id}\`)
              .then(data => api.enrich(data))
              .then(enrichedData => {
                setProfile(enrichedData);
              });
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'a .then() callback'),
      ],
    },

    // Invalid: Generator with violation
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          function* loadProfile(id) {
            setProfile(null);
            const data = yield api.get(\`/users/\${id}\`);
            const processed = yield api.process(data);
            setProfile(processed);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'a yield boundary'),
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

            api.log(userData).then(() => {
              console.log('Logged');
            });

            setProfile(userData);
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Conditional calls still violate
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(id) {
            if (shouldClear) {
              setProfile(null);
            }

            const data = await api.get(\`/users/\${id}\`);

            if (data.isValid) {
              setProfile(data);
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },

    // Invalid: Loop with violation
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);

          async function loadProfile(ids) {
            setProfile(null);

            for (const id of ids) {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(prev => ({ ...prev, [id]: data }));
            }
          }

          return <div>{profile?.name}</div>;
        }
      `,
      errors: [
        expectStaleStateError('setProfile', 'an await boundary'),
      ],
    },
  ],
});
