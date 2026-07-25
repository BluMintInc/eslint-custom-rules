# Prevent unnecessary verb suffixes in function and method names (`@blumintinc/blumint/no-unnecessary-verb-suffix`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Discourages verb-preposition suffixes in function and method names when the suffix does not add meaning beyond the parameters. These endings make the action harder to spot and bloat call sites with redundant phrasing.

## Rule Details

This rule keeps names action-oriented by removing trailing verb-preposition suffixes (e.g., `From`, `For`, `With`, `To`, `By`, `In`, `On`). The suffix rarely carries new information because the parameters already express the relationship. Redundant endings make call sites harder to scan, obscure the primary verb, and create noisy diffs when the relationship changes. Rename the function to the verb phrase and let arguments communicate the context.

Examples of **incorrect** code:

```ts
// Redundant suffix repeats the relationship already shown by parameters
function createMatchFor(player) {}      // The target player is obvious from args
function computeValueFrom(data) {}      // The source data is already the param
function updateConfigWith(options) {}   // "With" adds no new meaning
function convertDataTo(format) {}       // The destination format is the param
function validateInputBy(rules) {}      // The rule set is already visible
function searchItemsIn(container) {}    // The scope is the argument
function processEventOn(element) {}     // The element is already the argument

// Method names should surface the primary action, not the preposition
class TournamentService {
  initializeGameFor(player) {}
  calculateScoreFrom(results) {}
  updateStateWith(data) {}
}

// Arrow functions inherit the same readability problem
const transformDataWith = (options) => {};
const prepareStateFor = (component) => {};
const validateBy = (rules) => {};
const searchIn = (scope) => {};
```

Examples of **correct** code:

```ts
// Concise names highlight the action; parameters show the relationship
function createMatch(player) {}
function computeValue(data) {}
function updateConfig(options) {}
function convertData(format) {}
function validateInput(rules) {}
function searchItems(container) {}
function processEvent(element) {}

// Class methods stay consistent with the same pattern
class TournamentService {
  initializeGame(player) {}
  calculateScore(results) {}
  updateState(data) {}
  transformData(format) {}
  filterUsers(criteria) {}
}

// Arrow functions without redundant suffixes
const transformData = (options) => {};
const prepareState = (component) => {};
const validate = (rules) => {};
const search = (scope) => {};

// When the suffix carries essential domain context, allow it explicitly
/* eslint-disable @blumintinc/blumint/no-unnecessary-verb-suffix */
function migrateDataFromLegacy(data) {}        // Source system is material
function mergeConfigWithDefaults(config) {}    // The combination rule matters
function convertTemperatureToCelsius(temp) {}  // Destination scale matters
function sortUsersByRank(users) {}             // Ranking dimension matters
function searchProductsInCategory(category) {} // Category scoping matters
function validateInputAgainstSchema(input) {}  // Validation target matters
function processEventsUntilTimeout(events) {}  // Time boundary matters
function computeScoreViaAlgorithm(data) {}     // Algorithm choice matters
/* eslint-enable @blumintinc/blumint/no-unnecessary-verb-suffix */
```

### Phrasal-verb endings are not redundant suffixes

A trailing `In`/`On` is **only** redundant when the word before it is a noun
object whose value lives in the parameters (`searchItemsIn`, `processEventOn`).
When the particle instead fuses with its verb into a phrasal verb, it is
inseparable and the rule leaves the name alone — no disable needed:

```ts
// Past-participle adjectives describing state — the "In"/"Out" is part of the word
const isLiveUserSignedIn = async () => {};
function isSignedIn() {}
function isLoggedIn() {}
const optedIn = () => {};
function hasZoomedIn() {}
function wasLoggedOut() {}

// Boolean predicates (is/has/was/should/can/will) — trailing word is a state adjective
function isFeatureOn() {}
function hasSessionOn() {}

// Established compound phrasal verbs — the particle carries the action
const useGuardSignIn = () => {};
function handleSignIn() {}
function handleLogOut() {}
function handleCheckIn() {}
```

### Names dictated by a declared contract are exempt

A member name is only the author's to change when the author chose it. When the
surrounding value declares conformance to a type, the member name belongs to
that type — renaming it would break conformance — so the rule stays silent
without needing a disable comment. Three declarations count as such a signal:

1. **A type annotation** on the variable or class field holding the object
   literal.
2. **A `satisfies` clause** on the object literal.
3. **A class heritage clause** (`implements` or `extends`) that accounts for the
   member.

```ts
interface QueryLike {
  orderBy: (field: string, direction: string) => QueryLike;
}

// 1. Annotated variable — the annotation admits only members QueryLike declares
const chain: QueryLike = {
  orderBy: (field, direction) => chain,
};

// Nested and array-wrapped members are covered by the outer annotation
const configs: QueryLike[] = [{ orderBy: (field, direction) => configs[0] }];

// Annotated class fields work the same way
class FakeQueryFactory {
  private readonly chain: QueryLike = {
    orderBy: (field, direction) => this.chain,
  };
}

// 2. satisfies clause
const satisfied = {
  orderBy: (field: string, direction: string) => satisfied,
} satisfies QueryLike;

// 3. Class heritage that declares the member
class FakeQuery implements QueryLike {
  public orderBy(field: string, direction: string) {
    return this as never;
  }
}
```

For annotations and `satisfies`, the signal alone is enough: TypeScript's
excess-property check rejects a literal carrying a member its target type does
not declare, so code that compiles cannot have invented the name. For class
heritage the check is stricter, because a class may declare members beyond its
contract: the member name is resolved against the interface, type alias, or base
class when that declaration lives in the same file. A class member absent from a
resolvable contract keeps firing, while a contract imported from another module
is unreadable to this rule and exempts the member — a deliberate false negative
in preference to a false positive.

The following still fire, because none of them pins the name to a type:

```ts
// No declared target type at all — these names are the author's
const chain = {
  orderBy: (field: string, direction: string) => chain,
};

// `any`/`unknown` disable excess-property checking, so they prove nothing
const helpers: any = { fetchTournamentsBy: (key: string) => key };

// `as` assertions permit members the target type never declares
const asserted = { orderBy: (field: string) => {} } as QueryLike;

// A variable's own name is never dictated by its annotation
const validateBy: Validator = (rules) => {};

// The class member is absent from the contract it implements
interface Limitable {
  limit: (count: number) => void;
}
class FakeQuery implements Limitable {
  limit(count: number) {}
  filterUsersBy(role: string) {} // Not part of Limitable
}
```

To silence the rule on a hand-built test double or adapter, annotate it against
the contract it imitates (`const chain: QueryLike = { … }`) rather than
disabling the rule — the annotation documents the constraint and lets the
compiler enforce it.

Note that the exemption covers an *implementation* conforming to a contract, not
the contract's own declaration: `interface Repository { fetchRecordFrom(source: string): unknown }`
still reports, because that name is chosen where it is declared.

### Auto-fix is reference-safe

The `--fix` autofix renames the declaration **and every in-file reference**
together, so call sites never dangle. To guarantee this, the fix is applied
only when all references are resolvable within the file, and is **withheld
(the violation is still reported, but no automatic rename happens)** in cases
where a rename could not be completed safely:

- **Exported symbols** (`export function fooFrom() {}`, `export const barTo = …`)
  — a single-file fixer cannot reach references in other modules that import
  the symbol, so renaming here would break those consumers.
- **Class methods, object-literal method properties, and interface method
  signatures** — these are invoked through member expressions (`this.fooFrom()`,
  `obj.fooFrom()`) that cannot be resolved to the declaration syntactically, so
  their call sites cannot be found and updated.
- **Renames that would collide with an existing binding.** If the suggested
  name is already bound in the declaration's scope, in the scope chain between
  a call site and that declaration, or inside the function's own body, the
  rename is withheld. Applying it anyway could produce a TDZ self-reference
  (`const line = lineAt(...)` rewritten to `const line = line(...)`, which
  fails to compile) or silently shadow the function's new name from within its
  own body.

In these cases, rename the symbol and its usages manually (for example with an
editor's rename-symbol / refactor command, which uses type information the lint
fixer does not have).

## When Not To Use It

You can disable this rule when the suffix carries domain meaning that parameters alone cannot convey (e.g., security mode, data partition, migration origin). Prefer targeted disables near the affected declarations so the exception stays visible to readers.

## Further Reading

* [Clean Code: A Handbook of Agile Software Craftsmanship](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Chapter 2: Meaningful Names
* [Code Complete](https://www.amazon.com/Code-Complete-Practical-Handbook-Construction/dp/0735619670) - Chapter 11: The Power of Variable Names
