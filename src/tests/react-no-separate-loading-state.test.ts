import { ruleTesterJsx } from '../utils/ruleTester';
import { reactNoSeparateLoadingState } from '../rules/react-no-separate-loading-state';

ruleTesterJsx.run('react-no-separate-loading-state', reactNoSeparateLoadingState, {
  valid: [
    // ✅ Non-loading boolean states (should not trigger)
    {
      code: `
function MyComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Loading states with sentinel values (good pattern)
    {
      code: `
function MyComponent() {
  const [profile, setProfile] = useState<User | null | 'loading'>(null);

  async function loadProfile() {
    setProfile('loading');
    const data = await api.get('/users/1');
    setProfile(data);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Variables that almost match but shouldn't trigger
    {
      code: `
function MyComponent() {
  const [isLoadingIcon, setIsLoadingIcon] = useState(false); // UI element
  const [isDataLoad, setIsDataLoad] = useState(false); // Missing "ing"
  const [loadingState, setLoadingState] = useState(false); // Different pattern
  const [loading, setLoading] = useState(false); // Simple name
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Class components (outside scope)
    {
      code: `
class MyComponent extends React.Component {
  state = {
    isProfileLoading: false,
    isLoadingData: false
  };

  render() {
    return <div />;
  }
}`,
      filename: 'Component.tsx',
    },

    // ✅ Context definitions (outside scope)
    {
      code: `
const LoadingContext = createContext({
  isProfileLoading: false,
  isLoadingData: false
});`,
      filename: 'Context.tsx',
    },

    // ✅ Interface/type definitions (outside scope)
    {
      code: `
interface LoadingState {
  isProfileLoading: boolean;
  isLoadingData: boolean;
}

type UserState = {
  isUserLoading: boolean;
  isLoadingUser: boolean;
};`,
      filename: 'types.ts',
    },

    // ✅ useReducer patterns (outside scope)
    {
      code: `
function MyComponent() {
  const [state, dispatch] = useReducer(reducer, {
    isProfileLoading: false,
    isLoadingData: false
  });
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Loading states without async usage (no setter calls with booleans)
    {
      code: `
function MyComponent() {
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // No async usage, just reading the state
  if (isProfileLoading) {
    return <div>Loading...</div>;
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Non-React functions (outside scope)
    {
      code: `
function utilityFunction() {
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  setIsProfileLoading(true);
  return isProfileLoading;
}`,
      filename: 'utils.ts',
    },

    // ✅ Custom hooks that don't start with 'use' (outside scope)
    {
      code: `
function myHook() {
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  setIsProfileLoading(true);
  return isProfileLoading;
}`,
      filename: 'hooks.ts',
    },

    // ✅ Loading states with non-boolean values
    {
      code: `
function MyComponent() {
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  async function loadProfile() {
    setIsProfileLoading("loading"); // String, not boolean
    const data = await api.get('/users/1');
    setIsProfileLoading("done");
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: isLoading without specific entity (generic)
    {
      code: `
function MyComponent() {
  const [isLoading, setIsLoading] = useState(false);

  // Generic loading without async pattern
  return <div>{isLoading ? 'Loading...' : 'Done'}</div>;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Partial pattern matches that shouldn't trigger
    {
      code: `
function MyComponent() {
  const [isUserLoadingData, setIsUserLoadingData] = useState(false); // Doesn't end with "Loading"
  const [isDataLoadingState, setIsDataLoadingState] = useState(false); // Has extra suffix
  const [userIsLoading, setUserIsLoading] = useState(false); // Doesn't start with "is"
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Variables in arrow functions assigned to non-component variables
    {
      code: `
const helper = () => {
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  setIsProfileLoading(true);
  return isProfileLoading;
};`,
      filename: 'helpers.ts',
    },

    // ✅ Variables in function expressions assigned to non-component variables
    {
      code: `
const helper = function() {
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  setIsProfileLoading(true);
  return isProfileLoading;
};`,
      filename: 'helpers.ts',
    },

    // ✅ TypeScript generic type constraints
    {
      code: `
function MyComponent<T extends { isLoading: boolean }>() {
  const [data, setData] = useState<T | null>(null);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Object destructuring with loading patterns (not useState)
    {
      code: `
function MyComponent() {
  const { isProfileLoading, isLoadingData } = useContext(LoadingContext);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Array destructuring with non-useState calls
    {
      code: `
function MyComponent() {
  const [isLoading, setIsLoading] = useCustomHook();
  setIsLoading(true);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ useState with non-boolean initial value
    {
      code: `
function MyComponent() {
  const [isProfileLoading, setIsProfileLoading] = useState("idle");

  async function loadProfile() {
    setIsProfileLoading("loading");
    const data = await api.get('/profile');
    setIsProfileLoading("success");
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ useState with object initial value
    {
      code: `
function MyComponent() {
  const [isDataLoading, setIsDataLoading] = useState({ loading: false });

  async function loadData() {
    setIsDataLoading({ loading: true });
    const data = await api.get('/data');
    setIsDataLoading({ loading: false });
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Loading patterns in comments (should not trigger)
    {
      code: `
function MyComponent() {
  // This component has isProfileLoading and isLoadingData patterns in comments
  const [data, setData] = useState(null);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Loading patterns in string literals (should not trigger)
    {
      code: `
function MyComponent() {
  const message = "isProfileLoading and isLoadingData are patterns";
  const [data, setData] = useState(null);
  return <div>{message}</div>;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Loading patterns in JSX (should not trigger)
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  return <div data-testid="isProfileLoading">Content</div>;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Partial matches that shouldn't trigger
    {
      code: `
function MyComponent() {
  const [isLoadingButNotReally, setIsLoadingButNotReally] = useState(false);
  const [almostIsLoading, setAlmostIsLoading] = useState(false);
  const [isLoadingish, setIsLoadingish] = useState(false);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Multiple useState calls in one declaration (should not trigger)
    {
      code: `
function MyComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false),
        [isVisible, setIsVisible] = useState(true);
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: useState with computed property names (should not trigger)
    {
      code: `
function MyComponent() {
  const key = 'isLoading';
  const [state, setState] = useState({ [key]: false });
  return <div />;
}`,
      filename: 'Component.tsx',
    },

    // ✅ Edge case: Loading patterns in property access (should not trigger)
    {
      code: `
function MyComponent() {
  const [state, setState] = useState({ data: null });

  function updateState() {
    setState(prev => ({ ...prev, isProfileLoading: false }));
  }

  return <div />;
}`,
      filename: 'Component.tsx',
    },
  ],

  invalid: [
    // ❌ Basic isXLoading pattern
    {
      code: `
function MyComponent() {
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  async function loadProfile() {
    setIsProfileLoading(true);
    const data = await api.get('/users/1');
    setProfile(data);
    setIsProfileLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Basic isLoadingX pattern
    {
      code: `
function MyComponent() {
  const [profile, setProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  async function loadProfile() {
    setIsLoadingProfile(true);
    const data = await api.get('/users/1');
    setProfile(data);
    setIsLoadingProfile(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Multiple loading states
    {
      code: `
function MyComponent() {
  const [profile, setProfile] = useState(null);
  const [avatar, setAvatar] = useState(null);
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
    setAvatar(avatarData);
    setIsProfileLoading(false);
    setIsLoadingAvatar(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [
        { messageId: 'noSeparateLoadingState' },
        { messageId: 'noSeparateLoadingState' }
      ],
    },

    // ❌ Case insensitive matching
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  const [isdataloading, setIsdataloading] = useState(false);

  async function loadData() {
    setIsdataloading(true);
    const result = await api.get('/data');
    setData(result);
    setIsdataloading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Custom hook with loading state
    {
      code: `
function useProfile() {
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  async function loadProfile() {
    setIsProfileLoading(true);
    const data = await api.get('/profile');
    setProfile(data);
    setIsProfileLoading(false);
  }

  return { profile, isProfileLoading, loadProfile };
}`,
      filename: 'hooks.ts',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Arrow function component
    {
      code: `
const MyComponent = () => {
  const [data, setData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  const loadData = async () => {
    setIsDataLoading(true);
    const result = await api.get('/data');
    setData(result);
    setIsDataLoading(false);
  };

  return <div />;
};`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Function expression component
    {
      code: `
const MyComponent = function() {
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  async function loadUser() {
    setIsLoadingUser(true);
    const userData = await api.get('/user');
    setUser(userData);
    setIsLoadingUser(false);
  }

  return <div />;
};`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Generic isLoading with async usage
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadData() {
    setIsLoading(true);
    const result = await api.get('/data');
    setData(result);
    setIsLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Different async patterns - try/catch
    {
      code: `
function MyComponent() {
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  async function loadProfile() {
    try {
      setIsProfileLoading(true);
      const data = await api.get('/profile');
      setProfile(data);
    } finally {
      setIsProfileLoading(false);
    }
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Different async patterns - .then()
    {
      code: `
function MyComponent() {
  const [user, setUser] = useState(null);
  const [isUserLoading, setIsUserLoading] = useState(false);

  function loadUser() {
    setIsUserLoading(true);
    api.get('/user')
      .then(data => {
        setUser(data);
        setIsUserLoading(false);
      });
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Loading with different suffixes that still match
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  async function loadData() {
    setIsDataLoading(true);
    const result = await api.get('/data');
    setData(result);
    setIsDataLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Nested component with loading state
    {
      code: `
function ParentComponent() {
  function NestedComponent() {
    const [items, setItems] = useState([]);
    const [isItemsLoading, setIsItemsLoading] = useState(false);

    async function loadItems() {
      setIsItemsLoading(true);
      const data = await api.get('/items');
      setItems(data);
      setIsItemsLoading(false);
    }

    return <div />;
  }

  return <NestedComponent />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Complex entity names
    {
      code: `
function MyComponent() {
  const [userProfile, setUserProfile] = useState(null);
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(false);

  async function loadUserProfile() {
    setIsUserProfileLoading(true);
    const data = await api.get('/user-profile');
    setUserProfile(data);
    setIsUserProfileLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Mixed case patterns
    {
      code: `
function MyComponent() {
  const [apiData, setApiData] = useState(null);
  const [isAPIDataLoading, setIsAPIDataLoading] = useState(false);

  async function loadAPIData() {
    setIsAPIDataLoading(true);
    const data = await api.get('/api-data');
    setApiData(data);
    setIsAPIDataLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Boolean true/false with variables
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const loading = true;
  const notLoading = false;

  async function loadData() {
    setIsDataLoading(loading);
    const result = await api.get('/data');
    setData(result);
    setIsDataLoading(notLoading);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ useEffect with loading state
    {
      code: `
function MyComponent() {
  const [posts, setPosts] = useState([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);

  useEffect(() => {
    async function loadPosts() {
      setIsPostsLoading(true);
      const data = await api.get('/posts');
      setPosts(data);
      setIsPostsLoading(false);
    }
    loadPosts();
  }, []);

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Callback with loading state
    {
      code: `
function MyComponent() {
  const [comments, setComments] = useState([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  const handleLoadComments = useCallback(async () => {
    setIsLoadingComments(true);
    const data = await api.get('/comments');
    setComments(data);
    setIsLoadingComments(false);
  }, []);

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Very long entity names
    {
      code: `
function MyComponent() {
  const [veryLongEntityNameData, setVeryLongEntityNameData] = useState(null);
  const [isVeryLongEntityNameDataLoading, setIsVeryLongEntityNameDataLoading] = useState(false);

  async function loadVeryLongEntityNameData() {
    setIsVeryLongEntityNameDataLoading(true);
    const data = await api.get('/very-long-entity-name-data');
    setVeryLongEntityNameData(data);
    setIsVeryLongEntityNameDataLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Numbers in entity names
    {
      code: `
function MyComponent() {
  const [data2, setData2] = useState(null);
  const [isData2Loading, setIsData2Loading] = useState(false);

  async function loadData2() {
    setIsData2Loading(true);
    const data = await api.get('/data2');
    setData2(data);
    setIsData2Loading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Underscore in entity names
    {
      code: `
function MyComponent() {
  const [user_profile, setUserProfile] = useState(null);
  const [isUser_profileLoading, setIsUser_profileLoading] = useState(false);

  async function loadUserProfile() {
    setIsUser_profileLoading(true);
    const data = await api.get('/user-profile');
    setUserProfile(data);
    setIsUser_profileLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Acronyms in entity names
    {
      code: `
function MyComponent() {
  const [apiResponse, setApiResponse] = useState(null);
  const [isAPIResponseLoading, setIsAPIResponseLoading] = useState(false);

  async function loadAPIResponse() {
    setIsAPIResponseLoading(true);
    const data = await api.get('/api-response');
    setApiResponse(data);
    setIsAPIResponseLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Single letter entity names
    {
      code: `
function MyComponent() {
  const [x, setX] = useState(null);
  const [isXLoading, setIsXLoading] = useState(false);

  async function loadX() {
    setIsXLoading(true);
    const data = await api.get('/x');
    setX(data);
    setIsXLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Mixed async patterns - setTimeout
    {
      code: `
function MyComponent() {
  const [data, setData] = useState(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  function loadData() {
    setIsDataLoading(true);
    setTimeout(() => {
      setData("loaded");
      setIsDataLoading(false);
    }, 1000);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Conditional setter calls
    {
      code: `
function MyComponent() {
  const [user, setUser] = useState(null);
  const [isUserLoading, setIsUserLoading] = useState(false);

  async function loadUser(shouldLoad: boolean) {
    if (shouldLoad) {
      setIsUserLoading(true);
    }
    const data = await api.get('/user');
    setUser(data);
    setIsUserLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Ternary operator in setter
    {
      code: `
function MyComponent() {
  const [items, setItems] = useState([]);
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  async function loadItems(force: boolean) {
    setIsItemsLoading(force ? true : false);
    const data = await api.get('/items');
    setItems(data);
    setIsItemsLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Logical operators in setter
    {
      code: `
function MyComponent() {
  const [posts, setPosts] = useState([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);

  async function loadPosts(condition: boolean) {
    setIsPostsLoading(condition && true);
    const data = await api.get('/posts');
    setPosts(data);
    setIsPostsLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Function calls returning boolean
    {
      code: `
function MyComponent() {
  const [config, setConfig] = useState(null);
  const [isConfigLoading, setIsConfigLoading] = useState(false);

  function shouldLoad() {
    return true;
  }

  async function loadConfig() {
    setIsConfigLoading(shouldLoad());
    const data = await api.get('/config');
    setConfig(data);
    setIsConfigLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Destructured boolean variables
    {
      code: `
function MyComponent() {
  const [settings, setSettings] = useState(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const { loading, notLoading } = { loading: true, notLoading: false };

  async function loadSettings() {
    setIsSettingsLoading(loading);
    const data = await api.get('/settings');
    setSettings(data);
    setIsSettingsLoading(notLoading);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Computed boolean values
    {
      code: `
function MyComponent() {
  const [theme, setTheme] = useState(null);
  const [isThemeLoading, setIsThemeLoading] = useState(false);

  async function loadTheme() {
    setIsThemeLoading(!false);
    const data = await api.get('/theme');
    setTheme(data);
    setIsThemeLoading(!true);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Multiple async operations in sequence
    {
      code: `
function MyComponent() {
  const [userData, setUserData] = useState(null);
  const [isUserDataLoading, setIsUserDataLoading] = useState(false);

  async function loadUserData() {
    setIsUserDataLoading(true);

    const profile = await api.get('/profile');
    const preferences = await api.get('/preferences');
    const settings = await api.get('/settings');

    setUserData({ profile, preferences, settings });
    setIsUserDataLoading(false);
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },

    // ❌ Edge case: Error handling with finally block
    {
      code: `
function MyComponent() {
  const [analytics, setAnalytics] = useState(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  async function loadAnalytics() {
    setIsAnalyticsLoading(true);
    try {
      const data = await api.get('/analytics');
      setAnalytics(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyticsLoading(false);
    }
  }

  return <div />;
}`,
      filename: 'Component.tsx',
      errors: [{ messageId: 'noSeparateLoadingState' }],
    },
  ],
});
