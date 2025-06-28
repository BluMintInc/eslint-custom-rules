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
  ],
  invalid: [
    // Function declarations with basic prepositions
    {
      code: 'function createMatchFor(player) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'For', suggestion: 'createMatch' },
        },
      ],
      output: 'function createMatch(player) {}',
    },
    {
      code: 'function computeValueFrom(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'From', suggestion: 'computeValue' },
        },
      ],
      output: 'function computeValue(data) {}',
    },
    {
      code: 'function updateConfigWith(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'With', suggestion: 'updateConfig' },
        },
      ],
      output: 'function updateConfig(options) {}',
    },
    {
      code: 'function convertDataTo(format) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'To', suggestion: 'convertData' },
        },
      ],
      output: 'function convertData(format) {}',
    },
    {
      code: 'function validateInputBy(rules) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'By', suggestion: 'validateInput' },
        },
      ],
      output: 'function validateInput(rules) {}',
    },
    {
      code: 'function searchItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'In', suggestion: 'searchItems' },
        },
      ],
      output: 'function searchItems(container) {}',
    },
    {
      code: 'function processEventOn(element) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'On', suggestion: 'processEvent' },
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
          data: { suffix: 'During', suggestion: 'process' },
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
          data: { suffix: 'Via', suggestion: 'execute' },
        },
      ],
      output: 'function execute(method) {}',
    },
    {
      code: 'function processWithout(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'Without', suggestion: 'process' },
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
          data: { suffix: 'Against', suggestion: 'fight' },
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
          data: { suffix: 'Again', suggestion: 'retry' },
        },
      ],
      output: 'function retry(attempt) {}',
    },
    {
      code: 'function attemptAgain(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'Again', suggestion: 'attempt' },
        },
      ],
      output: 'function attempt(data) {}',
    },
    {
      code: 'function startNow(task) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'Now', suggestion: 'start' },
        },
      ],
      output: 'function start(task) {}',
    },

    // Function declarations with programming-specific suffixes
    {
      code: 'function executeAsync(task) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'Async', suggestion: 'execute' },
        },
      ],
      output: 'function execute(task) {}',
    },
    {
      code: 'function processSync(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'Sync', suggestion: 'process' },
        },
      ],
      output: 'function process(data) {}',
    },

    // Class methods
    {
      code: `class TournamentService {
        initializeGameFor(player) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'For', suggestion: 'initializeGame' },
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
          data: { suffix: 'From', suggestion: 'calculateScore' },
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
          data: { suffix: 'With', suggestion: 'updateState' },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'To', suggestion: 'transformData' },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'By', suggestion: 'filterUsers' },
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
          data: { suffix: 'With', suggestion: 'transformData' },
        },
      ],
      output: 'const transformData = (options) => {};',
    },
    {
      code: 'const prepareStateFor = (component) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'For', suggestion: 'prepareState' },
        },
      ],
      output: 'const prepareState = (component) => {};',
    },
    {
      code: 'const validateBy = (rules) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'By', suggestion: 'validate' },
        },
      ],
      output: 'const validate = (rules) => {};',
    },
    {
      code: 'const searchIn = (scope) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'In', suggestion: 'search' },
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
          data: { suffix: 'From', suggestion: 'getUser' },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'With', suggestion: 'createUser' },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'To', suggestion: 'updateUser' },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'By', suggestion: 'deleteUser' },
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
          data: { suffix: 'With', suggestion: '_privateProcess' },
        },
      ],
      output: 'function _privateProcess() {}',
    },
    {
      code: 'function $specialHandleFor() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'For', suggestion: '$specialHandle' },
        },
      ],
      output: 'function $specialHandle() {}',
    },

    // Multiple unnecessary suffixes
    {
      code: 'function extractConfigFromWithToViaBy() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { suffix: 'By', suggestion: 'extractConfigFromWithToVia' },
        },
      ],
      output: 'function extractConfigFromWithToVia() {}',
    },
  ],
});
