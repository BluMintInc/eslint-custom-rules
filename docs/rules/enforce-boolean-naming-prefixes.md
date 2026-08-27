# Enforce consistent naming conventions for boolean values by requiring approved prefixes (`@blumintinc/blumint/enforce-boolean-naming-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

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
- Your class properties with boolean types or values, including `abstract` properties (`abstract enabled: boolean`) and constructor parameter properties (`constructor(private enabled: boolean) {}`). Both declare a field you own, so they carry the same naming obligation as a concrete property; a parameter property is reported once, as a property rather than as a parameter.
- Your class fields holding a function with a declared `boolean` return — `accountLocked = (): boolean => { ... }` and `accountLocked = function (): boolean { ... }`. That field is a method in every respect its name is judged on, so `accountLocked(): boolean {}` and `accountLocked = (): boolean => {}` get the same report. Booleanness is read from the declared return annotation, exactly as for a method: an un-annotated `accountLocked = () => this.failedAttempts > 3` is left alone in both spellings. Computed keys (`[key] = (): boolean => ...`) and ambient `declare` fields are skipped, since neither declares a name this site can rename.
- Both spellings of privacy: a `private` modifier and an [ECMA private name](#ecma-private-members-name) (`#enabled`) declare the same member, so `#enabled = false` is checked exactly like `private enabled = false`.
- Boolean property signatures in interfaces and type aliases **only when you opt in** via [`enforceForPropertySignatures`](#enforceforpropertysignatures). They are skipped by default because their names are frequently dictated by contracts you cannot rename (external API shapes, third-party interfaces, persisted data-model schemas such as Firestore fields).
- The rule excludes type predicates and identifiers starting with `_`, which are treated as internal state.

> **Note:** Object literal property names are intentionally **not** checked. Their names are dictated by the type the object satisfies, which may be an external contract.

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
const visible = Boolean(anchorEl);

function toggleFeature(enabled: boolean) { /* ... */ }
const submitForm = (valid: boolean) => { /* ... */ };

class UserAccount {
  private verified = false;
  static premium = false;

  accountLocked(): boolean {
    return this.failedAttempts > 3;
  }

  // A field holding a boolean-returning function is the same member, one token
  // different, and is reported the same way
  sessionActive = (): boolean => {
    return this.expiresAt > Date.now();
  };
}

// Abstract properties every implementer inherits the name from
abstract class BaseFeature {
  abstract enabled: boolean;
  abstract readonly visible: boolean;
}

// Constructor parameter properties declare class fields
class FeatureToggle {
  constructor(private enabled: boolean, public readonly visible: boolean) {}
}

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
const isVisible = Boolean(anchorEl);
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
const isStale: boolean = cacheAge > MAX_CACHE_AGE;
const isOutdated: boolean = schemaVersion !== LATEST_SCHEMA_VERSION;
const needsRefresh = isStale || isOutdated;

function toggleFeature(isEnabled: boolean) { /* ... */ }
function processUser(hasAccess: boolean, canModify: boolean) { /* ... */ }
const submitForm = (isValid: boolean) => { /* ... */ };

class UserAccount {
  private isVerified = false;
  static isPremium = false;

  isAccountLocked(): boolean {
    return this.failedAttempts > 3;
  }

  isSessionActive = (): boolean => {
    return this.expiresAt > Date.now();
  };

  // Left alone in both spellings: nothing declares a boolean return here
  sessionState = () => this.expiresAt;
}

abstract class BaseFeature {
  abstract isEnabled: boolean;
  abstract readonly hasVisibility: boolean;
}

class FeatureToggle {
  constructor(private isEnabled: boolean, public readonly canEdit: boolean) {}
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

#### `Boolean(...)` coercion

A direct call to the global `Boolean` produces a boolean, so the name it is
assigned to needs an approved prefix — `!!x` and `Boolean(x)` are the same
operation written two ways and the rule treats them alike.

Two lookalikes stay silent. `new Boolean(x)` is a `NewExpression` that builds a
Boolean **wrapper object**, not a primitive (and is always truthy), so it is not
a boolean value. And the callee is resolved through the scope chain rather than
matched by name, so a local, parameter or imported binding called `Boolean` is a
different function entirely:

```ts
const Boolean = () => 1;
const count = Boolean();
```

#### Calls to boolean-prefixed functions

When you initialize a variable from a call, the rule infers booleanness from the callee's name (`isX()`, `hasX()`, `canX()`, `shouldX()`). That inference is only a heuristic, so the callee's declaration overrides it whenever the declaration is reachable through the scope chain: if the callee demonstrably returns something other than a boolean, the variable is left alone. Predicate-sounding functions that hand back a verdict object are idiomatic, and demanding `isDropDecision` for a `{ isValid, reason }` value would be actively wrong.

```ts
// Not flagged — canDropOnMatchCell resolves to a function returning a verdict object.
const canDropOnMatchCell = (id: string) => ({ isValid: id.length > 0, reason: 'occupied' });
const dropDecision = canDropOnMatchCell(id);

// Not flagged — the declared return type is a named type, not boolean.
type Verdict = { isValid: boolean };
function canProceed(id: string): Verdict { return { isValid: !!id }; }
const verdict = canProceed(id);

// Still flagged — the callee genuinely returns a boolean.
const canReallyDrop = (id: string) => id.length > 0;
const reallyDrop = canReallyDrop(id); // → rename to isReallyDrop / canReallyDrop
```

The declaration is consulted only to *suppress* a report, never to create one, and only when it resolves locally:

- Callees you import from another module, receive as parameters, or never declare in the file stay under the name heuristic, so cross-module predicates such as `const completed = isTaskFinished();` remain flagged.
- Return shapes that are not conclusively boolean also suppress the report, because the rule prefers false negatives over false positives. This covers unions such as `boolean | Verdict`, bodies whose branches mix booleans and objects, named return types (a `type Flag = boolean` alias reads as non-boolean), and `async`/generator callees, whose calls yield a promise or an iterator rather than the boolean produced inside the body.
- Boolean contracts still count as boolean: an explicit `: boolean` return type, a type predicate (`value is string`), comparisons, negations, and ternaries between boolean literals.
- A return type annotation is not required for the suppression — the body carries it on its own, so removing the annotation (as `no-explicit-return-type` does) changes nothing. A callee that returns a binding this rule already governs is read as non-boolean, because under the rule's own regime a boolean variable and a boolean-returning function both carry an approved prefix:

```ts
// Not flagged — `id` carries no boolean prefix, so the return is not a boolean.
function shouldLabel(id: string) { return id; }
const label = shouldLabel('a');

// Not flagged — `compute` carries no boolean prefix, so its result is not a boolean.
function shouldThing(x: string) { return compute(x); }
const thing = shouldThing('a');

// Still flagged — the body demonstrably returns a boolean.
function shouldRun(x: number) { return x > 0; }
const run = shouldRun(1); // → rename to shouldRun / isRunning
```

  Property reads are the exception: property names are only enforced under [`enforceForPropertySignatures`](#enforceforpropertysignatures), so an unprefixed property may legitimately hold a boolean and the callee's name keeps its say (`function canRead(source: { flag: unknown }) { return source.flag; }` leaves `const readOutcome = canRead(input);` flagged).

#### Use sites that contradict the callee's name

When the callee's declaration is out of reach — an import, a parameter, a value
read off a builder chain — its `is`/`has`/`can` prefix is the only evidence left,
and a use site that treats the value as something other than a boolean outranks
it. The report is declined for the binding whose use contradicts it.

This is what keeps the rule satisfiable alongside
[`enforce-is-prefix-validators`](./enforce-is-prefix-validators.md). A
`ValidatorPipeline` validator returns `true | string` — `true` for a pass, the
failure message for a fail — while `enforce-is-prefix-validators` requires that
validator to be `is`-prefixed. Inferring the result's booleanness from that
mandated prefix leaves the consumer with no spelling satisfying both rules:
renaming the result asserts a boolean contract the value does not have, and the
next line disproves it.

```ts
// Not flagged — the use site reads the verdict as a string.
const isCoordinationCode = ValidatorPipeline.start(isNotEmpty)
  .add(isTrimmed).combinedValidator;

export const assertCoordinationCode = (value: string) => {
  const verdict = isCoordinationCode(value);
  if (typeof verdict === 'string') {
    throw new Error(verdict);
  }
};
```

The contradictions read, in either operand order:

- `typeof binding === 'string'`, and any other tag under any equality operator. A tag of `'boolean'` affirms booleanness instead, including `typeof binding !== 'boolean'`, which is how a boolean guard is spelled.
- the binding compared with a string literal (`binding === 'too short'`).
- the binding passed as the message of an `Error` — `throw new Error(binding)`, or any `…Error` class.

Three limits keep this from swallowing true positives:

- References come from the scope manager, never from matching the name as text, so a contradiction must belong to *this* binding. A shadowing inner binding, a sibling scope's binding of the same name, and an unrelated similarly-named value each keep their own verdict. A contradiction in a nested block or in an arrow declared in the same scope does reach the binding, because those references resolve to it.
- Only a booleanness read off a **name** can be outranked — an unresolvable boolean-prefixed callee, or a boolean-sounding property. Evidence about the value itself always wins: an explicit `: boolean` annotation, a boolean literal, a comparison or negation, a `Boolean()` coercion, and a callee whose reachable declaration classifies as boolean all stay flagged even where a use site contradicts them (that code is a type error, not a naming question).
- The contradiction must be at a use site. A validator's *shape* alone changes nothing, so `const completed = isTaskFinished();` with nothing contradicting it anywhere stays flagged.

#### Optional chaining in an initializer

An optional link (`user?.isLoggedIn`, `canDelete?.('x')`) is read through, so a
chained initializer is judged exactly like its plain spelling.

```ts
// Flagged — same as `user.isLoggedIn`.
declare const user: { isLoggedIn: boolean } | undefined;
const loggedIn = user?.isLoggedIn;

// Flagged — same as `canDelete('x')`.
declare const canDelete: ((id: string) => boolean) | undefined;
const deletable = canDelete?.('x');

// Not flagged — neither the property nor the callee suggests a boolean.
declare const account: { name: string } | undefined;
const name = account?.name;
```

The chain makes the value `boolean | undefined` rather than `boolean`, and the
prefix is still required: this rule already demands one of `enabled?: boolean`
on a parameter, class property or method, and of `const loggedIn = user && user.isLoggedIn`,
whose type is the same. A value that may be absent is where an unprefixed name
misleads most, since a falsy result no longer distinguishes "false" from
"receiver was missing". The remedy is a rename of the binding, which never
changes how the initializer short-circuits.

#### ECMA private members (`#name`)

An ECMA private member is checked exactly like one declared with the TypeScript `private` modifier. The two are the same privacy written two ways, and they are mutually exclusive — `private #verified` is a TypeScript error (TS18010, "An accessibility modifier cannot be used with a private identifier") — so the `#` spelling is an alternative, never an opt-out. It is also the most rename-safe name in the language: no structural type, serialized payload, or external caller can observe it, so the remedy is always available to you.

```ts
class UserAccount {
  #verified = false; // Flagged — rename to #isVerified
  static #premium = false; // Flagged — rename to #isPremium
  readonly #locked!: boolean; // Flagged — rename to #isLocked
  #_verified = false; // Not flagged — underscore-prefixed internal state
  #status = 'active'; // Not flagged — not a boolean

  // Flagged — rename to #isExpired
  #expired(): boolean {
    return this.#status === 'expired';
  }

  // Flagged — rename to #isActive
  get #active() {
    return this.#status === 'active';
  }
}
```

The `#` sigil marks privacy rather than forming part of the name, so the remedy prepends the prefix to the word itself: `#verified` becomes `#isVerified`. Reports quote the member as written, which keeps a report on `#verified` distinct from one on a sibling public `verified` — those are separate members. A read of a `#` member counts as any other member read does, so `get #active() { return this.#isVerified; }` is judged exactly as `get active() { return this.isVerified; }` is.

Because the underscore exemption below is keyed on the name, it survives the `#` spelling too: `#_verified`'s name is `_verified`, so it stays exempt.

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

#### UPPER_SNAKE_CASE names

An approved prefix is recognized in `UPPER_SNAKE_CASE` names too, where the prefix must occupy the whole first segment — capitalization can no longer mark the word boundary, so `ISVALID` reads as one word and stays flagged while `IS_VALID` does not. Digits fused onto that first segment belong to it, so `ARE2_VALID` is accepted exactly as its camelCase spelling `are2Valid` is. This matters because [`global-const-style`](./global-const-style.md) renames module-scope constants to `UPPER_SNAKE_CASE`, and a correctly prefixed constant must not become a violation just by being renamed.

```ts
const IS_ENABLED: boolean = true;   // Not flagged — first segment is the prefix
const ARE2_VALID: boolean = true;   // Not flagged — trailing digits stay in the prefix segment
const HAS3_ITEMS: boolean = true;   // Not flagged
const ENABLED: boolean = true;      // Flagged — no prefix
const VALID_FLAG: boolean = true;   // Flagged — no prefix
const ARENA2_MAP: boolean = true;   // Flagged — the segment is ARENA2, not the prefix ARE
```

#### Property signatures in interfaces and type aliases

Boolean property signatures in interfaces and type aliases are **not** checked by default. Property names in type definitions are commonly imposed by contracts you cannot rename — external API request/response shapes, third-party library interfaces, and persisted data-model schemas (for example, Firestore document fields). Enforcing prefixes there produces unavoidable false positives, so it is opt-in:

```ts
// Not flagged by default — the name mirrors an external API/data-model contract.
interface CoinflowWithdrawRequest {
  waitForConfirmation: boolean;
}

interface Tournament {
  registrationOpen: boolean; // Firestore field name
  optional: boolean;         // Firestore field name
}
```

Set [`enforceForPropertySignatures`](#enforceforpropertysignatures) to `true` for codebases that fully control their type definitions and want prefixes enforced on them.

#### Abstract properties and constructor parameter properties

Unlike interface property signatures, `abstract` class properties and constructor parameter properties are declarations you write and can rename, so they are checked **by default** exactly like concrete class properties — [`enforceForPropertySignatures`](#enforceforpropertysignatures) does not gate them.

```ts
abstract class BaseFeature {
  abstract enabled: boolean;          // Flagged — rename to isEnabled
  abstract readonly visible: boolean; // Flagged — rename to isVisible
  abstract count: number;             // Not flagged — not a boolean
  protected abstract _ready: boolean; // Not flagged — underscore-prefixed internal state
}

class FeatureToggle {
  // Flagged as a property (not a parameter), once per declaration
  constructor(
    private enabled: boolean,
    public readonly visible: boolean = true,
  ) {}
}
```

An access modifier on a constructor parameter turns it into a class field, so it is reported with `property` wording rather than `parameter` wording, and reported exactly once. Plain constructor parameters without a modifier stay parameters and are reported as such.

## Options

This rule accepts an options object with the following properties:

```ts
{
  "prefixes": string[],
  "ignoreOverriddenGetters": boolean,
  "enforceForPropertySignatures": boolean
}
```

### `prefixes`

An array of strings that are valid prefixes for boolean names. If not provided, the default list of prefixes will be used.

### Example configuration

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-boolean-naming-prefixes": ["error", {
      "prefixes": ["is", "has", "can", "should"]
    }]
  }
}
```

With this configuration, only the prefixes "is", "has", "can", and "should" will be allowed for boolean names.

### `ignoreOverriddenGetters`

When `true`, getters marked `override` or declared as abstract are ignored. Use this when renaming getters would break inheritance contracts or interface compliance. Defaults to `false` so boolean prefixes are enforced on getters unless explicitly opted out.

### `enforceForPropertySignatures`

When `true`, boolean property signatures in interfaces and type aliases are required to use an approved prefix. Defaults to `false` because property names in type definitions are frequently dictated by external API contracts or persisted data-model schemas that cannot be renamed. Enable it only for codebases that fully control their type definitions.

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-boolean-naming-prefixes": ["error", {
      "enforceForPropertySignatures": true
    }]
  }
}
```

## When Not To Use It

You might want to disable this rule if:

1. Your project already has an established naming convention for booleans that doesn't align with this rule
1. You prefer a different approach to boolean naming, such as suffixes instead of prefixes
1. You don't want to enforce strict naming conventions for boolean values

## Further Reading

- [Clean Code by Robert C. Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Contains recommendations on naming conventions
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines) - Microsoft's recommendations for TypeScript code style
