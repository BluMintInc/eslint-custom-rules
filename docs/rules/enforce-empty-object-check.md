# Ensure object existence checks also guard against empty objects so that empty payloads are treated like missing data (`@blumintinc/blumint/enforce-empty-object-check`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Guard object existence checks against empty objects. `{}` is truthy in JavaScript, so `if (!obj)` lets empty API responses, configs, or payloads slip through and execute guarded branches with no data. The rule auto-fixes `!obj` to `!obj || Object.keys(obj).length === 0` for variables that are likely objects (based on TypeScript types when available and naming heuristics).

The rule treats `Object.keys(obj).length` comparisons to zero (`===`, `==`, `<=`, or the reversed form `0 >= ...`), `!Object.keys(obj).length`, or approved emptiness helpers as valid empty checks; other comparisons (for example `> 5` or `=== 10`) do not count.

Optional-chained spellings of those same checks count too — `Object?.keys?.(obj)?.length === 0`, `Object.keys(obj)?.length === 0`, and `isEmpty?.(obj)` are recognized exactly as their plain forms are, because every `?.` link there guards a receiver (the `Object` global, the array `Object.keys` returns) that is never nullish, so the guard is the same guard.

When TypeScript types are available, values that are not data objects are exempt: primitives, arrays and tuples, types with required properties, and **callable or constructable types**. A function type, a class reference, a `new (...) => T` (or `abstract new (...) => T`) signature, and React's `ComponentType` are behaviour, not data — their own enumerable keys are statics, so `Object.keys()` returns `[]` for a plain arrow-function component or a class with no static members even when a perfectly valid value was supplied. Adding the prescribed emptiness check to such a guard would invert it. A union is exempt only when no member is a data object, so a union that mixes a constructor with a payload type is still reported.

### When the type cannot be resolved

The type check and the naming heuristic answer different questions, and the rule
keeps them apart. If the checker can type the value, its answer is final. If the
value has no declaration to resolve — an undeclared callee, a plain-JavaScript
parse — the naming suffix decides, which is the rule's documented syntactic mode.

Between those sits a third case the rule deliberately declines: a value whose
type came back `any` because the module it came from did not resolve. That
happens to every file outside `parserOptions.project` — most commonly test files,
which a `tsconfig.json` typically excludes. Before, the suffix decided there too,
so a guard on an imported `config` reported in a test file while the
byte-identical guard in its in-program production twin was exempt, with nothing
in the message to say which regime produced the result. The rule now stays silent
when the value traces back to an import it could not resolve: a resolution
failure is not evidence the value can be `{}`. A value that does resolve is
unaffected, because the checker answers before this is ever consulted.

A DECLARED type the checker could not resolve is the same situation reached by a
different route, and gets the same answer. `Readonly<NextResponse>`,
`Map<string, string>`, `Set<string>` and `Date` all come back `any` in a program
without lib files or without the module the type came from, so the suffix used to
decide — and `response` matches `Response`. The prescribed fix inverts such a
guard rather than hardening it: a class instance keeps its state behind prototype
accessors, so `Object.keys(instance).length === 0` holds for every valid value,
the early return is always taken, and the rest of the function is dead code. An
annotation the checker could not read means it could not look, not that the value
is loosely typed, so a binding that declares a type keeps its verdict:

#### ❌ Incorrect

```ts
// No annotation to read: the suffix decides, which is the rule's syntactic mode.
function prepend(response) {
  if (!response) {
    return response;
  }
  return withPrefix(response);
}
```

#### ✅ Correct

```ts
import { NextResponse } from 'next/server';

// The annotation traces to a module the program did not resolve. The rule
// declines rather than letting the `Response` suffix overturn it.
function prepend(response: Readonly<NextResponse> | null | false) {
  if (!response) {
    return response;
  }
  return withPrefix(response);
}

// The same evidence, written at the declaration the value comes FROM rather
// than on the binding that holds it.
function build(): Readonly<NextResponse> {
  return load();
}
const response = build();
if (!response) {
  handle(response);
}

// A dictionary the source spells out is still reported, resolved or not:
// `Record<K, V>` is an index signature whichever way `K` and `V` resolve, and a
// shape-preserving wrapper, a union member, an intersection whose every member
// is pinned, and a same-file alias each spell the same index signature.
const payload: Readonly<Record<string, unknown>> | undefined = getPayload();
if (!payload || Object.keys(payload).length === 0) {
  return handle(payload);
}
```

Reading a spelling is not the same as following a reference, so each of those
arms carries its own limit. A wrapper is unwrapped only onto a type that is
itself pinned — `Readonly<Record<string, string>>` is a dictionary,
`Readonly<NextResponse>` is not. `Required<T>` preserves only a type whose keys
come from an index signature, because it turns an optional member into a
required one and a required property makes `Object.keys()` non-empty for every
valid value. An intersection needs EVERY member pinned, since
`Record<string, string> & Session` carries `Session`'s required properties and a
complete program calls it non-object; a union needs only one, mirroring the
resolved case where any object-like member makes the whole union object-like. A
generic alias is left unpinned for the same reason a wrapper is: its body is
written against parameters that shadow any same-file alias of the same name. And
an alias is followed only inside the file that declares it: a reference into a
module the program did not load is the unresolved case above.

The binding's annotation is not the only place a file states that type, and
reading only it left the suffix deciding alone everywhere else. An annotated
function or arrow return, a class method's return, a type assertion — `as T` or
`<T>expr` — and the awaited value of a `Promise<T>` return each state the type of
the value a guard tests just as directly, so `const response = build()` off a
`Readonly<NextResponse>` return declines exactly as the annotated binding does.
`satisfies` is not among them: it checks an expression against a type without
changing the type, so the value keeps whatever the expression already carried.
Each of these is followed only through the file's own scope — a callee imported
from a module the program did not load is the unresolved case above, and a
method is read only off a class this file declares — and a return type or
assertion that IS a dictionary keeps its report.

The annotation has to sit on the binding rather than around it. The one on
`const { config }: Props = load()` describes the container, and deciding a single
property from it needs the resolution that failed, so a destructured binding
stays with the naming heuristic.

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
      "emptyCheckFix": {
        "name": "isEmpty",
        "importPath": "functions/src/util/isEmpty"
      },
      "printWidth": 80
    }
  ]
}
```

- `objectNamePattern` (string[], default includes Config/Data/Info/Settings/Options/Props/State/Response/Result/Payload/Map/Record/Object/Obj/Details/Meta/Profile/Request/Params/Context): additional suffixes to treat as object-like when type info is unavailable.
- `ignoreInLoops` (boolean, default `false`): skip reporting inside loop conditions to avoid extra `Object.keys` calls in hot paths.
- `emptyCheckFunctions` (string[], default `["isEmpty"]`): additional functions (identifier or property names) that already perform emptiness checks; merged with the default so adding custom helpers keeps recognition of `isEmpty`.
- `emptyCheckFix` (object, unset by default): the helper the autofix EMITS, as `{ name, importPath? }`. Unset, the fix writes `Object.keys(x).length === 0`.
- `printWidth` (number, default `80`): the column the autofix wraps the widened condition at.

### `emptyCheckFix`

Type: `{ name: string, importPath?: string }`

Default: unset

The emptiness call the autofix writes. Unset, the fix emits
`Object.keys(x).length === 0`, so a codebase that has not configured this option
sees no change.

Set it when your config BANS the `Object` accessors. A `no-restricted-properties`
rule forbidding `Object.keys` and an autofix hardcoded to emit it have no fixed
point between them: `eslint --fix` rewrites a guard and the same run then reports
the line the fixer just wrote.

`name` must be a plain identifier, because the emitted call has to be one this
rule itself recognizes as a satisfying emptiness check — otherwise `--fix` would
report its own output. The name counts as a check whether or not it also appears
in `emptyCheckFunctions`, which stays a recognition-only allowlist.

Name only — the helper is assumed to be in scope already:

```json
{
  "@blumintinc/blumint/enforce-empty-object-check": [
    "error",
    { "emptyCheckFix": { "name": "isEmpty" } }
  ]
}
```

```ts
// before
if (!afterData) {
  return;
}

// after --fix
if (!afterData || isEmpty(afterData)) {
  return;
}
```

Name and import path — the fix also brings the binding in:

```json
{
  "@blumintinc/blumint/enforce-empty-object-check": [
    "error",
    {
      "emptyCheckFix": {
        "name": "isEmpty",
        "importPath": "functions/src/util/isEmpty"
      }
    }
  ]
}
```

```ts
// before
import { logger } from 'functions/src/util/logger';

export function userPreview(afterData?: Record<string, unknown>) {
  if (!afterData) {
    return;
  }
}

// after --fix
import { logger } from 'functions/src/util/logger';
import { isEmpty } from 'functions/src/util/isEmpty';

export function userPreview(afterData?: Record<string, unknown>) {
  if (!afterData || isEmpty(afterData)) {
    return;
  }
}
```

The insertion is deliberate about where it lands and when it happens at all:

- it is anchored after the LAST `import` declaration;
- with no imports it defers to the plugin's shared import anchor, which keeps a
  `'use client'` directive first (an `import` above it takes the directive out of
  the prologue and strips its meaning), keeps a `#!` shebang on line 1, and
  climbs above a line-binding comment such as `// @ts-expect-error` rather than
  severing it from the line it covers;
- a value import from the same path that already has a `{ … }` list gains the
  helper as another specifier rather than a second declaration of one module. A
  list already broken across lines gains a row, as Prettier prints it;
- a type-only, namespace, default-only or side-effect import of that path gets a
  separate declaration, because none of them can carry a value specifier;
- nothing is inserted when the name is ALREADY bound at the module's top level —
  imported from any path, or declared locally. A second binding of the name would
  not compile, which is worse than the report it was meant to fix. The emitted
  call resolves to whatever the file already has.

`importPath` should name a module inside your own source tree. The recommended
config also runs `enforce-dynamic-imports`, which rejects a static import of
anything outside its internal prefixes (`src/` and `functions/` by default), and
the dynamic form it prescribes cannot help here: the emitted call sits in a
synchronous guard condition, and an `import()` yields a promise no `if` can
await. A path such as `functions/src/util/isEmpty` is therefore accepted as
written, while a bare package name such as `lodash` trades the `Object.keys`
report for an `enforce-dynamic-imports` one. Point the option at your own helper,
or add the package to that rule's `ignoredLibraries`.

The fix is DECLINED — the report stands with no rewrite — when a binding of
`name` sits between the guard and the module scope. A bare call resolves where
the call sits, so an inner `const isEmpty = …` would silently take it over, and
no spelling of the call escapes that. Declaring the helper at module level is
not a shadow and does not decline the fix.

Both emission paths honor the option: the one-line replacement and the widened
re-layout the fixer emits when the guard overflows `printWidth`. The helper's
LENGTH therefore feeds the layout decision — a name shorter than the
`Object.keys` clause can keep a header on one line that the default emission
breaks, and a longer one can break a header the default keeps.

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
