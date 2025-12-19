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

## When Not To Use It

You can disable this rule when the suffix carries domain meaning that parameters alone cannot convey (e.g., security mode, data partition, migration origin). Prefer targeted disables near the affected declarations so the exception stays visible to readers.

## Further Reading

* [Clean Code: A Handbook of Agile Software Craftsmanship](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Chapter 2: Meaningful Names
* [Code Complete](https://www.amazon.com/Code-Complete-Practical-Handbook-Construction/dp/0735619670) - Chapter 11: The Power of Variable Names
