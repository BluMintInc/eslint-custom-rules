# Enforce consistent naming conventions for boolean values by requiring approved prefixes (`@blumintinc/blumint/enforce-boolean-naming-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

When you name a boolean without a clear prefix, it reads like a generic noun. In conditions, props, or configuration objects, readers cannot tell that it is a true/false value and may treat it as a string or object. This rule helps you require an approved boolean prefix so every boolean value advertises its contract at the call site.

## Rule Details

This rule requires your boolean-typed or boolean-valued identifiers to start with an approved prefix. Without one, checks like `if (user.active)` read as generic truthiness guards; `if (user.isActive)` signals a boolean predicate and makes your intent obvious.

### Why this rule matters

- You make predicates self-documenting at call sites and in object literals, reducing misreads like treating a boolean as a string or object.
- You keep truthiness checks explicit: `if (user.isActive)` signals a boolean contract, while `if (user.active)` can hide non-boolean values.
- You keep public APIs and props easy to scan, especially when options objects cross module boundaries.

### What this rule checks

- Your variable declarations typed or inferred as boolean (including arrow functions returning boolean).
- Your functions and methods that return boolean values.
- Your function parameters typed as boolean and boolean properties inside parameter object type literals.
- Your object literal properties, class properties, and interface/type property signatures with boolean types or values.
- The rule excludes type predicates and identifiers starting with `_`, which are treated as internal state.

### Common approved prefixes

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

The rule also accepts additional prefixes such as `are` and `includes` for compatibility; the error message highlights the common set above so you know the typical choices.

### Examples of **incorrect** code for this rule

```ts
const active = true;
const userLoggedIn = false;
const completed = isTaskFinished();

function toggleFeature(enabled: boolean) { /* ... */ }
const handleSubmit = (valid: boolean) => { /* ... */ };

class UserAccount {
  private verified = false;
  static premium = false;

  accountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

interface UserState {
  active: boolean;
  subscription: boolean;
}

const settings = { enabled: true, feature: false };

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

### Examples of **correct** code for this rule

```ts
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

function toggleFeature(isEnabled: boolean) { /* ... */ }
function processUser(hasAccess: boolean, canModify: boolean) { /* ... */ }
const handleSubmit = (isValid: boolean) => { /* ... */ };

class UserAccount {
  private isVerified = false;
  static isPremium = false;

  isAccountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

interface UserState {
  isActive: boolean;
  hasSubscription: boolean;
  canAccessPremium: boolean;
}

const settings = { isEnabled: true, hasFeature: false };

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

Type predicates are exempt because their `is` naming is part of the TypeScript type system:

```ts
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

Properties that start with an underscore (`_`) are treated as internal state and are exempt from this rule:

```ts
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
