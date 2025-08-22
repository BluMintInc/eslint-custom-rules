# Ensure Firestore security rules use .get() with a default value instead of direct field access comparisons (e.g., resource.data.fieldX.fieldY != null) (`@blumintinc/blumint/enforce-firestore-rules-get-access`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

When writing Firestore security rules, avoid directly accessing nested fields with property chains like `resource.data.fieldX.fieldY != null`. Such access can behave unexpectedly when fields are missing. Instead, use `.get('<field>', <default>)` chaining with a default value to safely handle missing fields.

## Rule Details

- **Disallowed**: Direct field access comparisons to `null`/`undefined` in Firestore rules strings/templates, e.g., `resource.data.user.name != null`.
- **Required**: Use `.get('<field>', <default>)` with a provided default value (e.g., `null`) and chain for deeper paths, e.g., `resource.data.get('user', null).get('name', null) != null`.

This rule checks string and template literals that look like Firestore rules and:
- Flags direct property access comparisons like `resource.data.foo.bar === null` or `request.resource.data.x.y != undefined`.
- Flags `.get('<field>')` calls missing a default value.
- Provides auto-fixes for string literals (not for template literals).

## Examples

### ❌ Incorrect

```javascript
// Direct property access may fail if a field is missing
const rules = "allow read: if resource.data.fieldX.fieldY != null;";
```

```javascript
// Missing default in .get()
const rules = "allow read: if resource.data.get('fieldX') != null;";
```

```javascript
// request.resource variant
const rules = "allow update: if request.resource.data.profile.image === undefined;";
```

### ✅ Correct

```javascript
// Safe null check using .get() with a default value
const rules = "allow read: if resource.data.get('fieldX', null) != null;";
```

```javascript
// Chained .get() for nested fields
const rules = "allow update: if request.resource.data.get('fieldX', null).get('fieldY', null) != null;";
```

## When Not To Use It

- If your project does not store or lint Firestore rules as strings or template literals in your codebase, this rule may be unnecessary.

## Further Reading

- Firestore Security Rules best practices
