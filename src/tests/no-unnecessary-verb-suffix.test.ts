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

    // Class methods: violation is reported, but the fix is SUPPRESSED —
    // methods are called via member expressions (this.x()/instance.x()) the
    // scope manager cannot resolve, so renaming the key would orphan call
    // sites (#1256). output === code proves no unsafe fix is applied.
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
        initializeGameFor(player) {}
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
        calculateScoreFrom(results) {}
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
        updateStateWith(data) {}
        transformDataTo(format) {}
        filterUsersBy(criteria) {}
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

    // Object methods: reported but fix SUPPRESSED — accessed via member
    // expressions (api.method()) the scope manager does not track. output === code.
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
        getUserFrom(source) {},
        createUserWith(data) {},
        updateUserTo(id, data) {},
        deleteUserBy(id) {}
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

    // FunctionDeclaration branch: fixer must rename the call site too.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = element([10, 20, 30], 0);',
      ].join('\n'),
    },
    // VariableDeclarator (arrow) branch: same requirement.
    {
      code: [
        'const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'const hours = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hours(new Date(0), new Date());',
      ].join('\n'),
    },

    // Multiple call sites: all references must be renamed.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const a = elementAt([1, 2, 3], 0);',
        'const b = elementAt([4, 5, 6], 1);',
        'const c = elementAt([7, 8, 9], 2);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const a = element([1, 2, 3], 0);',
        'const b = element([4, 5, 6], 1);',
        'const c = element([7, 8, 9], 2);',
      ].join('\n'),
    },

    // Object Property arrow WITH a member-expression call site: the fix must be
    // SUPPRESSED entirely. Renaming only the key to `computeValue` while leaving
    // `utils.computeValueFrom(...)` would orphan the call site (a runtime
    // ReferenceError / TS error). Since the scope manager cannot resolve the
    // member reference, no fix is offered — output === code.
    {
      code: [
        'const utils = {',
        '  computeValueFrom: (data: number[]) => data.reduce((a, b) => a + b, 0),',
        '};',
        'const result = utils.computeValueFrom([1, 2, 3]);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'const utils = {',
        '  computeValueFrom: (data: number[]) => data.reduce((a, b) => a + b, 0),',
        '};',
        'const result = utils.computeValueFrom([1, 2, 3]);',
      ].join('\n'),
    },

    // Exported FunctionDeclaration: fix must be suppressed (output === code).
    {
      code: [
        'export function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      // Fix suppressed for exported symbol — output unchanged.
      output: [
        'export function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
    },

    // Exported arrow const: fix must be suppressed.
    {
      code: [
        'export const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      // Fix suppressed for exported symbol — output unchanged.
      output: [
        'export const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
    },

    // String literal with same text as function name must NOT be renamed.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        "const name = 'elementAt';",
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        // String literal unchanged — only true references renamed.
        "const name = 'elementAt';",
        'const first = element([10, 20, 30], 0);',
      ].join('\n'),
    },

    // Shadowing: inner scope redefines the name — each declaration is reported
    // separately and its own references are renamed. The outer declaration's
    // references (outer call site) are renamed; the inner shadow's reference
    // (inner call site) is renamed independently.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const outer = elementAt([1, 2, 3], 0);',
        'function wrapper() {',
        '  function elementAt(x: number) { return x; }',
        '  return elementAt(42);',
        '}',
      ].join('\n'),
      errors: [
        { messageId: 'unnecessaryVerbSuffix' },
        { messageId: 'unnecessaryVerbSuffix' },
      ],
      // After applying both fixes: outer declaration + outer call site renamed,
      // inner shadow declaration + inner call site renamed.
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const outer = element([1, 2, 3], 0);',
        'function wrapper() {',
        '  function element(x: number) { return x; }',
        '  return element(42);',
        '}',
      ].join('\n'),
    },

    // MethodDefinition WITH a this.method() call site: the fix must be
    // SUPPRESSED. Renaming only the method to `computeValue` while leaving
    // `this.computeValueFrom(...)` is the exact ReferenceError bug from #1256.
    // `this.x` is a member expression the scope manager does not track, so no
    // fix is offered — output === code (violation still reported).
    {
      code: [
        'class Calculator {',
        '  computeValueFrom(data: number[]) {',
        '    return data.reduce((a, b) => a + b, 0);',
        '  }',
        '  run() {',
        '    return this.computeValueFrom([1, 2, 3]);',
        '  }',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'class Calculator {',
        '  computeValueFrom(data: number[]) {',
        '    return data.reduce((a, b) => a + b, 0);',
        '  }',
        '  run() {',
        '    return this.computeValueFrom([1, 2, 3]);',
        '  }',
        '}',
      ].join('\n'),
    },

    // Interface method signature (TSMethodSignature): reported but fix
    // SUPPRESSED. The implementation and every call site live on implementers
    // (member accesses) that a single-file syntactic fixer cannot reach, so no
    // rename is offered — output === code.
    {
      code: [
        'interface Repository {',
        '  fetchRecordFrom(source: string): unknown;',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'interface Repository {',
        '  fetchRecordFrom(source: string): unknown;',
        '}',
      ].join('\n'),
    },

    // Class method with an EXTERNAL call site (instance.method()) — also a
    // member expression, also suppressed. Guards against a future change that
    // renames only same-name identifiers regardless of member context.
    {
      code: [
        'class Store {',
        '  loadItemsFrom(key: string) {',
        '    return key;',
        '  }',
        '}',
        'const store = new Store();',
        "const items = store.loadItemsFrom('cache');",
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'class Store {',
        '  loadItemsFrom(key: string) {',
        '    return key;',
        '  }',
        '}',
        'const store = new Store();',
        "const items = store.loadItemsFrom('cache');",
      ].join('\n'),
    },

    // Collision bail-out (#1278): the suggested name `line` is already bound at
    // a call site AND inside the function body. The rule may still REPORT, but
    // must NOT autofix — rewriting to `const line = line(lines, i)` produces a
    // TDZ self-reference (TS2448/TS7022) that fails compilation. `output: null`
    // asserts the fixer bails.
    {
      code: `
export function parseBlocks(source: string) {
  const lines = source.split('\\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lineAt(lines, i);
    out.push(line.trim());
  }
  return out;
}

function lineAt(lines: string[], index: number) {
  const line = lines[Number(index)];
  if (line === undefined) {
    throw new Error('out of range');
  }
  return line;
}
`,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // Collision ONLY at the declaration site (no call sites): a `const line`
    // sibling in the declaration scope would clash with the renamed function.
    // Report-only.
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        "const line = 'reserved';",
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // Collision ONLY at a call site's enclosing scope (declaration scope is
    // clean): renaming would capture `lineAt(...)` onto the caller's local
    // `line`. Report-only.
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'function consumer() {',
        "  const line = 'reserved';",
        '  return lineAt([1, 2, 3], 0);',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // No collision anywhere: the strip-suffix rename still autofixes the
    // declaration and every call site (guards against the collision check
    // over-suppressing safe fixes).
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'const first = lineAt([1, 2, 3], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function line(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'const first = line([1, 2, 3], 0);',
      ].join('\n'),
    },
  ],
});
