import { ruleTesterJsx } from '../utils/ruleTester';
import { noSeparateLoadingState } from '../rules/no-separate-loading-state';

ruleTesterJsx.run('no-separate-loading-state', noSeparateLoadingState, {
  valid: [
    // Valid: Using sentinel value in primary state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState<User | null | 'loading'>(null);

          async function loadProfile(id: string) {
            setProfile('loading');
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
          }

          return <div>{profile === 'loading' ? 'Loading...' : profile?.name}</div>;
        }
      `,
    },

    // Valid: Non-loading boolean state
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [isModalOpen, setIsModalOpen] = useState(false);
          const [isVisible, setIsVisible] = useState(true);

          return (
            <div>
              <button onClick={() => setIsModalOpen(true)}>Open Modal</button>
              <div style={{ display: isVisible ? 'block' : 'none' }}>Content</div>
            </div>
          );
        }
      `,
    },

    // Valid: Loading state that doesn't match patterns
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [loading, setLoading] = useState(false);
          const [busy, setBusy] = useState(false);

          return <div>{loading ? 'Loading...' : 'Done'}</div>;
        }
      `,
    },







    // Valid: Different variable name patterns
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profileLoading, setProfileLoading] = useState(false);
          const [loadingProfile, setLoadingProfile] = useState(false);

          return <div>Content</div>;
        }
      `,
    },
  ],

  invalid: [
    // Invalid: isXLoading pattern with async operations
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState<User | null>(null);
          const [isProfileLoading, setIsProfileLoading] = useState(false);

          async function loadProfile(id: string) {
            setIsProfileLoading(true);
            try {
              const data = await api.get(\`/users/\${id}\`);
              setProfile(data);
            } finally {
              setIsProfileLoading(false);
            }
          }

          return <div>{isProfileLoading ? 'Loading...' : profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: isLoadingX pattern with async operations
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [avatar, setAvatar] = useState<string | null>(null);
          const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);

          async function loadAvatar(id: string) {
            setIsLoadingAvatar(true);
            const data = await fetch(\`/avatars/\${id}\`);
            setAvatar(data.url);
            setIsLoadingAvatar(false);
          }

          return <div>{isLoadingAvatar ? 'Loading...' : <img src={avatar} />}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Multiple loading states
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [isProfileLoading, setIsProfileLoading] = useState(false);
          const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);

          async function loadData() {
            setIsProfileLoading(true);
            setIsLoadingAvatar(true);

            const [profileData, avatarData] = await Promise.all([
              api.get('/profile'),
              api.get('/avatar')
            ]);

            setProfile(profileData);
            setIsProfileLoading(false);
            setIsLoadingAvatar(false);
          }

          return <div>Content</div>;
        }
      `,
      errors: [
        { messageId: 'noSeparateLoadingState' },
        { messageId: 'noSeparateLoadingState' }
      ],
    },

    // Invalid: Case insensitive matching
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);
          const [ISDATALOADING, setISDATALOADING] = useState(false);

          async function loadData() {
            setISDATALOADING(true);
            const result = await api.get('/data');
            setData(result);
            setISDATALOADING(false);
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: With promise-based async operations
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [users, setUsers] = useState([]);
          const [isUsersLoading, setIsUsersLoading] = useState(false);

          function loadUsers() {
            setIsUsersLoading(true);
            api.get('/users')
              .then(data => {
                setUsers(data);
                setIsUsersLoading(false);
              })
              .catch(() => {
                setIsUsersLoading(false);
              });
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: In custom hook
    {
      code: `
        import { useState } from 'react';

        function useProfile(id: string) {
          const [profile, setProfile] = useState(null);
          const [isProfileLoading, setIsProfileLoading] = useState(false);

          async function fetchProfile() {
            setIsProfileLoading(true);
            try {
              const data = await api.get(\`/profile/\${id}\`);
              setProfile(data);
            } finally {
              setIsProfileLoading(false);
            }
          }

          return { profile, isProfileLoading, fetchProfile };
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Different async patterns
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [posts, setPosts] = useState([]);
          const [isPostsLoading, setIsPostsLoading] = useState(false);

          function loadPosts() {
            setIsPostsLoading(true);
            fetch('/posts')
              .then(response => response.json())
              .then(data => {
                setPosts(data);
              })
              .finally(() => {
                setIsPostsLoading(false);
              });
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Arrow function with async
    {
      code: `
        import React, { useState } from 'react';

        const Component = () => {
          const [data, setData] = useState(null);
          const [isDataLoading, setIsDataLoading] = useState(false);

          const loadData = async () => {
            setIsDataLoading(true);
            const result = await api.get('/data');
            setData(result);
            setIsDataLoading(false);
          };

          return <div>Content</div>;
        };
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Nested async operations
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [items, setItems] = useState([]);
          const [isItemsLoading, setIsItemsLoading] = useState(false);

          function loadItems() {
            setIsItemsLoading(true);

            async function fetchData() {
              const data = await api.get('/items');
              setItems(data);
              setIsItemsLoading(false);
            }

            fetchData();
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: With HTTP method calls
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [user, setUser] = useState(null);
          const [isUserLoading, setIsUserLoading] = useState(false);

          function createUser(userData) {
            setIsUserLoading(true);
            api.post('/users', userData)
              .then(response => {
                setUser(response.data);
                setIsUserLoading(false);
              });
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Complex loading state pattern
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [profile, setProfile] = useState(null);
          const [isProfileLoading, setIsProfileLoading] = useState(false);

          async function handleSubmit() {
            setIsProfileLoading(true);

            try {
              await api.put('/profile', profile);
              const updatedProfile = await api.get('/profile');
              setProfile(updatedProfile);
            } catch (error) {
              console.error(error);
            } finally {
              setIsProfileLoading(false);
            }
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Loading state with boolean literals
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [data, setData] = useState(null);
          const [isLoadingData, setIsLoadingData] = useState(false);

          async function fetchData() {
            setIsLoadingData(true);
            const result = await api.get('/data');
            setData(result);
            setIsLoadingData(false);
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Loading state with identifier boolean values
    {
      code: `
        import React, { useState } from 'react';

        function Component() {
          const [content, setContent] = useState('');
          const [isContentLoading, setIsContentLoading] = useState(false);

          async function loadContent() {
            const loading = true;
            const notLoading = false;

            setIsContentLoading(loading);
            const data = await api.get('/content');
            setContent(data);
            setIsContentLoading(notLoading);
          }

          return <div>Content</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },
  ],
});
