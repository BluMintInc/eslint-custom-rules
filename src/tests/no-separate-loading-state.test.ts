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
    // Valid: Using sentinel value instead of separate loading state
    {
      code: `
        const [profile, setProfile] = useState(null);

        async function loadProfile(id) {
          setProfile('loading');
          const data = await api.get('/users/' + id);
          setProfile(data);
        }
      `,
    },

    // Valid: Boolean state that doesn't match loading patterns
    {
      code: `
        const [isModalOpen, setIsModalOpen] = useState(false);
        const [isVisible, setIsVisible] = useState(true);

        function toggleModal() {
          setIsModalOpen(!isModalOpen);
        }
      `,
    },

    // Valid: Non-useState hook
    {
      code: `
        const [isProfileLoading, setIsProfileLoading] = useCustomHook(false);
      `,
    },

    // Valid: useState without destructuring
    {
      code: `
        const profileState = useState(null);
        const isLoadingState = useState(false);
      `,
    },

    // Valid: Single element destructuring
    {
      code: `
        const [isProfileLoading] = useState(false);
      `,
    },

    // Valid: Loading state used only with non-boolean values
    {
      code: `
        const [isProfileLoading, setIsProfileLoading] = useState(false);

        function updateLoading() {
          setIsProfileLoading('some string');
          setIsProfileLoading(42);
        }
      `,
    },

    // Valid: No setter usage at all
    {
      code: `
        const [isProfileLoading, setIsProfileLoading] = useState(false);

        function Component() {
          return isProfileLoading ? 'Loading...' : 'Done';
        }
      `,
    },

    // Valid: Only truthy values, no falsy
    {
      code: `
        const [isProfileLoading, setIsProfileLoading] = useState(false);

        async function loadProfile() {
          setIsProfileLoading(true);
          await api.get('/profile');
        }
      `,
    },

    // Valid: Only falsy values, no truthy
    {
      code: `
        const [isProfileLoading, setIsProfileLoading] = useState(true);

        function resetLoading() {
          setIsProfileLoading(false);
        }
      `,
    },
  ],

  invalid: [
    // Invalid: Classic isXLoading pattern
    {
      code: `
        const [profile, setProfile] = useState(null);
        const [isProfileLoading, setIsProfileLoading] = useState(false);

        async function loadProfile(id) {
          setIsProfileLoading(true);
          try {
            const data = await api.get('/users/' + id);
            setProfile(data);
          } finally {
            setIsProfileLoading(false);
          }
        }
      `,
      errors: [{ messageId: 'separateLoadingState' }],
    },

    // Invalid: isLoadingX pattern
    {
      code: `
        const [avatar, setAvatar] = useState(null);
        const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);

        async function loadAvatar() {
          setIsLoadingAvatar(true);
          const data = await fetchAvatar();
          setAvatar(data);
          setIsLoadingAvatar(false);
        }
      `,
      errors: [{ messageId: 'separateLoadingState' }],
    },

    // Invalid: Simple boolean toggle pattern
    {
      code: `
        const [data, setData] = useState(null);
        const [isDataLoading, setIsDataLoading] = useState(false);

        function loadData() {
          setIsDataLoading(true);
          fetchData().then(result => {
            setData(result);
            setIsDataLoading(false);
          });
        }
      `,
      errors: [{ messageId: 'separateLoadingState' }],
    },

    // Invalid: Case insensitive matching
    {
      code: `
        const [data, setData] = useState(null);
        const [ISLOADING, setISLOADING] = useState(false);

        function loadData() {
          setISLOADING(true);
          setISLOADING(false);
        }
      `,
      errors: [{ messageId: 'separateLoadingState' }],
    },
  ],
});
