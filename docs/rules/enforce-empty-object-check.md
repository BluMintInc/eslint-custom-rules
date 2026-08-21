# Ensure object existence checks also guard against empty objects so that empty payloads are treated like missing data (`@blumintinc/blumint/enforce-empty-object-check`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Guard object existence checks against empty objects. `{}` is truthy in JavaScript, so `if (!obj)` lets empty API responses, configs, or payloads slip through and execute guarded branches with no data. The rule auto-fixes `!obj` to `!obj || Object.keys(obj).length === 0` for variables that are likely objects (based on TypeScript types when available and naming heuristics).

The rule treats `Object.keys(obj).length` comparisons to zero (`===`, `==`, `<=`, or the reversed form `0 >= ...`), `!Object.keys(obj).length`, or approved emptiness helpers as valid empty checks; other comparisons (for example `> 5` or `=== 10`) do not count.

Optional-chained spellings of those same checks count too — `Object?.keys?.(obj)?.length === 0`, `Object.keys(obj)?.length === 0`, and `isEmpty?.(obj)` are recognized exactly as their plain forms are, because every `?.` link there guards a receiver (the `Object` global, the array `Object.keys` returns) that is never nullish, so the guard is the same guard.

When TypeScript types are available, values that are not data objects are exempt: primitives, arrays and tuples, types with required properties, and **callable or constructable types**. A function type, a class reference, a `new (...) => T` (or `abstract new (...) => T`) signature, and React's `ComponentType` are behaviour, not data — their own enumerable keys are statics, so `Object.keys()` returns `[]` for a plain arrow-function component or a class with no static members even when a perfectly valid value was supplied. Adding the prescribed emptiness check to such a guard would invert it. A union is exempt only when no member is a data object, so a union that mixes a constructor with a payload type is still reported.

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

```ts
type UserData = {
  name?: string;
};

function processUserData(userData: UserData | undefined) {
  if (!userData || Object.keys(userData).length === 0) {
    return null;
  }
  return userData.name ?? 'Unknown';
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

Callable and constructable types keep a plain falsiness guard, because emptiness
is meaningless for them:

```ts
type BuilderConstructor = new (id: string) => { build(): string };
declare const BuilderClass: BuilderConstructor | undefined;

function buildNotification(id: string) {
  // Object.keys(BuilderClass) is [] for a class without statics, so an
  // emptiness check here would throw on every valid builder.
  if (!BuilderClass) {
    throw new Error('no builder registered');
  }
  return new BuilderClass(id).build();
}
```

### ✅ Parentheses in the fix

The fix emits `!obj || Object.keys(obj).length === 0` and groups it in
parentheses only where the position it lands in needs them. `||` binds looser
than nearly every other operator, so the grouping is load-bearing beside an `&&`
and mandatory beside a `??` (which may not mix with `||` unparenthesized at
all), and superfluous wherever the surrounding syntax already delimits the
expression — an `if`, `while`, `do…while` or `for` header, a ternary branch,
another `||` operand, or parentheses the author already wrote. Grouping
unconditionally would emit a pair prettier deletes, so `--fix` would leave
source no formatter prints.

```ts
// Directly inside the `if` parentheses: the header already groups it.
if (!userConfig || Object.keys(userConfig).length === 0) {
  useDefaults();
}

// Beside `&&`, which binds tighter: the parentheses carry the meaning.
if (isReady && (!userConfig || Object.keys(userConfig).length === 0)) {
  useDefaults();
}
```

## Options

```json
{
  "@blumintinc/blumint/enforce-empty-object-check": [
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
