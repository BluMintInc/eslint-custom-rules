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

      // ECMA private members (`#name`) are the same subject as `private` ones,
      // so an approved prefix satisfies the rule under either spelling.
      'class UserAccount { #isVerified = false; }',
      'class UserAccount { readonly #hasAccess!: boolean; }',
      'class UserAccount { static #isPremium = false; }',
      'class UserAccount { #isLocked(): boolean { return true; } }',
      `
    class UserAccount {
      #status = 'active';

      get #isActive() {
        return this.#status === 'active';
      }
    }
    `,

      // A `#` member that holds no boolean carries no naming obligation
      "class UserAccount { #name = 'x'; }",
      'class UserAccount { #count: number = 3; }',

      // The documented underscore opt-out is keyed on the name, so it survives
      // the `#` spelling: `#_verified`'s name is `_verified`.
      'class UserAccount { #_verified = false; }',

      // Custom prefixes reach `#` members exactly as they reach `private` ones
      {
        code: 'class UserAccount { #hasAccess!: boolean; }',
        options: [{ prefixes: ['has'] }],
      },

      // Isolation control for the `#` cases: the same rename while KEEPING the
      // `private` modifier is silent too, so the verdicts above are attributable
      // to the name rather than to the privacy spelling.
      'class UserAccount { private isVerified = false; }',
      'class UserAccount { private static isPremium = false; }',
      // Spelled over several lines because the single-line spelling of this
      // control trips a fix-fixpoint defect in `enforce-memoize-getters`, whose
      // fixer stacks `@Memoize()` above a one-line class instead of on the
      // getter `prefer-getter-over-parameterless-method` just produced. The
      // control's subject is the name, which the line breaks do not touch.
      `
    class UserAccount {
      private isLocked(): boolean {
        return true;
      }
    }
    `,

      // A `ValidatorPipeline` verdict is `true | string`, and
      // `enforce-is-prefix-validators` mandates the `is` prefix on the validator
      // that produces it, so reading booleanness off that prefix makes the two
      // rules unsatisfiable together. A use site treating the value as a string
      // settles it against the name. (Issue #2016, verbatim report.)
      {
        code: `
    const isCoordinationCode = ValidatorPipeline.start(isNotEmpty)
      .add(isTrimmed).combinedValidator;

    export const assertCoordinationCode = (value) => {
      const verdict = isCoordinationCode(value);
      if (typeof verdict === 'string') {
        throw new Error(verdict);
      }
    };
  `,
        // EXPECTED: no report — \`verdict\` is \`true | string\`, not a boolean.
        // ACTUAL: "Boolean variable \\"verdict\\" is missing a common approved boolean prefix"
      },

      // A direct call to an `is`-prefixed validator carries the same
      // contradiction without any builder chain in the way, and the callee's
      // body is as far out of reach here as it is behind the chain.
      `const validation = isPercentage(input);
if (typeof validation === 'string') {
  throw new Error(validation);
}`,

      // `!==` reads the same value the same way: the branch that survives the
      // check is the one where the verdict is not a string.
      `const outcome = isBestOfValid(value);
if (typeof outcome !== 'string') {
  accept();
}`,

      // Operand order carries no meaning.
      `const outcome = isIntegerInRange(value);
if ('string' === typeof outcome) {
  reject(outcome);
}`,

      // Any `typeof` tag other than 'boolean' contradicts, not only 'string'.
      `const outcome = isPositiveInteger(value);
if (typeof outcome === 'number') {
  reject(outcome);
}`,

      // A template literal spells the same tag.
      `const outcome = isIntegerPercentage(value);
if (typeof outcome === \`string\`) {
  reject(outcome);
}`,

      // Loose equality is the same assertion about the tag.
      `const outcome = isTrimmed(value);
if (typeof outcome == 'string') {
  reject(outcome);
}`,

      // The `Error` message parameter is a string, so passing the verdict to it
      // contradicts booleanness on its own.
      `const outcome = isNotEmpty(value);
if (outcome !== true) {
  throw new Error(outcome);
}`,

      // Any `…Error` class takes the same message parameter.
      `const outcome = isNotEmpty(value);
if (outcome !== true) {
  throw new ValidationError(outcome);
}`,

      // A pass-through wrapper around the reference does not hide the use.
      `const outcome = isNotEmpty(value);
throw new Error(outcome as string);`,

      // Comparing the value with a string literal, in either order.
      `const outcome = isCoordinationCode(value);
if (outcome === 'too short') {
  reject();
}`,
      `const outcome = isCoordinationCode(value);
if ('too short' !== outcome) {
  accept();
}`,

      // The contradiction may sit in a nested block, or in an arrow declared in
      // the same scope: the scope manager resolves both references to this
      // binding.
      `const outcome = isCoordinationCode(value);
if (shouldReport) {
  if (typeof outcome === 'string') {
    throw new Error(outcome);
  }
}`,
      `const outcome = isCoordinationCode(value);
const report = () => {
  if (typeof outcome === 'string') {
    throw new Error(outcome);
  }
};`,

      // A boolean-sounding property is a name too, so a use site outranks it.
      `const outcome = validator.isValid;
if (typeof outcome === 'string') {
  throw new Error(outcome);
}`,

      // The left operand of a fallback reaches booleanness through the same
      // callee name, so the contradiction reaches it too.
      `const outcome = isNotEmpty(value) || isTrimmed(value);
if (typeof outcome === 'string') {
  throw new Error(outcome);
}`,

      // A validator whose body is reachable is settled by its own declaration,
      // with no use site needed: the `true`/message branches classify as
      // non-boolean, which is the declaration-first rule the callee-name
      // heuristic already defers to. Spelled without a return annotation
      // because that is the convention which leaves the verdict's type
      // invisible to the rule in the first place.
      `const isTrimmedValue = (value: string) =>
  value.trim() === value ? true : 'untrimmed';
const outcome = isTrimmedValue(input);`,

      // A default written with `??` is read exactly as the `||` spelling of the
      // same default, so a prefixed name stays silent under either operator.
      'const isActive = check() ?? false;',
      'const hasAccess = permissions.canEdit ?? false;',

      // Widening the operator set must not start reading a non-boolean default
      // as a boolean one: the fallback screen classifies from the OPERAND, and
      // a string, number, array, object or template default settles it against
      // booleanness whichever operator introduces it.
      "const name = getName() ?? 'anon';",
      'const count = getCount() ?? 0;',
      'const items = getItems() ?? [];',
      'const options = getOptions() ?? {};',
      'const label = getLabel() ?? `none`;',

      // The left operand of a `??` default reaches booleanness through a callee
      // name just as the `||` spelling does, so a use site reading the value as
      // a string outranks it identically. Without this, the `??` spelling would
      // report where `||` stays silent.
      `const outcome = isNotEmpty(value) ?? isTrimmed(value);
if (typeof outcome === 'string') {
  throw new Error(outcome);
}`,
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

      // ECMA private (`#`) members carry the same obligation as `private` ones.
      // The two spellings are mutually exclusive — `private #foo` is TS18010 —
      // so an author on `#` cannot opt into coverage by adding the modifier.
      // Reports quote the member as written, keeping `#verified` distinct from a
      // sibling public `verified`. The rule ships no fixer, so `output: null`
      // records that the remedy stays manual.
      {
        code: 'class UserAccount { #verified = false; }',
        output: null,
        errors: [
          buildError({
            type: 'property',
            name: '#verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class UserAccount { #verified!: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: '#verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class UserAccount { readonly #verified!: boolean; }',
        errors: [
          buildError({
            type: 'property',
            name: '#verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class UserAccount { static #premium = false; }',
        errors: [
          buildError({
            type: 'property',
            name: '#premium',
            capitalizedName: 'Premium',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class UserAccount { #locked(): boolean { return true; } }',
        errors: [
          buildError({
            type: 'method',
            name: '#locked',
            capitalizedName: 'Locked',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `
      class UserAccount {
        #status = 'active';

        get #active() {
          return this.#status === 'active';
        }
      }
      `,
        errors: [
          buildError({
            type: 'getter',
            name: '#active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'class UserAccount { static get #ready(): boolean { return true; } }',
        errors: [
          buildError({
            type: 'getter',
            name: '#ready',
            capitalizedName: 'Ready',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A `#` member read inside the class is as boolean-suggesting as the same
      // member reached through the `private` spelling, so the subject that reads
      // it stays in scope.
      {
        code: `
      class UserAccount {
        #isVerified = false;

        get #active() {
          return this.#isVerified;
        }
      }
      `,
        errors: [
          buildError({
            type: 'getter',
            name: '#active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `
      class UserAccount {
        #isStatusOk(): boolean {
          return true;
        }

        get #active() {
          return this.#isStatusOk();
        }
      }
      `,
        errors: [
          buildError({
            type: 'getter',
            name: '#active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `
      class UserAccount {
        #isVerified = false;

        render() {
          const flag = this.#isVerified;
          return flag;
        }
      }
      `,
        errors: [
          buildError({
            type: 'variable',
            name: 'flag',
            capitalizedName: 'Flag',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A `#` member and a public member of the same word are separate
      // declarations, each reported under the name it is written with.
      {
        code: `
      class UserAccount {
        verified = false;
        #verified = false;
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
            name: '#verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // The docs' headline incorrect example respelled: swapping `private` for
      // `#` must not change how many members the rule sees.
      {
        code: `
      class UserAccount {
        #verified = false;
        static premium = false;

        accountLocked(): boolean {
          return this.failedAttempts > 3;
        }
      }
      `,
        errors: [
          buildError({
            type: 'property',
            name: '#verified',
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

      // Over-decline controls for the #2016 carve-out. The rule's worth is its
      // true positives, so every one of these must survive it.

      // A result of an `is`-prefixed callee with nothing contradicting it
      // anywhere still reports: the carve-out needs a use site, not a shape.
      {
        code: `const completed = isTaskFinished();
if (completed) {
  celebrate();
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A `typeof` tag of 'boolean' affirms booleanness rather than
      // contradicting it, under either equality operator.
      {
        code: `const completed = isTaskFinished();
if (typeof completed === 'boolean') {
  celebrate();
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `const completed = isTaskFinished();
if (typeof completed !== 'boolean') {
  throw new Error('expected a flag');
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Comparing with a boolean literal is not a contradiction.
      {
        code: `const completed = isTaskFinished();
if (completed === true) {
  celebrate();
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // The contradiction belongs to a DIFFERENT binding whose name merely
      // looks alike, so it cannot excuse this one.
      {
        code: `const verdict = isCoordinationCode(value);
const verdictMessage = getMessage(value);
if (typeof verdictMessage === 'string') {
  throw new Error(verdictMessage);
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'verdict',
            capitalizedName: 'Verdict',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A contradiction in a sibling scope does not enclose this use.
      {
        code: `function readCode(value: string) {
  const verdict = isCoordinationCode(value);
  return verdict;
}
function assertCode(value: string) {
  const verdict = isCoordinationCode(value);
  if (typeof verdict === 'string') {
    throw new Error(verdict);
  }
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'verdict',
            capitalizedName: 'Verdict',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A shadowing inner binding takes its own contradiction with it; the
      // outer binding keeps its report.
      {
        code: `const verdict = isCoordinationCode(value);
const check = (input: string) => {
  const verdict = isCoordinationCode(input);
  if (typeof verdict === 'string') {
    throw new Error(verdict);
  }
};`,
        errors: [
          buildError({
            type: 'variable',
            name: 'verdict',
            capitalizedName: 'Verdict',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // An explicit `boolean` annotation is evidence about the value, which no
      // use site may outrank.
      {
        code: `const completed: boolean = isTaskFinished();
if (typeof completed === 'string') {
  throw new Error(completed);
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // So is a boolean literal initializer.
      {
        code: `let completed = false;
if (typeof completed === 'string') {
  throw new Error(completed);
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // And so is a `Boolean()` coercion, whose callee name plays no part.
      {
        code: `const completed = Boolean(value);
if (typeof completed === 'string') {
  throw new Error(completed);
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A callee that resolves to a demonstrably boolean body settles the
      // question at the declaration, ahead of any use site.
      {
        code: `const isEmpty = (value: string) => value.length === 0;
const empty = isEmpty(input);
if (typeof empty === 'string') {
  throw new Error(empty);
}`,
        errors: [
          buildError({
            type: 'variable',
            name: 'empty',
            capitalizedName: 'Empty',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // The binding is not the message parameter, so `new Error` says nothing
      // about it.
      {
        code: `const completed = isTaskFinished();
throw new Error('failed', { cause: completed });`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A constructor that is not an error class takes no string message.
      {
        code: `const completed = isTaskFinished();
const wrapper = new Wrapper(completed);`,
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A boolean default reads the same under either fallback operator. The
      // `??` spelling is what `prefer-nullish-coalescing-boolean-props` rewrites
      // `||` into, so reading only `||` would let that fixer disarm this rule.
      {
        code: `const active = isActive() ?? false;
export { active };`,
        errors: [
          buildError({
            type: 'variable',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // The `||` control for the case above: it must keep reporting.
      {
        code: `const active = isActive() || false;
export { active };`,
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
        code: 'const loggedIn = user.isLoggedIn ?? true;',
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
        code: 'const enabled = flags?.isEnabled ?? false;',
        errors: [
          buildError({
            type: 'variable',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // A conjunction is not a default — its right operand is the result rather
      // than a fallback — so it keeps its own both-operand analysis and reports
      // independently of the fallback operator set.
      {
        code: 'const active = hasAccess() && isEnabled();',
        errors: [
          buildError({
            type: 'variable',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
    ],
  },
);
