import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryVerbSuffix } from '../rules/no-unnecessary-verb-suffix';

ruleTesterTs.run('no-unnecessary-verb-suffix', noUnnecessaryVerbSuffix, {
  valid: [
    // Regular function declarations
    'function createMatch(player) {}',
    'function computeValue(data) {}',
    'function updateConfig(options) {}',
    'function convertData(format) {}',
    'function validateInput(rules) {}',
    'function searchItems(container) {}',
    'function processEvent(element) {}',

    // Single-word functions (no verb+suffix pattern)
    'function fetch() {}',
    'function get() {}',
    'function set() {}',
    'function update() {}',
    'function remove() {}',
    'function erase() {}',

    // Functions with non-verb suffixes
    'function dataProcessor() {}',
    'function eventHandler() {}',
    'function configManager() {}',
    'function userController() {}',

    // Functions with suffixes that are part of the name, not prepositions
    'function fetchUserInfo() {}',
    'function processDataPoints() {}',
    'function calculateTotalAmount() {}',
    'function validateUserInput() {}',

    // Class methods
    `class TournamentService {
      initializeGame(player) {}
      calculateScore(results) {}
      updateState(data) {}
      transformData(format) {}
      filterUsers(criteria) {}
    }`,

    // Class methods with non-verb suffixes
    `class DataService {
      dataProcessor() {}
      eventHandler() {}
      configManager() {}
    }`,

    // Interface methods - simple valid test
    `interface UserService {
      getUser(id: string): User;
      createUser(data: UserData): User;
      updateUser(id: string, data: UserData): User;
      deleteUser(id: string): void;
    }`,

    // Arrow functions
    'const transformData = (options) => {};',
    'const prepareState = (component) => {};',
    'const validate = (rules) => {};',
    'const search = (scope) => {};',

    // Arrow functions with non-verb suffixes
    'const dataHandler = () => {};',
    'const eventProcessor = () => {};',
    'const configManager = () => {};',

    // Object methods
    `const api = {
      getUser(id) {},
      createUser(data) {},
      updateUser(id, data) {},
      deleteUser(id) {}
    };`,

    // Function expressions - only simple cases
    'const fn = function process() {};',
    'const handler = function handle() {};',

    // Functions with legitimate compound names
    'function buildUserInterface() {}',
    'function createDataStructure() {}',
    'function validateFormInput() {}',

    // Cases where suffix adds necessary context (with eslint-disable)
    '/* eslint-disable no-unnecessary-verb-suffix */ function migrateDataFromLegacy(data) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function mergeConfigWithDefaults(config) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function convertTemperatureToCelsius(temp) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function sortUsersByRank(users) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function searchProductsInCategory(category) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function validateInputAgainstSchema(input) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function processEventsUntilTimeout(events) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function computeScoreViaAlgorithm(data) {} /* eslint-enable no-unnecessary-verb-suffix */',

    // More legitimate cases with meaningful context
    '/* eslint-disable no-unnecessary-verb-suffix */ function fetchDataFromApi() {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function saveDataToDatabase() {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function filterUsersByRole() {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function processEventsInBatch() {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function executeTasksInParallel() {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function transformDataWithPipeline() {} /* eslint-enable no-unnecessary-verb-suffix */',

    // Edge cases with non-standard naming
    'function _privateProcess() {}',
    'function $specialHandler() {}',
    'const _privateTransform = () => {};',
    'const $specialProcess = () => {};',

    // Functions with numeric components
    'function process123() {}',
    'function handle456() {}',
    'const transform789 = () => {};',

    // Phrasal-verb past-participle adjectives (the trailing particle fuses with
    // a preceding "-ed" participle into a single state adjective; stripping it
    // destroys the meaning). Regression: issue #1227.
    'const isLiveUserSignedIn = async () => {};',
    'function isSignedIn() {}',
    'function isLoggedIn() {}',
    'const signedIn = () => {};',
    'const loggedIn = () => {};',
    'const optedIn = () => {};',
    'const zoomedIn = () => {};',
    'function isOptedIn() {}',
    'function hasZoomedIn() {}',
    'function wasLoggedOut() {}',
    'function isLoggedOut() {}',
    'const signedOut = () => {};',

    // Base-form compound phrasal verbs (the particle is inseparable from a
    // known phrasal-verb stem). Regression: issue #1227.
    'const useGuardSignIn = () => {};',
    'const useGuardSignInGame = () => {};',
    'function handleSignIn() {}',
    'function handleLogIn() {}',
    'function handleLogOut() {}',
    'function handleOptIn() {}',
    'function handleCheckIn() {}',
    'function handleZoomIn() {}',
    `class AuthService {
      handleSignIn() {}
      handleLogOut() {}
    }`,

    // Async/Sync suffixes encode execution model (async vs sync variant), not a
    // parameter relationship — stripping them produces name collisions with sync
    // siblings and destroys the paired-variant convention. Regression: issue #1252.

    // Paired sync sibling: auto-fix would collide with the sibling name.
    'function executeCommand(command) {}\nfunction executeCommandAsync(command) {}',

    // Standalone async function declarations
    'function fetchDataAsync(url) {}',
    'function loadConfigAsync(path) {}',
    'function executeAsync(task) {}',
    'function processAsync(data) {}',

    // Standalone sync function declarations
    'function loadConfigSync(path) {}',
    'function processSync(data) {}',
    'function readFileSync(path) {}',

    // Arrow function consts
    'const runTaskAsync = (task) => task;',
    'const fetchResultsAsync = (query) => query;',
    'const computeSync = (val) => val;',

    // Object methods
    'const obj = { saveRecordAsync(record) { return record; } };',
    'const obj = { loadDataSync(path) { return path; } };',

    // Class instance methods
    `class Runner {
      executeAsync(command) {}
      runSync(command) {}
    }`,

    // Class static methods
    `class FileUtils {
      static readAsync(path) {}
      static writeSync(path, data) {}
    }`,

    // Multi-word names with Async/Sync suffix
    'function initializeGameAsync(options) {}',
    'function calculateScoreSync(results) {}',
    `class DataService {
      fetchUserProfileAsync(id) {}
      updateCacheSync(key, value) {}
    }`,
  ],
  invalid: [
    // Controls (#1227): a NOUN object before the particle is a genuine
    // redundant verb-preposition suffix — the phrasal-verb exemption must NOT
    // swallow these. The pre-particle word ("widget", "embed", "items",
    // "admin") is not a known phrasal-verb stem, so they still fire.
    {
      code: 'function isWidgetIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { name: 'isWidgetIn', suffix: 'In', suggestion: 'isWidget' },
        },
      ],
      output: 'function isWidget(container) {}',
    },
    {
      code: 'function loadEmbedIn(target) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { name: 'loadEmbedIn', suffix: 'In', suggestion: 'loadEmbed' },
        },
      ],
      output: 'function loadEmbed(target) {}',
    },
    {
      code: 'function canRenderItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'canRenderItemsIn',
            suffix: 'In',
            suggestion: 'canRenderItems',
          },
        },
      ],
      output: 'function canRenderItems(container) {}',
    },
    {
      code: 'function isUserAdminOn(platform) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'isUserAdminOn',
            suffix: 'On',
            suggestion: 'isUserAdmin',
          },
        },
      ],
      output: 'function isUserAdmin(platform) {}',
    },
    // Function declarations with basic prepositions
    {
      code: 'function createMatchFor(player) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'createMatchFor',
            suffix: 'For',
            suggestion: 'createMatch',
          },
        },
      ],
      output: 'function createMatch(player) {}',
    },
    {
      code: 'function computeValueFrom(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'computeValueFrom',
            suffix: 'From',
            suggestion: 'computeValue',
          },
        },
      ],
      output: 'function computeValue(data) {}',
    },
    {
      code: 'function updateConfigWith(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateConfigWith',
            suffix: 'With',
            suggestion: 'updateConfig',
          },
        },
      ],
      output: 'function updateConfig(options) {}',
    },
    {
      code: 'function convertDataTo(format) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'convertDataTo',
            suffix: 'To',
            suggestion: 'convertData',
          },
        },
      ],
      output: 'function convertData(format) {}',
    },
    {
      code: 'function validateInputBy(rules) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'validateInputBy',
            suffix: 'By',
            suggestion: 'validateInput',
          },
        },
      ],
      output: 'function validateInput(rules) {}',
    },
    {
      code: 'function searchItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'searchItemsIn',
            suffix: 'In',
            suggestion: 'searchItems',
          },
        },
      ],
      output: 'function searchItems(container) {}',
    },
    {
      code: 'function processEventOn(element) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processEventOn',
            suffix: 'On',
            suggestion: 'processEvent',
          },
        },
      ],
      output: 'function processEvent(element) {}',
    },

    // Function declarations with temporal prepositions
    {
      code: 'function processDuring(interval) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processDuring',
            suffix: 'During',
            suggestion: 'process',
          },
        },
      ],
      output: 'function process(interval) {}',
    },

    // Function declarations with logical/causal prepositions
    {
      code: 'function executeVia(method) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'executeVia',
            suffix: 'Via',
            suggestion: 'execute',
          },
        },
      ],
      output: 'function execute(method) {}',
    },
    {
      code: 'function processWithout(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processWithout',
            suffix: 'Without',
            suggestion: 'process',
          },
        },
      ],
      output: 'function process(options) {}',
    },

    // Function declarations with phrasal prepositions
    {
      code: 'function fightAgainst(enemy) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'fightAgainst',
            suffix: 'Against',
            suggestion: 'fight',
          },
        },
      ],
      output: 'function fight(enemy) {}',
    },

    // Function declarations with adverbs
    {
      code: 'function retryAgain(attempt) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'retryAgain',
            suffix: 'Again',
            suggestion: 'retry',
          },
        },
      ],
      output: 'function retry(attempt) {}',
    },
    {
      code: 'function attemptAgain(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'attemptAgain',
            suffix: 'Again',
            suggestion: 'attempt',
          },
        },
      ],
      output: 'function attempt(data) {}',
    },
    {
      code: 'function startNow(task) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'startNow',
            suffix: 'Now',
            suggestion: 'start',
          },
        },
      ],
      output: 'function start(task) {}',
    },

    // Class methods
    {
      code: `class TournamentService {
        initializeGameFor(player) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'initializeGameFor',
            suffix: 'For',
            suggestion: 'initializeGame',
          },
        },
      ],
      output: `class TournamentService {
        initializeGame(player) {}
      }`,
    },
    {
      code: `class TournamentService {
        calculateScoreFrom(results) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'calculateScoreFrom',
            suffix: 'From',
            suggestion: 'calculateScore',
          },
        },
      ],
      output: `class TournamentService {
        calculateScore(results) {}
      }`,
    },
    {
      code: `class DataService {
        updateStateWith(data) {}
        transformDataTo(format) {}
        filterUsersBy(criteria) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateStateWith',
            suffix: 'With',
            suggestion: 'updateState',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'transformDataTo',
            suffix: 'To',
            suggestion: 'transformData',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'filterUsersBy',
            suffix: 'By',
            suggestion: 'filterUsers',
          },
        },
      ],
      output: `class DataService {
        updateState(data) {}
        transformData(format) {}
        filterUsers(criteria) {}
      }`,
    },

    // Arrow functions
    {
      code: 'const transformDataWith = (options) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'transformDataWith',
            suffix: 'With',
            suggestion: 'transformData',
          },
        },
      ],
      output: 'const transformData = (options) => {};',
    },
    {
      code: 'const prepareStateFor = (component) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'prepareStateFor',
            suffix: 'For',
            suggestion: 'prepareState',
          },
        },
      ],
      output: 'const prepareState = (component) => {};',
    },
    {
      code: 'const validateBy = (rules) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'validateBy',
            suffix: 'By',
            suggestion: 'validate',
          },
        },
      ],
      output: 'const validate = (rules) => {};',
    },
    {
      code: 'const searchIn = (scope) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'searchIn',
            suffix: 'In',
            suggestion: 'search',
          },
        },
      ],
      output: 'const search = (scope) => {};',
    },

    // Object methods
    {
      code: `const api = {
        getUserFrom(source) {},
        createUserWith(data) {},
        updateUserTo(id, data) {},
        deleteUserBy(id) {}
      };`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'getUserFrom',
            suffix: 'From',
            suggestion: 'getUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'createUserWith',
            suffix: 'With',
            suggestion: 'createUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateUserTo',
            suffix: 'To',
            suggestion: 'updateUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'deleteUserBy',
            suffix: 'By',
            suggestion: 'deleteUser',
          },
        },
      ],
      output: `const api = {
        getUser(source) {},
        createUser(data) {},
        updateUser(id, data) {},
        deleteUser(id) {}
      };`,
    },

    // Edge cases with non-standard naming
    {
      code: 'function _privateProcessWith() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: '_privateProcessWith',
            suffix: 'With',
            suggestion: '_privateProcess',
          },
        },
      ],
      output: 'function _privateProcess() {}',
    },
    {
      code: 'function $specialHandleFor() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: '$specialHandleFor',
            suffix: 'For',
            suggestion: '$specialHandle',
          },
        },
      ],
      output: 'function $specialHandle() {}',
    },

    // Controls for the phrasal-verb exemption (issue #1227): genuine
    // verb-preposition suffixes whose token before the particle is a NOUN
    // object (not a participle or phrasal stem) MUST still be flagged.
    {
      code: 'function loadFeedIn(scope) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'loadFeedIn',
            suffix: 'In',
            suggestion: 'loadFeed',
          },
        },
      ],
      output: 'function loadFeed(scope) {}',
    },
    {
      code: 'function renderItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'renderItemsIn',
            suffix: 'In',
            suggestion: 'renderItems',
          },
        },
      ],
      output: 'function renderItems(container) {}',
    },
    // Non-predicate prefix with a noun-before-particle: the boolean-predicate
    // exemption must NOT trigger, so this still fires.
    {
      code: 'function fetchModalOn(element) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'fetchModalOn',
            suffix: 'On',
            suggestion: 'fetchModal',
          },
        },
      ],
      output: 'function fetchModal(element) {}',
    },
    // Past-participle exemption must remain particle-scoped: a participle before
    // a NON-particle preposition ("From") is still a redundant suffix.
    {
      code: 'function loadCachedFrom(source) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'loadCachedFrom',
            suffix: 'From',
            suggestion: 'loadCached',
          },
        },
      ],
      output: 'function loadCached(source) {}',
    },
    // "is"-prefixed name whose suffix is NOT a phrasal particle: the
    // boolean-predicate exemption is particle-scoped, so "From" still fires.
    {
      code: 'function isolateDataFrom(source) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'isolateDataFrom',
            suffix: 'From',
            suggestion: 'isolateData',
          },
        },
      ],
      output: 'function isolateData(source) {}',
    },

    // Multiple unnecessary suffixes
    {
      code: 'function extractConfigFromWithToViaBy() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'extractConfigFromWithToViaBy',
            suffix: 'By',
            suggestion: 'extractConfigFromWithToVia',
          },
        },
      ],
      output: 'function extractConfigFromWithToVia() {}',
    },
  ],
});
