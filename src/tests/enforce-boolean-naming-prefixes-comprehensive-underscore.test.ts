import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-comprehensive-underscore',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Basic underscore-prefixed boolean properties
      `
      interface UserState {
        _isLoading: boolean;
        _hasError: boolean;
        _canEdit: boolean;
        _shouldRefresh: boolean;
        _willUpdate: boolean;
        _wasSuccessful: boolean;
        _hadPermission: boolean;
        _didComplete: boolean;
        _wouldBenefit: boolean;
        _mustValidate: boolean;
        _allowsAccess: boolean;
        _supportsFeature: boolean;
        _needsUpdate: boolean;
        _assertsValid: boolean;
        _includesData: boolean;
      }
      `,

      // Multiple underscores (double underscore convention)
      `
      interface InternalState {
        __isPrivate: boolean;
        __hasInternalFlag: boolean;
        __canAccessPrivate: boolean;
      }
      `,

      // Triple underscores (very private convention)
      `
      interface VeryPrivateState {
        ___isSystemLevel: boolean;
        ___hasSystemAccess: boolean;
      }
      `,

      // Mixed underscore patterns with non-boolean properties
      `
      interface MixedState {
        _isActive: boolean;
        _name: string;
        _count: number;
        _hasData: boolean;
        _items: string[];
      }
      `,

      // Optional underscore-prefixed boolean properties
      `
      interface OptionalState {
        _isEnabled?: boolean;
        _hasFeature?: boolean;
        _canAccess?: boolean;
        name: string;
      }
      `,

      // Nested object types with underscore properties
      `
      interface NestedState {
        user: {
          _isAuthenticated: boolean;
          _hasPermissions: boolean;
          profile: {
            _isComplete: boolean;
            _hasAvatar: boolean;
          };
        };
        settings: {
          _isAdvanced: boolean;
          _allowsNotifications: boolean;
        };
      }
      `,

      // Class properties with underscore prefixes
      `
      class UserService {
        private _isInitialized: boolean = false;
        protected _hasConnection: boolean = false;
        public _canRetry: boolean = true;

        private _shouldLog: boolean = true;
        protected _willTimeout: boolean = false;
        public _wasSuccessful: boolean = false;
      }
      `,

      // Function parameters with underscore-prefixed boolean types
      `
      function processUser(
        _isActive: boolean,
        _hasPermissions: boolean,
        _canEdit: boolean
      ) {
        // Implementation
      }
      `,

      // Arrow function parameters with underscore prefixes
      `
      const handleUser = (
        _isValid: boolean,
        _hasData: boolean,
        _canProcess: boolean
      ) => {
        // Implementation
      };
      `,

      // Type aliases with underscore-prefixed boolean properties
      `
      type UserFlags = {
        _isActive: boolean;
        _hasSubscription: boolean;
        _canUpgrade: boolean;
      };
      `,

      // Union types with underscore properties
      `
      type StateUnion =
        | { _isLoading: boolean; data: null }
        | { _isLoading: boolean; data: string[] }
        | { _hasError: boolean; error: string };
      `,

      // Intersection types with underscore properties
      `
      type BaseState = { _isInitialized: boolean };
      type UserState = BaseState & { _hasUser: boolean };
      type AdminState = UserState & { _canAdminister: boolean };
      `,

      // Generic types with underscore properties
      `
      interface GenericState<T> {
        _isLoading: boolean;
        _hasData: boolean;
        data: T;
      }

      type UserGeneric = GenericState<{ _isValid: boolean }>;
      `,

      // Method signatures with underscore-prefixed boolean return types
      `
      interface UserService {
        _isAuthenticated(): boolean;
        _hasPermission(action: string): boolean;
        _canPerform(operation: string): boolean;
      }
      `,

      // Object literals with underscore-prefixed boolean properties
      `
      const config = {
        _isEnabled: true,
        _hasFeature: false,
        _canAccess: true,
        name: 'test',
        version: 1
      };
      `,

      // Variable declarations with underscore-prefixed boolean values
      `
      const _isDebugMode: boolean = true;
      const _hasDevTools: boolean = false;
      const _canUseExperimental: boolean = true;
      `,

      // Destructuring with underscore-prefixed boolean properties
      `
      const { _isActive, _hasData, name } = userState;
      const { user: { _isAuthenticated, _hasPermissions } } = appState;
      `,

      // Array destructuring with underscore-prefixed boolean variables
      `
      const [_isFirst, _isSecond]: boolean[] = getBooleanFlags();
      `,

      // Default parameters with underscore-prefixed boolean values
      `
      function processData(
        data: any[],
        _isStrict: boolean = true,
        _hasValidation: boolean = false
      ) {
        // Implementation
      }
      `,

      // Computed property names with underscores (static)
      `
      const config = {
        ['_isEnabled']: true,
        ['_hasFeature']: false,
        name: 'test'
      };
      `,

      // React useState with underscore-prefixed boolean state
      `
      const [_isLoading, _setIsLoading] = useState<boolean>(false);
      const [_hasError, _setHasError] = useState<boolean>(false);
      `,

      // Complex nested structures with underscore properties
      `
      interface ComplexState {
        auth: {
          user: {
            _isAuthenticated: boolean;
            _hasValidToken: boolean;
            permissions: {
              _canRead: boolean;
              _canWrite: boolean;
              _canDelete: boolean;
            };
          };
          session: {
            _isActive: boolean;
            _willExpire: boolean;
          };
        };
        ui: {
          _isLoading: boolean;
          _hasNotifications: boolean;
          modals: {
            _isOpen: boolean;
            _canClose: boolean;
          };
        };
      }
      `,

      // Function return types with underscore properties
      `
      function getUserState(): { _isActive: boolean; _hasData: boolean } {
        return { _isActive: true, _hasData: false };
      }
      `,

      // Conditional types with underscore properties
      `
      type ConditionalState<T> = T extends string
        ? { _isString: boolean; value: T }
        : { _isNotString: boolean; value: T };
      `,

      // Mapped types with underscore properties
      `
      type MappedState<T> = {
        [K in keyof T]: T[K] extends boolean
          ? { _isBoolean: boolean; value: T[K] }
          : T[K];
      };
      `,

      // Namespace declarations with underscore properties
      `
      namespace Internal {
        export interface State {
          _isInternal: boolean;
          _hasAccess: boolean;
        }
      }
      `,

      // Module declarations with underscore properties
      `
      declare module 'external-lib' {
        interface Config {
          _isEnabled: boolean;
          _hasFeature: boolean;
        }
      }
      `,

      // Enum-like objects with underscore boolean properties
      `
      const FeatureFlags = {
        _isNewUIEnabled: true,
        _hasExperimentalFeatures: false,
        _canUseBetaAPI: true,
      } as const;
      `,

      // Template literal types with underscore properties
      `
      type DynamicState = {
        [K in \`_is\${string}\`]: boolean;
      };
      `,

      // Readonly properties with underscore prefixes
      `
      interface ReadonlyState {
        readonly _isImmutable: boolean;
        readonly _hasReadOnlyData: boolean;
      }
      `,

      // Static class properties with underscore prefixes
      `
      class StaticConfig {
        static _isProduction: boolean = false;
        static _hasDebugMode: boolean = true;
        static _canUseCache: boolean = true;
      }
      `,

      // Abstract class properties with underscore prefixes
      `
      abstract class AbstractService {
        protected abstract _isInitialized: boolean;
        protected abstract _hasConnection: boolean;
      }
      `,

      // Getter with underscore-prefixed boolean types
      `
      class PropertyService {
        private _internalFlag: boolean = false;

        get _isReady(): boolean {
          return this._internalFlag;
        }

        set _isReady(_newValue: boolean) {
          this._internalFlag = _newValue;
        }
      }
      `,

      // Index signatures with underscore properties
      `
      interface IndexedState {
        [key: \`_is\${string}\`]: boolean;
        [key: \`_has\${string}\`]: boolean;
      }
      `,

      // Rest parameters with underscore-prefixed boolean types
      `
      function processFlags(..._flags: boolean[]) {
        // Implementation
      }
      `,

      // Tuple types with underscore-prefixed boolean elements
      `
      type BooleanTuple = [_isFirst: boolean, _isSecond: boolean, _isThird: boolean];
      `,

      // Promise types with underscore properties
      `
      interface AsyncState {
        promise: Promise<{ _isResolved: boolean; _hasData: boolean }>;
      }
      `,

      // Function overloads with underscore-prefixed boolean parameters
      `
      function processData(_isStrict: true): string;
      function processData(_isStrict: false): number;
      function processData(_isStrict: boolean): string | number {
        return _isStrict ? 'strict' : 42;
      }
      `,

      // Underscore properties in React component props
      `
      interface ComponentProps {
        _isVisible: boolean;
        _hasAnimation: boolean;
        _canInteract: boolean;
        children: React.ReactNode;
      }
      `,

      // Underscore properties in event handlers
      `
      interface EventHandlers {
        onClick: (event: { _isHandled: boolean }) => void;
        onSubmit: (data: { _isValid: boolean }) => void;
      }
      `,

      // Complex real-world example from the bug report
      `
      const [userInternal, setUserInternal] = useState<
        Loadable<FirebaseUserLocal & {
          _isFetchedFromRemote?: boolean;
          _hasValidToken?: boolean;
          _canRefresh?: boolean;
        }>
      >(findItem(FIREBASE_USER_LOCAL_KEY_REGEX) || undefined);

      setUserInternal({
        ...userWithClaims,
        _isFetchedFromRemote: true,
        _hasValidToken: true,
        _canRefresh: false
      });
      `,

      // Underscore properties in callback functions
      `
      const processCallback = (callback: (state: { _isComplete: boolean }) => void) => {
        callback({ _isComplete: true });
      };
      `,

      // Underscore properties in async/await contexts
      `
      async function fetchUserData(): Promise<{ _isLoaded: boolean; _hasError: boolean }> {
        return { _isLoaded: true, _hasError: false };
      }
      `,
    ],
    invalid: [
      // Regular boolean properties (without underscore) should still be flagged
      {
        code: `
        interface UserState {
          loading: boolean;
          active: boolean;
          _isValid: boolean; // This should be valid
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'loading',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Class properties without proper prefixes (but underscore ones should be valid)
      {
        code: `
        class UserService {
          authenticated: boolean = false; // Should be flagged
          _isInternal: boolean = true; // Should be valid
          enabled: boolean = true; // Should be flagged
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'authenticated',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Function parameters without proper prefixes (but underscore ones should be valid)
      {
        code: `
        function processUser(
          active: boolean, // Should be flagged
          _isInternal: boolean, // Should be valid
          enabled: boolean // Should be flagged
        ) {
          // Implementation
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Variable declarations without proper prefixes (but underscore ones should be valid)
      {
        code: `
        const active: boolean = true; // Should be flagged
        const _isInternal: boolean = false; // Should be valid
        const enabled: boolean = true; // Should be flagged
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Object literals with mixed naming (underscore should be valid, others flagged)
      {
        code: `
        const config = {
          active: true, // Should be flagged
          _isEnabled: false, // Should be valid
          visible: true, // Should be flagged
          _hasFeature: true, // Should be valid
        };
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Nested objects with mixed naming
      {
        code: `
        interface NestedState {
          user: {
            authenticated: boolean; // Should be flagged
            _isInternal: boolean; // Should be valid
            profile: {
              complete: boolean; // Should be flagged
              _hasAvatar: boolean; // Should be valid
            };
          };
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'authenticated',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'complete',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Functions returning boolean without proper prefixes (but underscore ones should be valid)
      {
        code: `
        function checkAuth(): boolean { // Should be flagged
          return true;
        }

        function _isInternal(): boolean { // Should be valid
          return false;
        }

        function validate(): boolean { // Should be flagged
          return true;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'checkAuth',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'validate',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },
    ],
  },
);
