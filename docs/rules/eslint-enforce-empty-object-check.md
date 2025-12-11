# Ensure empty objects are treated as missing data (`@blumintinc/blumint/eslint-enforce-empty-object-check`)

💼 This rule is enabled in the ✅ `recommended` config.\
🔧 This rule is automatically fixable by the `--fix` CLI option.

<!-- end auto-generated rule header -->

Guard object existence checks against empty objects. `{}` is truthy in JavaScript, so `if (!obj)` lets empty API responses, configs, or payloads slip through and execute guarded branches with no data. The rule auto-fixes `!obj` to `!obj || Object.keys(obj).length === 0` for variables that are likely objects (based on TypeScript types when available and naming heuristics).

The rule treats `Object.keys(obj).length` comparisons to zero (`===`, `==`, `<`, or `<=`) or approved emptiness helpers as valid empty checks; other comparisons (for example `> 5` or `=== 10`) do not count.

## Rule Details

### ❌ Incorrect

```js
function processUserData(userData) {
  if (!userData) {
    return null;
  }
  return userData.name || 'Unknown';
}

const config = getConfig();
if (!config) {
  useDefaultConfig();
} else {
  applyConfig(config);
}
```

### ✅ Correct

```js
function processUserData(userData) {
  if (!userData || Object.keys(userData).length === 0) {
    return null;
  }
  return userData.name || 'Unknown';
}

const config = getConfig();
if (!config || Object.keys(config).length === 0) {
  useDefaultConfig();
} else {
  applyConfig(config);
}

// Using a helper counts as an emptiness check
if (!payload || isEmpty(payload)) {
  handle(payload);
}
```

## Options

```json
{
  "@blumintinc/blumint/eslint-enforce-empty-object-check": [
    "error",
    {
      "objectNamePattern": ["Config", "Data", "Info", "Payload"],
      "ignoreInLoops": false,
      "emptyCheckFunctions": ["isEmpty"]
    }
  ]
}
```

- `objectNamePattern` (string[], default includes Config/Data/Info/Settings/Options/Props/State/Response/Result/Payload/Map/Record/Object/Obj/Details/Meta/Profile/Request/Params/Context): additional suffixes to treat as object-like when type info is unavailable.
- `ignoreInLoops` (boolean, default `false`): skip reporting inside loop conditions to avoid extra `Object.keys` calls in hot paths.
- `emptyCheckFunctions` (string[], default `["isEmpty"]`): additional functions (identifier or property names) that already perform emptiness checks; merged with the default so adding custom helpers keeps recognition of `isEmpty`.

## When Not To Use It

- When the type guarantees a fully populated object (e.g., interfaces with required fields where `{}` is impossible) and you intentionally rely on that guarantee.
- In performance-critical loops where repeated `Object.keys` checks are unacceptable; set `ignoreInLoops` to `true` instead of disabling globally.
