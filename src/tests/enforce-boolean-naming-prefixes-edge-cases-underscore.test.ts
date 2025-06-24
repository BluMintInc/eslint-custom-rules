import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-edge-cases-underscore',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Edge case: Underscore with numbers
      `
      interface StateWithNumbers {
        _isVersion2: boolean;
        _hasFeature3: boolean;
        _canAccess4: boolean;
      }
      `,

      // Edge case: Multiple consecutive underscores
      `
      interface VeryPrivateState {
        __isSystemLevel: boolean;
        ___hasRootAccess: boolean;
        ____canModifyKernel: boolean;
      }
      `,

      // Edge case: Underscore in the middle (should still be flagged if not starting with underscore)
      `
      interface MixedNaming {
        _isActive: boolean; // Valid - starts with underscore
        name_active: string; // Not boolean, so not checked
      }
      `,

      // Edge case: Underscore with camelCase
      `
      interface CamelCaseUnderscore {
        _isUserAuthenticated: boolean;
        _hasValidAccessToken: boolean;
        _canPerformAdminActions: boolean;
      }
      `,

      // Edge case: Underscore with PascalCase
      `
      interface PascalCaseUnderscore {
        _IsSystemReady: boolean;
        _HasValidConfiguration: boolean;
        _CanStartProcessing: boolean;
      }
      `,

      // Edge case: Very long underscore-prefixed names
      `
      interface VeryLongNames {
        _isUserAuthenticatedAndHasValidTokenAndCanAccessPremiumFeatures: boolean;
        _hasCompleteProfileInformationIncludingEmailAndPhoneNumber: boolean;
      }
      `,

      // Edge case: Underscore with abbreviations
      `
      interface AbbreviationNames {
        _isAPIReady: boolean;
        _hasHTTPSConnection: boolean;
        _canUseGPUAcceleration: boolean;
        _isURLValid: boolean;
      }
      `,

      // Edge case: Underscore in destructuring assignments
      `
      const { _isActive, _hasData } = getState();
      const { user: { _isAuthenticated } } = appState;
      const [{ _isLoading }] = useState();
      `,

      // Edge case: Underscore in function return destructuring
      `
      function getFlags(): { _isEnabled: boolean; _hasFeature: boolean } {
        return { _isEnabled: true, _hasFeature: false };
      }

      const { _isEnabled, _hasFeature } = getFlags();
      `,

      // Edge case: Underscore in array destructuring with boolean types
      `
      const [_isFirst, _isSecond, _isThird]: [boolean, boolean, boolean] = [true, false, true];
      `,

      // Edge case: Underscore in rest parameters
      `
      function processFlags(..._booleanFlags: boolean[]) {
        return _booleanFlags.every(flag => flag);
      }
      `,

      // Edge case: Underscore in spread syntax
      `
      const baseFlags = { _isEnabled: true, _hasFeature: false };
      const extendedFlags = { ...baseFlags, _canAccess: true };
      `,

      // Edge case: Underscore in conditional (ternary) expressions
      `
      const _isValid: boolean = condition ? true : false;
      const _hasData: boolean = data ? true : false;
      `,

      // Edge case: Underscore in logical expressions
      `
      const _isReady: boolean = _isLoaded && _hasData;
      const _canProceed: boolean = _isValid || _hasBackup;
      const _shouldStop: boolean = !_isRunning;
      `,

      // Edge case: Underscore in template literals (as property names)
      `
      const propertyName = '_isEnabled';
      const config = {
        [\`\${propertyName}\`]: true
      };
      `,

      // Edge case: Underscore in class inheritance
      `
      abstract class BaseService {
        protected _isInitialized: boolean = false;
      }

      class UserService extends BaseService {
        private _hasConnection: boolean = false;

        constructor() {
          super();
          this._isInitialized = true;
        }
      }
      `,

      // Edge case: Underscore in interface inheritance
      `
      interface BaseState {
        _isLoading: boolean;
      }

      interface UserState extends BaseState {
        _hasUser: boolean;
        _canEdit: boolean;
      }
      `,

      // Edge case: Underscore in generic constraints
      `
      interface GenericService<T extends { _isValid: boolean }> {
        process(item: T): boolean;
      }
      `,

      // Edge case: Underscore in mapped types
      `
      type BooleanFlags<T> = {
        [K in keyof T as K extends string ? \`_\${K}\` : never]: boolean;
      };
      `,

      // Edge case: Underscore in conditional types
      `
      type ConditionalFlag<T> = T extends string
        ? { _isString: boolean }
        : { _isNotString: boolean };
      `,

      // Edge case: Underscore in utility types
      `
      type PartialFlags = Partial<{ _isEnabled: boolean; _hasFeature: boolean }>;
      type RequiredFlags = Required<{ _isEnabled?: boolean; _hasFeature?: boolean }>;
      type PickedFlags = Pick<{ _isEnabled: boolean; _hasFeature: boolean; name: string }, '_isEnabled'>;
      `,

      // Edge case: Underscore in function overloads
      `
      function checkFlag(_isStrict: true): string;
      function checkFlag(_isStrict: false): number;
      function checkFlag(_isStrict: boolean): string | number {
        return _isStrict ? 'strict' : 42;
      }
      `,

      // Edge case: Underscore in async/await
      `
      async function processAsync(): Promise<{ _isComplete: boolean }> {
        const _isReady: boolean = await checkReadiness();
        return { _isComplete: _isReady };
      }
      `,

      // Edge case: Underscore in generators
      `
      function* generateFlags(): Generator<{ _isActive: boolean }> {
        yield { _isActive: true };
        yield { _isActive: false };
      }
      `,

      // Edge case: Underscore in decorators (if supported)
      `
      class DecoratedService {
        @property
        _isEnabled: boolean = false;

        @computed
        get _hasValidState(): boolean {
          return this._isEnabled;
        }
      }
      `,

      // Edge case: Underscore in React component props
      `
      interface ComponentProps {
        _isVisible: boolean;
        _hasAnimation: boolean;
      }

      function MyComponent({ _isVisible, _hasAnimation }: ComponentProps) {
        return _isVisible ? 'visible' : 'hidden';
      }
      `,

      // Edge case: Underscore in event handlers
      `
      interface EventData {
        _isHandled: boolean;
        _hasError: boolean;
      }

      const handleEvent = (event: EventData) => {
        if (event._isHandled) return;
        if (event._hasError) throw new Error('Event error');
      };
      `,

      // Edge case: Underscore in closures
      `
      function createChecker() {
        const _isInitialized: boolean = true;

        return function(_hasData: boolean) {
          return _isInitialized && _hasData;
        };
      }
      `,

      // Edge case: Underscore in IIFE (Immediately Invoked Function Expression)
      `
      const result = (function(_isEnabled: boolean) {
        return _isEnabled ? 'enabled' : 'disabled';
      })(true);
      `,

      // Edge case: Underscore in arrow function with implicit return
      `
      const checker = (_isValid: boolean) => _isValid;
      const validator = (_hasData: boolean, _isStrict: boolean) => _hasData && _isStrict;
      `,

      // Edge case: Underscore in object method shorthand
      `
      const service = {
        _isReady: true,

        check(_hasPermission: boolean) {
          return this._isReady && _hasPermission;
        },

        validate: (_isStrict: boolean) => _isStrict
      };
      `,

      // Edge case: Underscore in class static methods
      `
      class StaticService {
        static _isProduction: boolean = false;

        static _isAccessible(_hasAccess: boolean): boolean {
          return StaticService._isProduction && _hasAccess;
        }
      }
      `,

      // Edge case: Underscore in namespace
      `
      namespace Internal {
        export const _isDebugMode: boolean = true;

        export interface Config {
          _isEnabled: boolean;
          _hasFeature: boolean;
        }

        export function _isValidated(_isValid: boolean): boolean {
          return _isDebugMode && _isValid;
        }
      }
      `,

      // Edge case: Underscore in module augmentation
      `
      declare global {
        interface Window {
          _isDevMode: boolean;
          _hasDebugTools: boolean;
        }
      }
      `,

      // Edge case: Complex real-world Firebase example
      `
      interface FirebaseUser {
        uid: string;
        email: string;
        _isEmailVerified?: boolean;
        _hasCustomClaims?: boolean;
        _canAccessAdmin?: boolean;
      }

      const [user, setUser] = useState<FirebaseUser & {
        _isFetchedFromRemote?: boolean;
        _hasValidToken?: boolean;
        _canRefreshToken?: boolean;
      }>();

      const updateUser = (updates: Partial<FirebaseUser>) => {
        setUser(prev => ({
          ...prev,
          ...updates,
          _isFetchedFromRemote: true,
          _hasValidToken: true
        }));
      };
      `,
    ],
    invalid: [
      // Edge case: Non-underscore properties should still be flagged
      {
        code: `
        interface MixedState {
          _isValid: boolean; // Valid - starts with underscore
          active: boolean; // Invalid - doesn't start with underscore or approved prefix
          _hasData: boolean; // Valid - starts with underscore
          enabled: boolean; // Invalid - doesn't start with underscore or approved prefix
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Edge case: Function parameters without proper prefixes
      {
        code: `
        function processData(
          _isStrict: boolean, // Valid - starts with underscore
          active: boolean, // Invalid - doesn't start with underscore or approved prefix
          _hasValidation: boolean, // Valid - starts with underscore
          enabled: boolean // Invalid - doesn't start with underscore or approved prefix
        ) {
          return _isStrict && active && _hasValidation && enabled;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'enabled',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Edge case: Class properties with mixed naming
      {
        code: `
        class ServiceState {
          private _isInitialized: boolean = false; // Valid - starts with underscore
          public active: boolean = true; // Invalid - doesn't start with underscore or approved prefix
          protected _hasConnection: boolean = false; // Valid - starts with underscore
          static enabled: boolean = true; // Invalid - doesn't start with underscore or approved prefix
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Edge case: Variable declarations with mixed naming
      {
        code: `
        const _isDebugMode: boolean = true; // Valid - starts with underscore
        const active: boolean = false; // Invalid - doesn't start with underscore or approved prefix
        const _hasFeature: boolean = true; // Valid - starts with underscore
        let enabled: boolean = false; // Invalid - doesn't start with underscore or approved prefix
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'enabled',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Edge case: Object literals with mixed naming
      {
        code: `
        const config = {
          _isEnabled: true, // Valid - starts with underscore
          active: false, // Invalid - doesn't start with underscore or approved prefix
          _hasFeature: true, // Valid - starts with underscore
          visible: false, // Invalid - doesn't start with underscore or approved prefix
          name: 'test' // Not boolean, so not checked
        };
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Edge case: Functions returning boolean with mixed naming
      {
        code: `
        function _isSystemReady(): boolean { // Valid - starts with underscore
          return true;
        }

        function checkStatus(): boolean { // Invalid - doesn't start with underscore or approved prefix
          return false;
        }

        function _hasValidConfig(): boolean { // Valid - starts with underscore
          return true;
        }

        function validate(): boolean { // Invalid - doesn't start with underscore or approved prefix
          return false;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'checkStatus',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'validate',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },
    ],
  },
);
