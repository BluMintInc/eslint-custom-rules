import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryVerbSuffix } from '../../src/rules/no-unnecessary-verb-suffix';

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

    // Class methods
    `class TournamentService {
      initializeGame(player) {}
      calculateScore(results) {}
      updateState(data) {}
      transformData(format) {}
      filterUsers(criteria) {}
    }`,

    // Arrow functions
    'const transformData = (options) => {};',
    'const prepareState = (component) => {};',
    'const validate = (rules) => {};',
    'const search = (scope) => {};',

    // Cases where suffix adds necessary context (with eslint-disable)
    '/* eslint-disable no-unnecessary-verb-suffix */ function migrateDataFromLegacy(data) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function mergeConfigWithDefaults(config) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function convertTemperatureToCelsius(temp) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function sortUsersByRank(users) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function searchProductsInCategory(category) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function validateInputAgainstSchema(input) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function processEventsUntilTimeout(events) {} /* eslint-enable no-unnecessary-verb-suffix */',
    '/* eslint-disable no-unnecessary-verb-suffix */ function computeScoreViaAlgorithm(data) {} /* eslint-enable no-unnecessary-verb-suffix */',
  ],
  invalid: [
    // Function declarations
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
  ],
});
