import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-bug-report-exact',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Exact code from the bug report - should be valid
      `
      const [userInternal, setUserInternal] = useState<
        Loadable<FirebaseUserLocal & { _isFetchedFromRemote?: boolean }>
      >(findItem(FIREBASE_USER_LOCAL_KEY_REGEX) || undefined);

      // Later in the code:
      setUserInternal({ ...userWithClaims, _isFetchedFromRemote: true });
      `,

      // Additional variations of the bug report scenario
      `
      interface FirebaseUserLocal {
        uid: string;
        email: string;
      }

      interface Loadable<T> {
        data: T;
        isLoading: boolean;
      }

      const [userInternal, setUserInternal] = useState<
        Loadable<FirebaseUserLocal & {
          _isFetchedFromRemote?: boolean;
          _hasValidToken?: boolean;
          _canRefreshToken?: boolean;
        }>
      >();

      setUserInternal({
        ...userWithClaims,
        _isFetchedFromRemote: true,
        _hasValidToken: true,
        _canRefreshToken: false
      });
      `,

      // Underscore properties in intersection types
      `
      type BaseUser = {
        id: string;
        name: string;
      };

      type UserWithFlags = BaseUser & {
        _isActive?: boolean;
        _hasPermissions?: boolean;
        _canEdit?: boolean;
      };

      const user: UserWithFlags = {
        id: '123',
        name: 'John',
        _isActive: true,
        _hasPermissions: false,
        _canEdit: true
      };
      `,

      // Underscore properties in union types
      `
      type UserState =
        | { _isLoading: true; data: null }
        | { _isLoading: false; data: User; _hasError?: boolean }
        | { _isLoading: false; data: null; _hasError: true };
      `,

      // Underscore properties in generic types
      `
      interface ApiResponse<T> {
        data: T;
        _isSuccess: boolean;
        _hasError: boolean;
      }

      const response: ApiResponse<{ _isValid: boolean }> = {
        data: { _isValid: true },
        _isSuccess: true,
        _hasError: false
      };
      `,

      // Underscore properties in nested object types
      `
      interface AppState {
        user: {
          profile: {
            _isComplete: boolean;
            _hasAvatar: boolean;
          };
          auth: {
            _isAuthenticated: boolean;
            _hasValidSession: boolean;
          };
        };
        ui: {
          _isLoading: boolean;
          _hasNotifications: boolean;
        };
      }
      `,

      // Underscore properties in function signatures
      `
      function _isUserValid(user: {
        id: string;
        _isActive: boolean;
        _hasPermissions: boolean
      }): boolean {
        return user._isActive && user._hasPermissions;
      }

      const _hasValidData = (data: {
        _isValid: boolean;
        _hasData: boolean
      }) => data._isValid && data._hasData;
      `,

      // Underscore properties in React hooks
      `
      const [state, setState] = useState<{
        _isLoading: boolean;
        _hasError: boolean;
        _canRetry: boolean;
      }>({
        _isLoading: false,
        _hasError: false,
        _canRetry: true
      });

      const updateState = (updates: Partial<{
        _isLoading: boolean;
        _hasError: boolean;
        _canRetry: boolean;
      }>) => {
        setState(prev => ({ ...prev, ...updates }));
      };
      `,

      // Underscore properties in conditional types
      `
      type ConditionalFlags<T> = T extends string
        ? { _isString: boolean; value: T }
        : T extends number
        ? { _isNumber: boolean; value: T }
        : { _isOther: boolean; value: T };
      `,

      // Underscore properties in mapped types
      `
      type FlaggedProperties<T> = {
        [K in keyof T]: T[K] extends boolean
          ? { _isFlag: boolean; value: T[K] }
          : T[K];
      };
      `,

      // Underscore properties in utility types
      `
      type UserFlags = {
        _isActive: boolean;
        _hasPermissions: boolean;
        _canEdit: boolean;
      };

      type PartialFlags = Partial<UserFlags>;
      type RequiredFlags = Required<UserFlags>;
      type PickedFlags = Pick<UserFlags, '_isActive' | '_hasPermissions'>;
      type OmittedFlags = Omit<UserFlags, '_canEdit'>;
      `,

      // Object literals with mixed naming (now ignored)
      `
      const config_mixed = {
        _isEnabled: true,
        active: false,
        _hasFeature: true,
        visible: false,
      };
      `,
    ],
    invalid: [
      // Non-underscore boolean properties should still be flagged
      {
        code: `
        const [userInternal, setUserInternal] = useState<
          Loadable<FirebaseUserLocal & {
            _isFetchedFromRemote?: boolean; // Valid - starts with underscore
            fetchedFromRemote?: boolean; // Invalid - doesn't start with underscore or approved prefix
          }>
        >();
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'fetchedFromRemote',
              capitalizedName: 'FetchedFromRemote',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Mixed underscore and non-underscore properties
      {
        code: `
        interface UserState {
          _isActive: boolean; // Valid - starts with underscore
          active: boolean; // Invalid - doesn't start with underscore or approved prefix
          _hasPermissions: boolean; // Valid - starts with underscore
          enabled: boolean; // Invalid - doesn't start with underscore or approved prefix
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              capitalizedName: 'Enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

    ],
  },
);
