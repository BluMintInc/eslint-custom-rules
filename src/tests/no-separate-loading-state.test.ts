import { ESLintUtils, TSESLint } from '@typescript-eslint/utils';
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

const loadingMessage = (stateName: string) =>
  `Loading flag "${stateName}" might be splitting the source of truth for your data. This rule is a suggestion; complex UIs may legitimately require multiple loading flags. If this separate state is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/no-separate-loading-state comment. Otherwise, consider encoding the loading phase inside the primary state (e.g., using a discriminated union or sentinel value) to prevent state drift.`;

// RuleTester accepts a raw message string at runtime even though the type
// definition requires a messageId, so we assert the type to verify the text.
const errorWithMessage = (
  stateName: string,
): TSESLint.TestCaseError<'separateLoadingState'> =>
  ({
    message: loadingMessage(stateName),
  } as unknown as TSESLint.TestCaseError<'separateLoadingState'>);

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
      errors: [errorWithMessage('isProfileLoading')],
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
      errors: [errorWithMessage('isLoadingAvatar')],
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
      errors: [errorWithMessage('isDataLoading')],
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
      errors: [errorWithMessage('ISLOADING')],
    },
  ],
});
