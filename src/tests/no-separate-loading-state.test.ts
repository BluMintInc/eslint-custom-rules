import { ESLintUtils } from '@typescript-eslint/utils';
import { noSeparateLoadingState } from '../rules/no-separate-loading-state';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('no-separate-loading-state', noSeparateLoadingState, {
  valid: [
    // Valid: Using sentinel value in primary state
    {
      code: `
        import React, { useState } from 'react';

        function UserProfile() {
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

    // Valid: Boolean state that doesn't match loading patterns
    {
      code: `
        import React, { useState } from 'react';

        function Modal() {
          const [isOpen, setIsOpen] = useState(false);
          const [isVisible, setIsVisible] = useState(true);
          const [isEnabled, setIsEnabled] = useState(false);

          return <div>{isOpen && isVisible && isEnabled && 'Modal content'}</div>;
        }
      `,
    },

    // Valid: Non-React function
    {
      code: `
        function utilityFunction() {
          const [isLoading, setIsLoading] = useState(false);
          return isLoading;
        }
      `,
    },

    // Valid: Not a useState call
    {
      code: `
        import React from 'react';

        function Component() {
          const [isLoading, setIsLoading] = useCustomHook();
          return <div>{isLoading ? 'Loading...' : 'Done'}</div>;
        }
      `,
    },

    // Valid: Custom hook with proper naming
    {
      code: `
        function useData() {
          const [data, setData] = useState(null);
          const [error, setError] = useState(null);

          return { data, error, setData, setError };
        }
      `,
    },

    // Valid: Component with non-loading boolean states
    {
      code: `
        function Settings() {
          const [isDarkMode, setIsDarkMode] = useState(false);
          const [isNotificationEnabled, setIsNotificationEnabled] = useState(true);

          return <div>Settings</div>;
        }
      `,
    },

    // Valid: Arrow function component with proper state
    {
      code: `
        const UserCard = () => {
          const [user, setUser] = useState<User | 'loading' | null>(null);

          return <div>{user === 'loading' ? 'Loading...' : user?.name}</div>;
        };
      `,
    },

    // Valid: Custom hook with proper state management
    {
      code: `
        function useApiData() {
          const [data, setData] = useState<ApiResponse | 'loading' | 'error'>(null);

          const fetchData = async () => {
            setData('loading');
            try {
              const response = await fetch('/api/data');
              setData(response);
            } catch {
              setData('error');
            }
          };

          return { data, fetchData };
        }
      `,
    },
  ],

  invalid: [
    // Invalid: isProfileLoading pattern
    {
      code: `
        import React, { useState } from 'react';

        function UserProfile() {
          const [profile, setProfile] = useState(null);
          const [isProfileLoading, setIsProfileLoading] = useState(false);

          async function loadProfile(id: string) {
            setIsProfileLoading(true);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setIsProfileLoading(false);
          }

          return <div>{isProfileLoading ? 'Loading...' : profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: isLoadingProfile pattern
    {
      code: `
        import React, { useState } from 'react';

        function UserProfile() {
          const [profile, setProfile] = useState(null);
          const [isLoadingProfile, setIsLoadingProfile] = useState(false);

          async function loadProfile(id: string) {
            setIsLoadingProfile(true);
            const data = await api.get(\`/users/\${id}\`);
            setProfile(data);
            setIsLoadingProfile(false);
          }

          return <div>{isLoadingProfile ? 'Loading...' : profile?.name}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: isDataLoading pattern
    {
      code: `
        import React, { useState } from 'react';

        function DataTable() {
          const [data, setData] = useState([]);
          const [isDataLoading, setIsDataLoading] = useState(false);

          return <div>{isDataLoading ? 'Loading data...' : data.length}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: isLoadingData pattern
    {
      code: `
        import React, { useState } from 'react';

        function DataTable() {
          const [data, setData] = useState([]);
          const [isLoadingData, setIsLoadingData] = useState(false);

          return <div>{isLoadingData ? 'Loading data...' : data.length}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Multiple loading states
    {
      code: `
        import React, { useState } from 'react';

        function Dashboard() {
          const [users, setUsers] = useState([]);
          const [posts, setPosts] = useState([]);
          const [isUsersLoading, setIsUsersLoading] = useState(false);
          const [isLoadingPosts, setIsLoadingPosts] = useState(false);

          return <div>Dashboard</div>;
        }
      `,
      errors: [
        { messageId: 'noSeparateLoadingState' },
        { messageId: 'noSeparateLoadingState' }
      ],
    },

    // Invalid: Custom hook with loading state
    {
      code: `
        function useUserData() {
          const [user, setUser] = useState(null);
          const [isUserLoading, setIsUserLoading] = useState(false);

          const fetchUser = async (id) => {
            setIsUserLoading(true);
            const userData = await api.get(\`/users/\${id}\`);
            setUser(userData);
            setIsUserLoading(false);
          };

          return { user, isUserLoading, fetchUser };
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Arrow function component
    {
      code: `
        const ProductList = () => {
          const [products, setProducts] = useState([]);
          const [isProductsLoading, setIsProductsLoading] = useState(false);

          return <div>{isProductsLoading ? 'Loading...' : products.length}</div>;
        };
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Function expression assigned to variable
    {
      code: `
        const OrderHistory = function() {
          const [orders, setOrders] = useState([]);
          const [isLoadingOrders, setIsLoadingOrders] = useState(false);

          return <div>Orders</div>;
        };
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Case insensitive matching
    {
      code: `
        function WeatherWidget() {
          const [weather, setWeather] = useState(null);
          const [isweatherloading, setIsWeatherLoading] = useState(false);

          return <div>Weather</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Complex loading state name
    {
      code: `
        function FileUploader() {
          const [files, setFiles] = useState([]);
          const [isFileUploadLoading, setIsFileUploadLoading] = useState(false);

          return <div>File Uploader</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: isLoading with suffix
    {
      code: `
        function ImageGallery() {
          const [images, setImages] = useState([]);
          const [isLoadingImages, setIsLoadingImages] = useState(false);

          return <div>Gallery</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Multiple words in loading state
    {
      code: `
        function UserProfileSettings() {
          const [settings, setSettings] = useState({});
          const [isUserProfileSettingsLoading, setIsUserProfileSettingsLoading] = useState(false);

          return <div>Settings</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Mixed case variations
    {
      code: `
        function ApiClient() {
          const [data, setData] = useState(null);
          const [isAPILoading, setIsAPILoading] = useState(false);

          return <div>API Client</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Loading state in nested component
    {
      code: `
        function App() {
          const NestedComponent = () => {
            const [data, setData] = useState(null);
            const [isDataLoading, setIsDataLoading] = useState(false);

            return <div>Nested</div>;
          };

          return <NestedComponent />;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Hook with loading state
    {
      code: `
        function useApiCall() {
          const [result, setResult] = useState(null);
          const [isResultLoading, setIsResultLoading] = useState(false);

          return { result, isResultLoading };
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Component with async operation pattern
    {
      code: `
        function DataFetcher() {
          const [data, setData] = useState(null);
          const [isDataLoading, setIsDataLoading] = useState(false);

          const fetchData = async () => {
            setIsDataLoading(true);
            try {
              const response = await fetch('/api/data');
              setData(response);
            } finally {
              setIsDataLoading(false);
            }
          };

          return <div onClick={fetchData}>{isDataLoading ? 'Loading...' : 'Click to load'}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Component with .get() API call pattern
    {
      code: `
        function UserDetails() {
          const [user, setUser] = useState(null);
          const [isUserLoading, setIsUserLoading] = useState(false);

          const loadUser = () => {
            setIsUserLoading(true);
            api.get('/user/123').then(data => {
              setUser(data);
              setIsUserLoading(false);
            });
          };

          return <div>User Details</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Simple loading state without async pattern (should still be flagged)
    {
      code: `
        function SimpleComponent() {
          const [data, setData] = useState(null);
          const [isLoading, setIsLoading] = useState(false);

          return <div>{isLoading ? 'Loading...' : 'Done'}</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // Invalid: Loading state with different casing
    {
      code: `
        function TestComponent() {
          const [items, setItems] = useState([]);
          const [IsItemsLoading, setIsItemsLoading] = useState(false);

          return <div>Test</div>;
        }
      `,
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },
  ],
});
