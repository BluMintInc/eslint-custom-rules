# Enforce checking for both undefined/falsy objects AND empty objects when performing object existence validation (`@blumintinc/blumint/enforce-empty-object-check`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces checking for both undefined/falsy objects AND empty objects when performing object existence validation. This addresses the common oversight where developers check if an object exists (`!object`) but fail to account for empty objects (`{}`), which are truthy in JavaScript but often have no practical application value in business logic.

Empty objects can lead to subtle bugs where code assumes an object has meaningful data when it's actually empty. This commonly occurs with API responses, user input validation, and data processing workflows where an empty object should be treated the same as a missing object.

## Examples

### ❌ Incorrect

```javascript
function processUserData(userData) {
  if (!userData) {
    return null;
  }
  // This will execute even if userData is {} (empty object)
  return userData.name || 'Unknown';
}

const config = getConfig();
if (!config) {
  useDefaultConfig();
} else {
  // This executes even if config is {}, leading to potential issues
  applyConfig(config);
}

if (!userConfig) {
  loadDefaults();
}

if (!apiResponse) {
  handleError();
}
```

### ✅ Correct

```javascript
function processUserData(userData) {
  if (!userData || Object.keys(userData).length === 0) {
    return null;
  }
  // Now properly handles both undefined and empty objects
  return userData.name || 'Unknown';
}

const config = getConfig();
if (!config || Object.keys(config).length === 0) {
  useDefaultConfig();
} else {
  // Only executes when config has actual properties
  applyConfig(config);
}

if (!userConfig || Object.keys(userConfig).length === 0) {
  loadDefaults();
}

if (!apiResponse || Object.keys(apiResponse).length === 0) {
  handleError();
}

// Already correct patterns are not flagged
if (!userConfig || Object.keys(userConfig).length === 0) {
  useDefault();
}

// Non-object-like variables are not flagged
if (!isEnabled) {
  return;
}

if (!count) {
  return;
}
```

## Options

This rule accepts an options object with the following properties:

### `objectSuffixes`

An array of strings representing suffixes that indicate a variable is likely an object. Default suffixes include common object naming patterns.

**Default:** `['Config', 'Data', 'Info', 'Settings', 'Options', 'Props', 'State', 'Params', 'Meta', 'Attributes', 'Details', 'Spec', 'Schema', 'Model', 'Entity', 'Record', 'Document', 'Item', 'Object', 'Map', 'Dict', 'Cache', 'Store', 'Context', 'Payload', 'Response', 'Request']`

### `ignoreInLoops`

When `true`, the rule will not flag object checks inside loops to avoid performance issues with repeated `Object.keys()` calls.

**Default:** `true`

### `ignorePerformanceSensitive`

When `true`, the rule will not flag object checks in performance-sensitive contexts like array method callbacks (`map`, `filter`, etc.).

**Default:** `true`

## Config

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-empty-object-check": [
      "error",
      {
        "objectSuffixes": ["Config", "Data", "Settings"],
        "ignoreInLoops": true,
        "ignorePerformanceSensitive": true
      }
    ]
  }
}
```

## When Not To Use It

- If your codebase intentionally treats empty objects as valid data
- If performance is critical and you cannot afford the overhead of `Object.keys()` calls
- If you have a different convention for handling empty objects

## Related Rules

- [no-always-true-false-conditions](./no-always-true-false-conditions.md) - Detects conditions that are always truthy or falsy
