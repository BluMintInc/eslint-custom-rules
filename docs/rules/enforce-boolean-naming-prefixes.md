# enforce-boolean-naming-prefixes

This rule enforces consistent naming conventions for boolean values across the codebase by requiring all boolean variables, parameters, properties, and methods to start with an approved prefix.

## Rule Details

This rule aims to make code more readable and self-documenting by clearly indicating the boolean nature of a value through its name. Following this convention helps developers immediately understand the purpose and expected values of boolean entities without having to check their type definitions or implementations.

The rule applies to:
- Boolean variables and constants
- Function parameters of boolean type
- Class instance fields of boolean type
- Class static fields of boolean type
- Methods that return boolean values
- Function declarations that return boolean values

### Default Approved Prefixes

By default, the rule enforces the following prefixes:
- `is` - Indicates state (isActive, isVisible)
- `has` - Indicates possession (hasPermission, hasChildren)
- `does` - Indicates capability (doesSupport, doesContain)
- `can` - Indicates ability (canEdit, canDelete)
- `should` - Indicates recommendation (shouldUpdate, shouldRefresh)
- `will` - Indicates future action (willUpdate, willChange)
- `was` - Indicates past state (wasSuccessful, wasVisible)
- `had` - Indicates past possession (hadPermission, hadFocus)
- `did` - Indicates past action (didUpdate, didChange)
- `would` - Indicates conditional action (wouldBenefit, wouldApply)
- `must` - Indicates requirement (mustValidate, mustInclude)
- `allows` - Indicates permission (allowsEditing, allowsMultiple)
- `supports` - Indicates feature support (supportsVideo, supportsEncryption)
- `needs` - Indicates necessity (needsRefresh, needsValidation)

### Examples

Examples of **incorrect** code for this rule:

```typescript
// Variables without proper boolean prefixes
const active = true;
const userLoggedIn = false;
const completed = isTaskFinished();

// Function parameters without proper boolean prefixes
function toggleFeature(enabled: boolean) { /* ... */ }

// Class properties without proper boolean prefixes
class UserAccount {
  private verified = false;
  static premium = false;

  accountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

// Function return values without proper boolean prefixes
function userExists(id: string): boolean { /* ... */ }
```

Examples of **correct** code for this rule:

```typescript
// Variables with proper boolean prefixes
const isActive = true;
const isUserLoggedIn = false;
const hasCompleted = isTaskFinished();

// Function parameters with proper boolean prefixes
function toggleFeature(isEnabled: boolean) { /* ... */ }

// Class properties with proper boolean prefixes
class UserAccount {
  private isVerified = false;
  static isPremium = false;

  isAccountLocked(): boolean {
    return this.failedAttempts > 3;
  }
}

// Function return values with proper boolean prefixes
function doesUserExist(id: string): boolean { /* ... */ }
```

## Options

The rule accepts an options object with the following properties:

```js
{
  "prefixes": ["is", "has", "does", "can", "should", "will", "was", "had", "did", "would", "must", "allows", "supports", "needs"]
}
```

You can customize the list of approved prefixes by providing your own array:

```js
{
  "@blumintinc/blumint/enforce-boolean-naming-prefixes": ["error", {
    "prefixes": ["is", "has", "can"]
  }]
}
```

## When Not To Use It

You might consider disabling this rule in the following situations:

1. When working with external APIs or data structures that have predefined naming conventions
2. In projects that have established different naming conventions for boolean values
3. When using destructuring from objects where you can't control the property names

## Further Reading

- [Clean Code by Robert C. Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)
