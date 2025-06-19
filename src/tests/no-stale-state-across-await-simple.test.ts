import { ruleTesterJsx } from '../utils/ruleTester';
import { noStaleStateAcrossAwait } from '../rules/no-stale-state-across-await';

ruleTesterJsx.run('no-stale-state-across-await-simple', noStaleStateAcrossAwait, {
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
        {
          messageId: 'staleStateAcrossAwait',
          data: { setterName: 'setProfile' },
        },
      ],
    },

    // Invalid: Basic violation with .then()
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
        {
          messageId: 'staleStateAcrossAwait',
          data: { setterName: 'setProfile' },
        },
      ],
    },
  ],
});
