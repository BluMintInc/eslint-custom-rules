# Enforce consistent naming conventions for boolean values by requiring approved prefixes (`@blumintinc/blumint/enforce-boolean-naming-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Boolean names without a clear prefix read like generic nouns. When they appear in conditions, props, or configuration objects, readers cannot tell that they are true/false values and may treat them as strings or objects. This rule enforces an approved boolean prefix so every boolean value advertises its contract at the call site.

## Rule Details

This rule requires boolean-typed or boolean-valued identifiers to start with an approved prefix. Without one, checks like `if (user.active)` read as generic truthiness guards; `if (user.isActive)` signals a boolean predicate and makes the intent obvious.

### Why this rule matters

- Boolean prefixes make predicates self-documenting at call sites and in object literals, reducing misreads like treating a boolean as a string or object.
- Truthiness checks become explicit: `if (user.isActive)` signals a boolean contract, while `if (user.active)` could mask non-boolean values.
- Consistent prefixes keep public APIs and props easy to scan, especially when options objects cross module boundaries.

### What this rule checks

- Variable declarations typed or inferred as boolean (including arrow functions returning boolean).
- Functions and methods that return boolean values.
- Function parameters typed as boolean and boolean properties inside parameter object type literals.
- Object literal properties, class properties, and interface/type property signatures with boolean types or values.
- Excludes type predicates and identifiers starting with `_`, which are treated as internal state.

### Approved prefixes

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
```

### Special Cases

#### Type Predicates

Type predicates are exempt because their `is` naming is part of the TypeScript type system:

```ts
function isString(value: any): value is string { return typeof value === "string"; }
function isUser(obj: any): obj is User { return obj && obj.id && obj.name; }
const isNumber = (val: any): val is number => typeof val === "number";
```

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
  "prefixes": string[]
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

## When Not To Use It

You might want to disable this rule if:

1. Your project already has an established naming convention for booleans that doesn't align with this rule
2. You prefer a different approach to boolean naming, such as suffixes instead of prefixes
3. You don't want to enforce strict naming conventions for boolean values

## Further Reading

- [Clean Code by Robert C. Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Contains recommendations on naming conventions
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines) - Microsoft's recommendations for TypeScript code style
