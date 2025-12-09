import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-underscore-prefix',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report - boolean properties with underscore prefix should be valid
      `
      const [userInternal, setUserInternal] = useState<
        Loadable<FirebaseUserLocal & { _isFetchedFromRemote?: boolean }>
      >(findItem(FIREBASE_USER_LOCAL_KEY_REGEX) || undefined);

      // Later in the code:
      setUserInternal({ ...userWithClaims, _isFetchedFromRemote: true });
      `,
      // Additional test cases with underscore prefixed boolean properties
      `
      interface UserState {
        _isLoading: boolean;
        _hasError: boolean;
        name: string;
      }
      `,
      `
      class UserService {
        _isAuthenticated: boolean = false;

        login() {
          this._isAuthenticated = true;
        }
      }
      `,
      `
      type ConfigOptions = {
        _shouldRefresh?: boolean;
        timeout: number;
      };
      `,
      `
      const config = {
        _isEnabled: true,
        name: 'test'
      };
      `,
      `
      function processUser(user: { _isActive?: boolean }) {
        if (user._isActive) {
          // Do something
        }
      }
      `,
    ],
    invalid: [
      // Regular boolean properties (without underscore) should still be flagged
      {
        code: `
        interface UserState {
          loading: boolean;
          name: string;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'loading',
              capitalizedName: 'Loading',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
        class UserService {
          authenticated: boolean = false;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'authenticated',
              capitalizedName: 'Authenticated',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
