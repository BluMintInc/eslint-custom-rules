# no-unnecessary-verb-suffix

Prevents the use of unnecessary verb suffixes in function and method names unless they provide a necessary layer of description.

## Rule Details

This rule aims to maintain cleaner, more action-oriented function names by eliminating redundant verb suffixes. Common suffixes include 'From', 'For', 'With', 'To', 'By', 'In', 'On', etc. The rule will error by default, requiring explicit disabling when a suffix is truly needed.

Examples of **incorrect** code:

```ts
// Bad: Unnecessary verb suffixes that don't add meaning
function createMatchFor(player) {}     // Just use createMatch
function computeValueFrom(data) {}       // Just use computeValue
function updateConfigWith(options) {} // Just use updateConfig
function convertDataTo(format) {}      // Just use convertData
function validateInputBy(rules) {}      // Just use validateInput
function searchItemsIn(container) {} // Just use searchItems
function processEventOn(element) {}    // Just use processEvent

// Bad: Method implementations with unnecessary suffixes
class TournamentService {
  initializeGameFor(player) {}    // Just use initializeGame
  calculateScoreFrom(results) {} // Just use calculateScore
  updateStateWith(data) {}         // Just use updateState
}

// Bad: Arrow functions with unnecessary suffixes
const transformDataWith = (options) => {};  // Just use transformData
const prepareStateFor = (component) => {};  // Just use prepareState
const validateBy = (rules) => {};  // Just use validate
const searchIn = (scope) => {};  // Just use search
```

Examples of **correct** code:

```ts
// Good: Clear, action-oriented names without suffixes
function createMatch(player) {}
function computeValue(data) {}
function updateConfig(options) {}
function convertData(format) {}
function validateInput(rules) {}
function searchItems(container) {}
function processEvent(element) {}

// Good: Method implementations
class TournamentService {
  initializeGame(player) {}
  calculateScore(results) {}
  updateState(data) {}
  transformData(format) {}
  filterUsers(criteria) {}
}

// Good: Arrow functions
const transformData = (options) => {};
const prepareState = (component) => {};
const validate = (rules) => {};
const search = (scope) => {};

// Good: Cases where the suffix adds necessary context
/* eslint-disable no-unnecessary-verb-suffix */
function migrateDataFromLegacy(data) {}  // System context matters
function mergeConfigWithDefaults(config) {}  // Combination context matters
function convertTemperatureToCelsius(temp) {}  // Conversion target matters
function sortUsersByRank(users) {}  // Sort criteria matters
function searchProductsInCategory(category) {}  // Search scope matters
function validateInputAgainstSchema(input) {}  // Validation context matters
function processEventsUntilTimeout(events) {}  // Time boundary matters
function computeScoreViaAlgorithm(data) {}  // Process context matters
/* eslint-enable no-unnecessary-verb-suffix */
```

## When Not To Use It

If your codebase heavily relies on verb suffixes for clarity or you have a specific naming convention that requires these suffixes, you may want to disable this rule. You can also disable it for specific functions where the suffix adds necessary context using `/* eslint-disable no-unnecessary-verb-suffix */` comments.

## Further Reading

* [Clean Code: A Handbook of Agile Software Craftsmanship](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Chapter 2: Meaningful Names
* [Code Complete](https://www.amazon.com/Code-Complete-Practical-Handbook-Construction/dp/0735619670) - Chapter 11: The Power of Variable Names
