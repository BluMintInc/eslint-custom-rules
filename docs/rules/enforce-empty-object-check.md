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

### Line breaks in the fix

The guard roughly doubles the width of the condition it widens, which regularly
pushes the statement holding it past the print width. Prettier answers that by
breaking the statement header, so a fix that only ever emitted one line left
source `prettier --check` rejects — and a lint run carrying `--fix` then landed
non-canonical source before a human read the report.

Past [`printWidth`](#printwidth) the fixer therefore owns the whole condition and
emits the break itself:

```ts
// before
if (!payload || Object.keys(payload).length > 5) {
  handle(payload);
}
```

```ts
// after --fix
if (
  !payload ||
  Object.keys(payload).length === 0 ||
  Object.keys(payload).length > 5
) {
  handle(payload);
}
```

The same applies to a `while` header, the `} while (…)` trailer of a `do…while`,
a conditional in an assignment (which breaks after the `=`) and one in a `return`
(which does not):

```ts
// after --fix
const displayName =
  !userProfile || Object.keys(userProfile).length === 0
    ? 'anonymous'
    : userProfile.name;
```

A clause that is not a block belongs to the same group as the header it hangs
off, so it moves to its own line with it — on its own when the widened test
still fits between the parentheses, and under the broken test when it does not:

```ts
// after --fix
if (!appConfig || Object.keys(appConfig).length === 0 || flag)
  handleConfiguredApplication();
```

A declaration holding more than one declarator lays each one after the first out
a level in, and indents a break after `=` a level past that:

```ts
// after --fix
const first = 1,
  second =
    !userProfile || Object.keys(userProfile).length === 0
      ? 'anonymous'
      : userProfile.name;
```

An inline `/* … */` comment inside the condition is carried rather than declined:
one written after an operand rides that operand's line ahead of the trailing
operator, and one written before an operand opens that operand's line, which is
where Prettier puts them.

Where the break is one this fixer does not author — an operand too wide for its
own line, a chained ternary, a condition carrying a `//` comment — the fix stays
the minimal replacement and leaves the re-wrap to the formatter. Declining costs
only the layout: the guard is added either way.

## Options

```json
{
  "@blumintinc/blumint/enforce-empty-object-check": [
    "error",
    {
      "objectNamePattern": ["Config", "Data", "Info", "Payload"],
      "ignoreInLoops": false,
      "emptyCheckFunctions": ["isEmpty"],
      "printWidth": 80
    }
  ]
}
```

- `objectNamePattern` (string[], default includes Config/Data/Info/Settings/Options/Props/State/Response/Result/Payload/Map/Record/Object/Obj/Details/Meta/Profile/Request/Params/Context): additional suffixes to treat as object-like when type info is unavailable.
- `ignoreInLoops` (boolean, default `false`): skip reporting inside loop conditions to avoid extra `Object.keys` calls in hot paths.
- `emptyCheckFunctions` (string[], default `["isEmpty"]`): additional functions (identifier or property names) that already perform emptiness checks; merged with the default so adding custom helpers keeps recognition of `isEmpty`.
- `printWidth` (number, default `80`): the column the autofix wraps the widened condition at.

### `printWidth`

Type: `number`

Default: `80`

The column the autofix wraps at, matching Prettier's option of the same name.
Set it to your formatter's `printWidth` so the fixed source is already in the
shape the formatter would produce; a lint run carrying `--fix` otherwise leaves
the tree failing `prettier --check`.

The option changes the emission in both directions. Raised, a condition that
would have been broken stays on one line:

```ts
// printWidth: 120 — 86 columns, so no break
if (!payload || Object.keys(payload).length === 0 || Object.keys(payload).length > 5) {
  handle(payload);
}
```

Lowered, a condition that fits at the default is broken:

```ts
// printWidth: 60 — 65 columns, so it breaks
if (
  !userDataRecord ||
  Object.keys(userDataRecord).length === 0
) {
  handle(userDataRecord);
}
```

Only the fix moves: the option decides layout, never whether a guard is
reported.

## When Not To Use It

- When the type guarantees a fully populated object (e.g., interfaces with required fields where `{}` is impossible) and you intentionally rely on that guarantee.
- In performance-critical loops where repeated `Object.keys` checks are unacceptable; set `ignoreInLoops` to `true` instead of disabling globally.
