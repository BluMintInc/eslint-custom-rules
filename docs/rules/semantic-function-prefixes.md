# Require semantic function prefixes instead of generic verbs so callers know whether a function fetches data, transforms input, or mutates state (`@blumintinc/blumint/semantic-function-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Generic prefixes such as `get`, `update`, `check`, `manage`, `process`, or `do` do not tell readers whether a function fetches remote data, transforms input, or mutates state. This rule requires more descriptive prefixes so call sites understand the operation and its side effects.

## Why this rule?

- Ambiguous verbs hide intent; `getUser` could fetch from the network, read cache, or compute derived state.
- Naming clarity signals side effects and performance costs, preventing misuse in render paths or memoization.
- Semantic verbs (`fetch`, `retrieve`, `validate`, `transform`, `apply`, etc.) make behaviors self-documenting and easier to review.

## How to fix

- Replace generic prefixes with verbs that reflect the operation, e.g. `get` → `fetch/retrieve/compute/derive`, `update` → `modify/set/apply`, `check` → `validate/assert/ensure`, `manage` → `control/coordinate/schedule`, `process` → `transform/sanitize/compute`.
- Keep boolean checks starting with `is` and Next.js data functions (`getServerSideProps`, `getStaticProps`, `getStaticPaths`) as-is; the rule already exempts them.
- Ensure the first word of PascalCase/camelCase names expresses the function's behavior rather than a placeholder verb.

## Privacy is not a carve-out

The rule reads the declared name of a function or method, whatever its visibility. `public`, `protected`, `private`, a modifier-less method and an ECMA private method (`#updateUser`) are all in scope, and the two private spellings behave identically — `private updateUser() {}` and `#updateUser() {}` both report. This matters because the spellings are mutually exclusive: `private #updateUser` is a TypeScript error (TS18010), so an author who writes `#` could not opt into the check by adding a modifier.

Prefix matching reads the bare word, so the `is` prefix, the Next.js names and the compound lexemes below exempt a `#` member exactly as they exempt any other. The report names the member as written (`#updateUser`), which keeps it distinct from a sibling public `updateUser`.

Keys the rule does not read are out of scope: a computed method (`[expr]() {}`) has no statically knowable name, and a quoted key (`'updateUser'() {}`) is likewise not checked.

## A function-valued class property is a member

A class member written as a field initializer is in scope on the same terms as a method. `getUser = () => {}` declares the same named, callable member as `getUser() {}` — the spellings differ in binding and `this` semantics, neither of which this rule judges — so a single `=` does not decide whether the name is read. Every modifier spelling participates: `public`, `protected`, `private`, `static`, `readonly`, `override`, a modifier-less field and an ECMA private field (`#updateUser = () => {}`).

What the field spelling does _not_ extend to:

- **Data fields.** The rule reads a field only when its initializer is a function (an arrow, a function expression, or a generator). `updateCount = 0`, `getters = {}` and `getData = makeGetter()` name a value rather than an operation, so they are not checked.
- **Fields with no initializer.** `declare getData: () => void`, `getData!: () => void` and `getData?: () => void` declare no implementation to name.
- **Unreadable keys.** `[expr] = () => {}` and `'getData' = () => {}` are skipped exactly as their method counterparts are.
- **Auto-accessors.** `accessor getData = () => {}` desugars to a getter/setter pair, the member kind the rule already skips.
- **Object-literal properties.** `{ getData: () => {} }` is not a class member; such keys routinely mirror an external contract the author cannot rename, so they stay out of scope.

A named function expression is reported under its own binding: `getUser = function fetchInner() {}` names `fetchInner`, the same precedence the rule applies to `const getUser = function fetchInner() {}`. Exactly one report lands per member either way.

## Compound lexemes

A generic prefix is only generic when it is a standalone verb applied to an object. When the banned word is the head of a lexicalized verb-particle compound, it names the operation exactly: `checkIn` is the phrasal verb *to check in*, not the verb `check` applied to `In`. Renaming it to `validateIn` would be strictly less meaningful, so the rule exempts these.

The exempt compounds are `check in` and `check out`. The rule matches them against the first **two** camelCase segments, so derived names inherit the exemption:

| Name | First two segments | Reported |
| --- | --- | --- |
| `checkIn`, `checkOut` | `check in` / `check out` | no |
| `checkInAndSet`, `checkOutTeam` | `check in` / `check out` | no |
| `checkInput`, `checkOutdatedEntries` | `check input` / `check outdated` | **yes** |
| `checkUserPermissions` | `check user` | **yes** |

Matching is on whole camelCase segments and is case-insensitive, so `CheckInAndSet` is exempt while `CheckInputSchema` is still reported — a name that merely *begins with* the letters of a particle is not a compound.

A grammatical verb-particle sequence is not enough on its own; the pair must be lexicalized (its meaning is not the sum of its parts). `getOutOfSyncItems`, `updateInPlace`, and `processOutQueue` are compositional, so the generic verb still hides what the function does and they remain reported.

## Examples

### ✅ Correct

```ts
function fetchUserProfile() {}
const retrieveSettings = () => {}
class FormService {
  validateInput() {}
  transformPayload() {}
  #modifyPayload() {}
  #isReady() {}
  public sanitizePayload = async () => {};
  updateCount = 0;
  getters = {};
}
```

### ❌ Incorrect

```ts
function getUserProfile() {}
const updateSettings = () => {}
function checkUserPermissions() {}
class FormService {
  processPayload() {}
}
class Account {
  // ❌ an ECMA private method is the same privacy as `private updateUser()`
  #updateUser() {}
}
class UserService {
  // ❌ a field initializer is the same member as `getUserData() {}`
  getUserData = () => {};
  public processPayload = async () => {};
  #updateSecret = function () {};
}
```

### ✅ Exempt patterns

```ts
export async function getServerSideProps() {
  return { props: {} };
}

function isUserLoggedIn() {}

class Page {
  static getStaticProps() {
    return { props: {} };
  }
}

class TeamMutator {
  public async checkInAndSet(memberId: string, isEntireTeam: boolean) {
    return this.checkIn(memberId, isEntireTeam);
  }
  public checkIn(memberId: string, entireTeam: boolean) {
    return { memberId, entireTeam };
  }
  public checkOut(memberId: string) {
    return memberId;
  }
  #checkInMember(memberId: string) {
    return memberId;
  }
}
```

No options are available for this rule.
