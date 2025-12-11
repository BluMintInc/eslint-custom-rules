# Enforce consistent naming conventions for boolean values by requiring approved prefixes (`@blumintinc/blumint/enforce-boolean-naming-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce consistent naming conventions for boolean values by requiring approved prefixes.

## Rule Details

This rule enforces that variables, parameters, properties, functions, and boolean-returning getters start with an approved prefix. This improves code readability by making boolean values immediately recognizable from their names and makes boolean getters self-documenting at call sites.

By default, the following prefixes are allowed:
- `is` - indicates state (e.g., `isActive`)
- `has` - indicates possession (e.g., `hasPermission`)
- `does` - indicates action (e.g., `doesExist`)
- `can` - indicates capability (e.g., `canEdit`)
- `should` - indicates recommendation (e.g., `shouldUpdate`)
- `will` - indicates future action (e.g., `willChange`)
- `was` - indicates past state (e.g., `wasSuccessful`)
- `had` - indicates past possession (e.g., `hadErrors`)
- `did` - indicates past action (e.g., `didComplete`)
- `would` - indicates conditional action (e.g., `wouldBenefit`)
- `must` - indicates requirement (e.g., `mustValidate`)
- `allows` - indicates permission (e.g., `allowsEditing`)
- `supports` - indicates feature availability (e.g., `supportsVideo`)
- `needs` - indicates requirement (e.g., `needsUpdate`)
- `asserts` - indicates verification (e.g., `assertsValidity`)

### Examples of **incorrect** code for this rule:

```ts
// Variables with boolean values
const active = true;
const userLoggedIn = false;
const completed = isTaskFinished();

// Function parameters with boolean types
function toggleFeature(enabled: boolean) { /* ... */ }
const handleSubmit = (valid: boolean) => { /* ... */ };

// Class properties with boolean values
class UserAccount {
  private verified = false;
  static premium = false;

  accountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

// Interface properties with boolean types
interface UserState {
  active: boolean;
  subscription: boolean;
}

// Object literal with boolean properties
const settings = { enabled: true, feature: false };

// Functions returning boolean values
function authorized(): boolean { return checkAuth(); }
function userExists(id: string): boolean { /* ... */ }

// Getters returning booleans without prefixes
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
```

### Examples of **correct** code for this rule:

```ts
// Variables with boolean values
const isActive = true;
const isUserLoggedIn = false;
const hasCompleted = isTaskFinished();
const canEdit = user.permissions.includes("edit");
const shouldRefresh = needsUpdate();
const willUpdate = condition;
const wasSuccessful = operation.status === "success";
const hadPermission = previousState.allowed;
const didUpdate = checkUpdateStatus();
const wouldBenefit = calculateBenefit() > threshold;
const mustValidate = isRequired && !isValidated;
const allowsEditing = checkPermission("edit");
const supportsVideo = checkFeatures().video;
const needsRefresh = isStale || isOutdated;

// Function parameters with boolean types
function toggleFeature(isEnabled: boolean) { /* ... */ }
function processUser(hasAccess: boolean, canModify: boolean) { /* ... */ }
const handleSubmit = (isValid: boolean) => { /* ... */ };

// Class properties with boolean values
class UserAccount {
  private isVerified = false;
  static isPremium = false;

  isAccountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

// Interface properties with boolean types
interface UserState {
  isActive: boolean;
  hasSubscription: boolean;
  canAccessPremium: boolean;
}

// Object literal with boolean properties
const settings = { isEnabled: true, hasFeature: false };

// Functions returning boolean values
function isAuthorized(): boolean { return checkAuth(); }
function canPerformAction(): boolean { return true; }

// Getters returning booleans with prefixes
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
```

### Special Cases

#### Type Predicates

Type predicates are not checked by this rule, as they have their own naming conventions:

```ts
// These are valid even though they don't follow the boolean prefix rule
function isString(value: any): value is string { return typeof value === "string"; }
function isUser(obj: any): obj is User { return obj && obj.id && obj.name; }
const isNumber = (val: any): val is number => typeof val === "number";
```

#### Boolean getters

- Getters must follow boolean prefixes when they either declare a `boolean` return type or when every return statement evaluates to a boolean expression (comparisons, logical operators, negations, or identifiers/calls with boolean-style prefixes).
- Getters are skipped when any branch returns a non-boolean value or mixes boolean and non-boolean returns to avoid false positives on computed property accessors.
- Boolean inference covers comparison operators including `in` and `instanceof`, so getters like `return 'key' in store` or `return value instanceof Error` are treated as boolean-returning.
- If inheritance contracts prevent renaming, set `ignoreOverriddenGetters: true` to skip abstract or `override` getters.
- Accessing underscore-prefixed members (e.g., `this._name`) does not imply a boolean return on its own; those are treated as neutral private fields unless their names match a boolean prefix or suffix.

#### Private/Internal Properties with Underscore Prefix

Properties that start with an underscore (`_`) are considered private or internal implementation details and are exempt from this rule:

```ts
// These are valid even though they don't have an approved boolean prefix after the underscore
interface UserState {
  _loading: boolean;  // Valid - underscore prefix indicates internal state
  _fetched: boolean;  // Valid - underscore prefix indicates internal state
  name: string;
}

class UserService {
  _authenticated: boolean = false;  // Valid - underscore prefix indicates private property

  login() {
    this._authenticated = true;
  }
}

// In a React component
const [userInternal, setUserInternal] = useState<
  Loadable<FirebaseUserLocal & { _isFetchedFromRemote?: boolean }>
>(findItem(FIREBASE_USER_LOCAL_KEY_REGEX) || undefined);
```

## Options

This rule accepts an options object with the following properties:

```ts
{
  "prefixes": string[],
  "ignoreOverriddenGetters": boolean
}
```

### `prefixes`

An array of strings that are valid prefixes for boolean names. If not provided, the default list of prefixes will be used.

### Example configuration

```json
{
  "rules": {
    "@blumint/enforce-boolean-naming-prefixes": ["error", {
      "prefixes": ["is", "has", "can", "should"]
    }]
  }
}
```

With this configuration, only the prefixes "is", "has", "can", and "should" will be allowed for boolean names.

### `ignoreOverriddenGetters`

When `true`, getters marked `override` or declared as abstract are ignored. Use this when renaming getters would break inheritance contracts or interface compliance. Defaults to `false` so boolean prefixes are enforced on getters unless explicitly opted out.

## When Not To Use It

You might want to disable this rule if:

1. Your project already has an established naming convention for booleans that doesn't align with this rule
2. You prefer a different approach to boolean naming, such as suffixes instead of prefixes
3. You don't want to enforce strict naming conventions for boolean values

## Further Reading

- [Clean Code by Robert C. Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Contains recommendations on naming conventions
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines) - Microsoft's recommendations for TypeScript code style
