import type { TSESLint } from '@typescript-eslint/utils';

import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

const defaultPrefixes =
  'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts';

type MessageArgs = {
  type: string;
  name: string;
  capitalizedName: string;
  prefixes: string;
};

const buildMessage = ({ type, name, capitalizedName, prefixes }: MessageArgs) =>
  `Boolean ${type} "${name}" is missing a common approved boolean prefix (${prefixes}). ` +
  `Prefixes immediately communicate that the value is a true/false predicate; without one, checks like \`if (${name})\` read as generic truthiness guards and hide the boolean intent. ` +
  `Rename by prepending any approved prefix so the name becomes \`<prefix>${capitalizedName}\`, making the boolean contract obvious at call sites and API boundaries.`;

const buildError = (
  args: MessageArgs,
): TSESLint.TestCaseError<'missingBooleanPrefix'> =>
  ({
    message: buildMessage(args),
  } as unknown as TSESLint.TestCaseError<'missingBooleanPrefix'>);

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Variables with proper boolean prefixes
      'const isActive = true;',
      'const isUserLoggedIn = false;',
      'const hasCompleted = isTaskFinished();',
      'const canEdit = user.permissions.includes("edit");',
      'const shouldRefresh = needsUpdate();',
      'const willUpdate = condition;',
      'const wasSuccessful = operation.status === "success";',
      'const hadPermission = previousState.allowed;',
      'const didUpdate = checkUpdateStatus();',
      'const wouldBenefit = calculateBenefit() > threshold;',
      'const mustValidate = isRequired && !isValidated;',
      'const allowsEditing = checkPermission("edit");',
      'const supportsVideo = checkFeatures().video;',
      'const needsRefresh = isStale || isOutdated;',

      // Function parameters with proper boolean prefixes
      'function toggleFeature(isEnabled: boolean) { /* ... */ }',
      'function processUser(hasAccess: boolean, canModify: boolean) { /* ... */ }',
      'const handleSubmit = (isValid: boolean) => { /* ... */ };',

      // Class properties with proper boolean prefixes
      `
    class UserAccount {
      private isVerified = false;
      static isPremium = false;

      isAccountLocked(): boolean {
        return this.failedAttempts > 3;
      }
    }
    `,

      // Interface properties with proper boolean prefixes
      `
    interface UserState {
      isActive: boolean;
      hasSubscription: boolean;
      canAccessPremium: boolean;
    }
    `,

      // Regression (#1219): interface/type-alias boolean property signatures are
      // NOT flagged by default — their names are frequently dictated by external
      // API contracts and persisted data-model schemas the author cannot rename.
      // Case 1: external API request contract.
      `interface CoinflowWithdrawRequest { waitForConfirmation: boolean; }`,
      // Case 2: Firestore document field names.
      `
    interface Tournament {
      registrationOpen: boolean;
      optional: boolean;
    }
    `,
      // Case 2b: the same applies to type aliases.
      `type TournamentDoc = { registrationOpen: boolean; optional: boolean; };`,
      // Optional and union-typed property signatures are likewise exempt by default.
      `interface Settings { darkMode?: boolean; }`,
      `type FeatureFlags = { betaAccess: boolean | undefined };`,
      // Interface extending another type still does not flag its own boolean fields.
      `
    interface Base { name: string; }
    interface Account extends Base { suspended: boolean; }
    `,
      // Nested type-literal property signatures are exempt by default.
      `type Wrapper = { meta: { archived: boolean } };`,
      // Case 3: an object constant whose declared type is an object (not boolean)
      // must not be flagged based on its inner boolean property.
      `type GuardCancellation = { _isCancelled: boolean }; const CANCELLATION: GuardCancellation = { _isCancelled: true };`,
      // Case 4: object-literal property names are dictated by the type they satisfy.
      `const requestBody = { waitForConfirmation: false };`,
      // Case 4b: object-literal property nested inside a call argument.
      `const serialized = JSON.stringify({ waitForConfirmation: false });`,
      // Case 5: underscore-prefixed boolean property inside a generic type argument.
      `type FirebaseUserLocal = { uid: string }; const identity = <T,>(): T | undefined => undefined; const user = identity<FirebaseUserLocal & { _isFetchedFromRemote?: boolean }>();`,

      // Opting in still allows already-prefixed property signatures (no false positive).
      {
        code: `
    interface UserState {
      isActive: boolean;
      hasSubscription: boolean;
    }
    `,
        options: [{ enforceForPropertySignatures: true }],
      },
      // Underscore-prefixed property signatures remain exempt even when opted in.
      {
        code: `interface Internal { _isReady: boolean; }`,
        options: [{ enforceForPropertySignatures: true }],
      },

      // Type predicates (special case that should pass regardless)
      'function isString(value: any): value is string { return typeof value === "string"; }',
      'function isUser(obj: any): obj is User { return obj && obj.id && obj.name; }',
      'const isNumber = (val: any): val is number => typeof val === "number";',

      // Non-boolean variables should not be flagged
      'const name = "John";',
      'const count = 42;',
      'const users = ["user1", "user2"];',
      'function getName() { return "John"; }',
      'const getCount = () => 42;',
      'class User { getName() { return this.name; } }',

      // Object literal with boolean properties using approved prefixes
      'const settings = { isEnabled: true, hasFeature: false };',

      // Arrow functions returning boolean with approved prefixes
      'const isValid = () => true;',
      'const hasPermission = (user) => checkAccess(user);',

      // Function declarations returning boolean with approved prefixes
      'function isAuthorized(): boolean { return checkAuth(); }',
      'function canPerformAction(): boolean { return true; }',

      // Getters already using boolean prefixes
      `
    class User {
      get isActive() {
        return this.status === 'active';
      }

      get isAdmin() {
        return this.role === 'admin';
      }

      get isVerified() {
        return this.emailVerified && this.phoneVerified;
      }

      get hasPremium() {
        return this.subscription?.tier === 'premium';
      }
    }
    `,

      // Getters that return non-boolean values should not be flagged
      `
    class Profile {
      get name() {
        return this.firstName + ' ' + this.lastName;
      }

      get age() {
        return this.calculateAge();
      }

      get profile() {
        return { name: this.name, age: this.age };
      }
    }
    `,

      // Getter returning private non-boolean field should not imply boolean
      `
    class PrivateState {
      get name() {
        return this._name;
      }
    }
    `,

      // Getters with mixed return types are ignored
      `
    class UserWithStatus {
      get status() {
        if (this.isDeleted) return false;
        if (this.isPending) return 'pending';
        return this.isActive;
      }
    }
    `,

      // Underscore-prefixed getter is allowed
      `
    class FeatureFlags {
      get _enabled() {
        return !!this.flags.featureX;
      }
    }
    `,

      // Getter returning boolean but ignored when configured for overrides
      {
        code: `
    abstract class BaseEntity {
      abstract get active(): boolean;
    }

    class User extends BaseEntity {
      override get active() {
        return this.status === 'active';
      }
    }
    `,
        options: [{ ignoreOverriddenGetters: true }],
      },

      // Getter with explicit boolean annotation and prefix
      `
    class Account {
      get isLocked(): boolean {
        return this.failedAttempts > 3;
      }
    }
    `,

      // Object literals with boolean properties (now ignored)
      'const settings = { enabled: true, feature: false };',
      `
      const config = { enabled: true };
      if (config && extraCondition) {
        doSomething(config);
      }
      `,
      `
      const flags = { visible: true };
      flags === otherConfig;
      `,
      'const IS_READY = true;',
      'const is_ready = true;',

      // Abstract class properties with approved prefixes
      'abstract class Feature { abstract isEnabled: boolean; }',
      'abstract class Feature { abstract readonly hasAccess: boolean; }',
      'abstract class Feature { protected abstract isVisible: boolean; }',
      'abstract class Feature { public abstract readonly canEdit: boolean; }',
      'abstract class Feature { abstract isEnabled?: boolean; }',

      // Abstract class properties that are not boolean
      'abstract class Feature { abstract count: number; }',
      'abstract class Feature { abstract label: string; }',
      'abstract class Feature { abstract config: { enabled: boolean }; }',

      // Underscore-prefixed abstract property is treated as internal
      'abstract class Feature { protected abstract _enabled: boolean; }',

      // Non-Identifier (computed) abstract property keys are skipped, exactly as
      // they are for concrete properties
      `
    abstract class Feature {
      abstract ['enabled']: boolean;
    }
    `,

      // Constructor parameter properties with approved prefixes
      'class Feature { constructor(private isEnabled: boolean) {} }',
      'class Feature { constructor(public readonly hasAccess: boolean) {} }',
      'class Feature { constructor(protected canEdit: boolean) {} }',
      'class Feature { constructor(private readonly isVisible?: boolean) {} }',
      'class Feature { constructor(private isEnabled: boolean = true) {} }',
      'class Feature { constructor(private isEnabled = true) {} }',

      // Constructor parameter properties that are not boolean
      'class Feature { constructor(private name: string) {} }',
      'class Feature { constructor(public readonly count: number) {} }',
      'class Feature { constructor(private config: { enabled: boolean }) {} }',

      // Underscore-prefixed parameter property is treated as internal
      'class Feature { constructor(private _enabled: boolean) {} }',

      // Abstract properties honor custom prefixes
      {
        code: 'abstract class Feature { abstract hasAccess: boolean; }',
        options: [{ prefixes: ['has'] }],
      },
      {
        code: 'class Feature { constructor(private hasAccess: boolean) {} }',
        options: [{ prefixes: ['has'] }],
      },

      // An optional link does not weaken the prefix requirement, so a name that
      // already carries one satisfies the rule under a chain exactly as it does
      // without one.
      `declare const user: { isLoggedIn: boolean } | undefined;
const isLoggedIn = user?.isLoggedIn;`,
      `type Props = { canDelete?: (id: string) => boolean };
const isDeletable = (props: Props) => props.canDelete?.('x');`,

      // Unwrapping the chain must not widen the heuristics themselves: a
      // property or callee that suggests nothing about booleans stays silent,
      // matching the un-chained spelling.
      `declare const user: { name: string } | undefined;
const name = user?.name;`,
      `declare const api: { fetchUser?: (id: string) => string };
const account = api.fetchUser?.('x');`,

      // A resolvable declaration still overrules the callee's name under a chain.
      `function canDelete(id: string): string {
  return id;
}
const deletable = canDelete?.('a');`,

      // A computed access carries no property name to read, chained or not.
      `declare const flags: Record<string, boolean>;
const enabled = flags?.['isEnabled'];`,

      // A binding shadowing the global `Boolean` is not the coercion, so the
      // chained call stays as silent as the plain one.
      `const Boolean = (value: unknown) => value;
declare const state: unknown;
const flag = Boolean?.(state);`,
    ],
    invalid: [
      // Variables without proper boolean prefixes
      {
        code: 'const active = true;',
        errors: [
          buildError({
            type: 'variable',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const userLoggedIn = false;',
        errors: [
          buildError({
            type: 'variable',
            name: 'userLoggedIn',
            capitalizedName: 'UserLoggedIn',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const completed = isTaskFinished();',
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Function parameters without proper boolean prefixes
      {
        code: 'function toggleFeature(enabled: boolean) { /* ... */ }',
        errors: [
          buildError({
            type: 'parameter',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const handleSubmit = (valid: boolean) => { /* ... */ };',
        errors: [
          buildError({
            type: 'parameter',
            name: 'valid',
            capitalizedName: 'Valid',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Class properties without proper boolean prefixes
      {
        code: `
      class UserAccount {
        private verified = false;
        static premium = false;

        accountLocked(): boolean {
          return this.failedAttempts > 3;
        }
      }
      `,
        errors: [
          buildError({
            type: 'property',
            name: 'verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'premium',
            capitalizedName: 'Premium',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'method',
            name: 'accountLocked',
            capitalizedName: 'AccountLocked',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Interface properties without proper boolean prefixes are flagged only
      // when property-signature enforcement is opted in.
      {
        code: `
      interface UserState {
        active: boolean;
        subscription: boolean;
      }
      `,
        options: [{ enforceForPropertySignatures: true }],
        errors: [
          buildError({
            type: 'property',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'subscription',
            capitalizedName: 'Subscription',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Opt-in also enforces type-alias property signatures.
      {
        code: `type Config = { darkMode: boolean; };`,
        options: [{ enforceForPropertySignatures: true }],
        errors: [
          buildError({
            type: 'property',
            name: 'darkMode',
            capitalizedName: 'DarkMode',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Opt-in reaches nested type-literal property signatures.
      {
        code: `interface Wrapper { meta: { archived: boolean }; }`,
        options: [{ enforceForPropertySignatures: true }],
        errors: [
          buildError({
            type: 'property',
            name: 'archived',
            capitalizedName: 'Archived',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Function declarations returning boolean without approved prefixes
      {
        code: 'function authorized(): boolean { return checkAuth(); }',
        errors: [
          buildError({
            type: 'function',
            name: 'authorized',
            capitalizedName: 'Authorized',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'function userExists(id: string): boolean { /* ... */ }',
        errors: [
          buildError({
            type: 'function',
            name: 'userExists',
            capitalizedName: 'UserExists',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Arrow functions returning boolean without approved prefixes
      {
        code: 'const valid = (): boolean => true;',
        errors: [
          buildError({
            type: 'variable',
            name: 'valid',
            capitalizedName: 'Valid',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const permission = (user): boolean => checkAccess(user);',
        errors: [
          buildError({
            type: 'variable',
            name: 'permission',
            capitalizedName: 'Permission',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Getters returning booleans without prefixes
      {
        code: `
      class User {
        get active() {
          return this.status === 'active';
        }

        get admin() {
          return this.role === 'admin';
        }

        get verified() {
          return this.emailVerified && this.phoneVerified;
        }

        get premium() {
          return this.subscription?.tier === 'premium';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'admin',
              capitalizedName: 'Admin',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'verified',
              capitalizedName: 'Verified',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'premium',
              capitalizedName: 'Premium',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class FeatureFlags {
        get enabled() {
          return true;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'enabled',
              capitalizedName: 'Enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class User {
        get active(): boolean {
          return this.status === 'active';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class Dictionary {
        map = {};

        get keyPresent() {
          return 'key' in this.map;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'keyPresent',
              capitalizedName: 'KeyPresent',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class Checker {
        value: unknown;

        get instance() {
          return this.value instanceof Error;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'instance',
              capitalizedName: 'Instance',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class User {
        get trusted() {
          return this.isVerified ? this.isAdmin : this.isActive;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'trusted',
              capitalizedName: 'Trusted',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      abstract class Base {
        abstract get active(): boolean;
      }

      class User extends Base {
        override get active() {
          return this.status === 'active';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Custom prefixes test
      {
        code: 'const isActive = true;',
        options: [{ prefixes: ['has', 'can'] }],
        errors: [
          buildError({
            type: 'variable',
            name: 'isActive',
            capitalizedName: 'IsActive',
            prefixes: 'has, can',
          }),
        ],
      },

      // Abstract class properties are the author's own declarations, so they are
      // enforced exactly like concrete class properties.
      {
        code: 'abstract class Feature { abstract enabled: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'abstract class Feature { abstract readonly visible: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: 'visible',
            capitalizedName: 'Visible',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'abstract class Feature { abstract enabled?: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'abstract class Feature { protected abstract visible: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: 'visible',
            capitalizedName: 'Visible',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'abstract class Feature { public abstract readonly locked: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: 'locked',
            capitalizedName: 'Locked',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      // Abstract properties are enforced independently of the interface-only
      // property-signature opt-in.
      {
        code: 'abstract class Feature { abstract enabled: boolean; }',
        options: [{ enforceForPropertySignatures: false }],
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'abstract class Feature { abstract isEnabled: boolean; }',
        options: [{ prefixes: ['has', 'can'] }],
        errors: [
          buildError({
            type: 'property',
            name: 'isEnabled',
            capitalizedName: 'IsEnabled',
            prefixes: 'has, can',
          }),
        ],
      },

      // Abstract and concrete members are reported side by side
      {
        code: `
      abstract class Feature {
        enabled = false;
        abstract visible: boolean;
        abstract isReady: boolean;
        abstract count: number;
      }
      `,
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'visible',
            capitalizedName: 'Visible',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Constructor parameter properties declare class fields, so they are
      // reported as properties (exactly once, not also as a parameter).
      {
        code: 'class Feature { constructor(private enabled: boolean) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(public readonly visible: boolean) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'visible',
            capitalizedName: 'Visible',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(protected locked: boolean) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'locked',
            capitalizedName: 'Locked',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(private readonly enabled?: boolean) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(private enabled: boolean = true) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(private enabled = true) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class Feature { constructor(private isEnabled: boolean) {} }',
        options: [{ prefixes: ['has', 'can'] }],
        errors: [
          buildError({
            type: 'property',
            name: 'isEnabled',
            capitalizedName: 'IsEnabled',
            prefixes: 'has, can',
          }),
        ],
      },

      // Parameter properties and plain parameters coexist in one constructor
      {
        code: 'class Feature { constructor(private enabled: boolean, active: boolean) {} }',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'parameter',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Abstract properties and parameter properties in the same class
      {
        code: `
      abstract class Feature {
        abstract visible: boolean;

        constructor(private enabled: boolean) {}
      }
      `,
        errors: [
          buildError({
            type: 'property',
            name: 'visible',
            capitalizedName: 'Visible',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // An optional link wraps the member or call in a ChainExpression, which
      // must not hide the boolean value from the initializer heuristics. The
      // resulting `boolean | undefined` still needs the prefix — the rule
      // already demands it of `enabled?: boolean` above — and the remedy is a
      // rename of the binding, which leaves the short-circuit untouched.
      {
        code: `declare const user: { isLoggedIn: boolean } | undefined;
const loggedIn = user?.isLoggedIn;`,
        errors: [
          buildError({
            type: 'variable',
            name: 'loggedIn',
            capitalizedName: 'LoggedIn',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `declare const user: { profile?: { isLoggedIn: boolean } } | undefined;
const loggedIn = user?.profile?.isLoggedIn;`,
        errors: [
          buildError({
            type: 'variable',
            name: 'loggedIn',
            capitalizedName: 'LoggedIn',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `type Props = { canDelete?: (id: string) => boolean };
function Row({ canDelete }: Props) {
  const deletable = canDelete?.('x');
  return deletable;
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'deletable',
            capitalizedName: 'Deletable',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `declare const isFallback: boolean;
declare const canDelete: ((id: string) => boolean) | undefined;
const deletable = canDelete?.('a') || isFallback;`,
        errors: [
          buildError({
            type: 'variable',
            name: 'deletable',
            capitalizedName: 'Deletable',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `declare const state: unknown;
const flag = Boolean?.(state);`,
        errors: [
          buildError({
            type: 'variable',
            name: 'flag',
            capitalizedName: 'Flag',
            prefixes: defaultPrefixes,
          }),
        ],
      },
    ],
  },
);
