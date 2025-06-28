# Enforce consistent naming conventions for boolean values by requiring approved prefixes (`@blumintinc/blumint/enforce-boolean-naming-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce consistent naming conventions for boolean values by requiring approved prefixes.

## Rule Details

This rule enforces that variables, parameters, properties, and functions with boolean types or values must start with an approved prefix. This improves code readability by making boolean values immediately recognizable from their names.

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
```

### Special Cases

Type predicates are not checked by this rule, as they have their own naming conventions:

```ts
// These are valid even though they don't follow the boolean prefix rule
function isString(value: any): value is string { return typeof value === "string"; }
function isUser(obj: any): obj is User { return obj && obj.id && obj.name; }
const isNumber = (val: any): val is number => typeof val === "number";
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
