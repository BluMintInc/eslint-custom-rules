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
  `Loading flag "${stateName}" splits the source of truth for data fetching. Boolean toggles drift from the actual data and add extra renders. Encode the loading phase inside the primary state instead (use a "loading" sentinel or discriminated union) so components read a single authoritative value.`;

// RuleTester accepts a raw message string at runtime even though the type
// definition requires a messageId, so we assert the type to verify the text.
const errorWithMessage = (
  stateName: string,
): TSESLint.TestCaseError<'separateLoadingState'> =>
  ({
    message: loadingMessage(stateName),
  } as unknown as TSESLint.TestCaseError<'separateLoadingState'>);

// `patterns` REPLACES the built-in loading-name regexes rather than adding to
// them, so it is asserted in both directions over these two snippets: a name the
// defaults match and a name only a custom pattern matches. Each snippet appears
// as both a valid and an invalid case, with `options` the sole difference.
const DEFAULT_MATCHED_STATE = `
const [isDataLoading, setIsDataLoading] = useState(false);

async function loadData() {
  setIsDataLoading(true);
  await fetchData();
  setIsDataLoading(false);
}
`;

const CUSTOM_MATCHED_STATE = `
const [fetchingUsers, setFetchingUsers] = useState(false);

async function loadUsers() {
  setFetchingUsers(true);
  await fetchUsers();
  setFetchingUsers(false);
}
`;

const FETCHING_PATTERNS = ['^fetching'];

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

    // Valid: custom `patterns` replace the built-in ones, so a name the
    // defaults flag (see the matching invalid case) is no longer matched.
    {
      code: DEFAULT_MATCHED_STATE,
      options: [{ patterns: FETCHING_PATTERNS }],
    },

    // Valid: an empty `patterns` list matches nothing, disabling the rule for
    // the same snippet the defaults report.
    {
      code: DEFAULT_MATCHED_STATE,
      options: [{ patterns: [] }],
    },

    // Valid: a name outside the built-in loading patterns, under the defaults.
    // Paired with the invalid case that adds `patterns` to reach it.
    {
      code: CUSTOM_MATCHED_STATE,
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

    // Invalid under the defaults: the counterpart of the two valid cases that
    // override `patterns` over this identical snippet.
    {
      code: DEFAULT_MATCHED_STATE,
      errors: [errorWithMessage('isDataLoading')],
    },

    // Invalid only because `patterns` extends enforcement to a name the
    // built-in regexes ignore (the same snippet is valid at the defaults).
    {
      code: CUSTOM_MATCHED_STATE,
      options: [{ patterns: FETCHING_PATTERNS }],
      errors: [errorWithMessage('fetchingUsers')],
    },
  ],
});
