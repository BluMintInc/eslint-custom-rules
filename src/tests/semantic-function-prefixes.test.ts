import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { semanticFunctionPrefixes } from '../rules/semantic-function-prefixes';

const ALTERNATIVES = {
  get: 'fetch, retrieve, compute, derive',
  update: 'modify, set, apply',
  check: 'validate, assert, ensure',
  manage: 'control, coordinate, schedule',
  process: 'transform, sanitize, compute',
  do: 'execute, perform, apply',
} as const;

type Prefix = keyof typeof ALTERNATIVES;

const buildMessage = (functionName: string, prefix: Prefix) =>
  `Function "${functionName}" starts with the generic prefix "${prefix}", which hides whether it fetches remote data, transforms input, or mutates state. Use a semantic verb such as ${ALTERNATIVES[prefix]} to describe the operation and set caller expectations.`;

const error = (functionName: string, prefix: Prefix) =>
  ({
    message: buildMessage(functionName, prefix),
  } as unknown as TSESLint.TestCaseError<'avoidGenericPrefix'>);

ruleTesterTs.run('semantic-function-prefixes', semanticFunctionPrefixes, {
  valid: [
    // Valid function names
    'function fetchData() {}',
    'function retrieveUser() {}',
    'function modifySettings() {}',
    'function validateInput() {}',
    'function transformData() {}',
    'function executeAction() {}',
    // Valid PascalCase/camelCase names that contain disallowed prefixes as substrings
    'function downloadFile() {}',
    'function DownloadLivestreamButtonUnmemoized() {}',
    'function endowmentFund() {}',
    'function windowSize() {}',
    'function shadowRoot() {}',
    'function meadowFlowers() {}',
    // Boolean check functions with 'is' prefix are allowed
    'function isUserLoggedIn() {}',
    'function isValid() {}',
    // Functions/methods with exact disallowed prefix names should be allowed (not prefixes)
    'function get() {}',
    'function update() {}',
    'function check() {}',
    'function manage() {}',
    'function process() {}',
    'const get = () => {}',
    'const update = function() {}',
    'const check = () => {}',
    'const manage = function() {}',
    'const process = () => {}',
    // Class getters and setters are allowed
    `
      class User {
        get name() {
          return this._name;
        }
        set name(value) {
          this._name = value;
        }
      }
    `,
    // Valid class methods
    `
      class Service {
        fetchData() {}
        modifyRecord() {}
        validateInput() {}
        isValid() {}
        downloadFile() {}
        DownloadLivestreamButtonUnmemoized() {}
        endowmentFund() {}
        windowSize() {}
        shadowRoot() {}
        meadowFlowers() {}
      }
    `,
    // Class methods with exact disallowed prefix names should be allowed (not prefixes)
    `
      class MessageProcessor {
        process() {}
        get() {}
        update() {}
        check() {}
        manage() {}
      }
    `,
    // Examples from the problem statement should be valid
    `
      export class NewMessageProcessor extends MessageProcessor {
        constructor(event: Event) {
          super(event);
        }

        public async process() {
          // Implementation
        }
      }
    `,
    `
      function someFunction() {
        const get = fetchFromDatabase();
        return get;
      }
    `,
    // Variable declarations with exact disallowed prefix names should be allowed
    'const process = require("process");',
    'let update = true;',
    'var check = false;',
    'let get = null;',
    'var manage = {};',
    // Single letter variations should be allowed
    'function g() {}',
    'function u() {}',
    'function c() {}',
    'function m() {}',
    'function p() {}',
    // Anonymous functions are ignored
    '() => {}',
    '(function() {})',
    // Next.js data-fetching functions are allowed
    'export async function getServerSideProps() { return { props: {} }; }',
    'export async function getStaticProps() { return { props: {} }; }',
    'export async function getStaticPaths() { return { paths: [], fallback: false }; }',
    `
      class Page {
        static async getServerSideProps() { return { props: {} }; }
        static async getStaticProps() { return { props: {} }; }
        static async getStaticPaths() { return { paths: [], fallback: false }; }
      }
    `,

    // EDGE CASES - Exact matches with different casing
    'function Get() {}',
    'function UPDATE() {}',
    'function Check() {}',
    'function MANAGE() {}',
    'function Process() {}',
    'const Get = () => {}',
    'const UPDATE = function() {}',

    // EDGE CASES - Exact matches with underscores
    'function _get() {}',
    'function _update() {}',
    'function _check() {}',
    'function _manage() {}',
    'function _process() {}',
    'const _get = () => {}',
    'const _update = function() {}',

    // EDGE CASES - Exact matches with numbers
    'function get1() {}',
    'function update2() {}',
    'function check3() {}',
    'function manage4() {}',
    'function process5() {}',
    'const get7 = () => {}',
    'const update8 = function() {}',

    // EDGE CASES - Exact matches with dollar signs
    'function $get() {}',
    'function $update() {}',
    'function $check() {}',
    'function $manage() {}',
    'function $process() {}',
    'const $get = () => {}',
    'const $update = function() {}',

    // EDGE CASES - Async functions with exact matches
    'async function get() {}',
    'async function update() {}',
    'async function check() {}',
    'async function manage() {}',
    'async function process() {}',
    'const get = async () => {}',
    'const update = async function() {}',

    // EDGE CASES - Generator functions with exact matches
    'function* get() {}',
    'function* update() {}',
    'function* check() {}',
    'function* manage() {}',
    'function* process() {}',

    // EDGE CASES - Async generator functions with exact matches
    'async function* get() {}',
    'async function* update() {}',
    'async function* check() {}',
    'async function* manage() {}',
    'async function* process() {}',

    // EDGE CASES - Class methods with different access modifiers
    `
      class TestClass {
        public get() {}
        private update() {}
        protected check() {}
        static manage() {}
        async process() {}
      }
    `,

    // EDGE CASES - Object method shorthand with exact matches
    `
      const obj = {
        get() {},
        update() {},
        check() {},
        manage() {},
        process() {},
        async get2() {},
        async update2() {}
      };
    `,

    // EDGE CASES - Destructuring assignments with exact matches
    'const { get } = someObject;',
    'const { update } = someObject;',
    'const { check } = someObject;',
    'const { manage } = someObject;',
    'const { process } = someObject;',

    // EDGE CASES - Export patterns with exact matches
    'export function get() {}',
    'export function update() {}',
    'export function check() {}',
    'export function manage() {}',
    'export function process() {}',
    'export const get = () => {};',
    'export const update = function() {};',
    'export { get };',
    'export { update };',
    'export default function get() {}',
    'export default function update() {}',

    // EDGE CASES - Nested functions with exact matches
    `
      function outer() {
        function get() {}
        function update() {}
        function check() {}
        function manage() {}
        function process() {}

        const get2 = () => {};
        const update2 = function() {};
      }
    `,

    // EDGE CASES - Functions in different scopes
    `
      if (true) {
        function get() {}
        const update = () => {};
      }
    `,
    `
      try {
        function check() {}
        const manage = function() {};
      } catch (e) {
        function process() {}
      }
    `,

    // EDGE CASES - Functions as object properties
    `
      const config = {
        handlers: {
          get: function() {},
          update: () => {},
          check() {},
          manage: async function() {},
          process: async () => {}
        }
      };
    `,

    // EDGE CASES - Functions in arrays
    `
      const handlers = [
        function get() {},
        function update() {},
        () => {}, // anonymous
        function check() {}
      ];
    `,

    // EDGE CASES - Callback functions with exact matches
    `
      someArray.forEach(function get(item) {});
      someArray.map(function update(item) {});
      someArray.filter(function check(item) {});
    `,

    // EDGE CASES - IIFE with exact matches
    '(function get() {})();',
    '(function update() {})();',
    '(() => {})();', // anonymous

    // EDGE CASES - TypeScript function overloads (if applicable)
    `
      function get(): void;
      function get(param: string): string;
      function get(param?: string): void | string {}
    `,

    // EDGE CASES - Functions with complex parameter patterns
    `
      function get(...args: any[]) {}
      function update(a: number, b: string = "default") {}
      function check({ prop }: { prop: string }) {}
      function manage([first, ...rest]: number[]) {}
    `,

    // EDGE CASES - Arrow functions in various contexts
    'const handlers = { get: () => {}, update: () => {} };',
    'const get = () => {}, update = () => {};',
    '[get, update].forEach(fn => fn());',

    // EDGE CASES - Functions with Unicode characters (edge case)
    'function get_α() {}',
    'function update_β() {}',
    'const check_γ = () => {};',

    // EDGE CASES - Very short variations that are not prefixes
    'function ge() {}',
    'function upd() {}',
    'function che() {}',
    'function man() {}',
    'function pro() {}',
    'function d() {}',

    // EDGE CASES - Names that end with disallowed words (not prefixes)
    'function myGet() {}',
    'function myUpdate() {}',
    'function myCheck() {}',
    'function myManage() {}',
    'function myProcess() {}',

    // EDGE CASES - Names with disallowed words in the middle (not prefixes)
    'function myGetData() {}',
    'function myUpdateUser() {}',
    'function myCheckInput() {}',
    'function myManageState() {}',
    'function myProcessData() {}',

    /**
     * COMPOUND LEXEMES - `check in` / `check out` are lexicalized phrasal verbs,
     * not the generic verb `check` applied to an object. The tournament domain
     * uses them as first-class actions (isCheckedIn, checkedInCount, skipCheckIn).
     */
    'function checkIn() {}',
    'function checkOut() {}',
    'function checkInAndSet() {}',
    'function checkOutTeam() {}',
    'const checkIn = (memberId: string) => memberId;',
    'const checkOut = (memberId: string) => memberId;',
    `class TeamMutator {
      public async checkInAndSet(memberId: string, isEntireTeam: boolean) {
        return this.checkIn(memberId, isEntireTeam);
      }
      public checkIn(memberId: string, entireTeam: boolean) {
        return { memberId, entireTeam };
      }
      public checkOut(memberId: string) {
        return memberId;
      }
    }`,
    /** Already passing - kept so the fix does not regress segmentation (#273). */
    'function checksum() {}',
    'function checkpoint() {}',
    'function checkedIn() {}',
    // The comparison is case-insensitive, so the exemption must be too
    'function CheckIn() {}',
    'function CheckOutTeam() {}',
    'const CheckInAndSet = () => {};',
    // Async/generator/export shapes of the compound lexeme
    'export async function checkIn() {}',
    'export const checkOutTeam = async () => {};',
    'function* checkInAll() {}',
    // Longer derived names still lead with the compound
    'function checkInMemberToTournament() {}',
    'function checkOutAllTeamMembers() {}',
    `
      class Registration {
        static async checkInMember() {}
        protected checkOutMember() {}
      }
    `,
    // ECMA #private methods carry the same exemptions as every other spelling.
    // Prefix matching reads the bare word, so `is`, the Next.js names and the
    // compound lexemes all survive the `#`.
    `
      class Account {
        #fetchUser() {}
        #modifySettings() {}
        #transformPayload() {}
      }
    `,
    `
      class Account {
        #isReady() {}
        static #isEnabled() {}
      }
    `,
    `
      class Registration {
        #checkIn() {}
        #checkOut() {}
        static async #checkInMember() {}
      }
    `,
    // A disallowed word used as the WHOLE name is not a prefix, in either
    // privacy spelling.
    `
      class Account {
        #get() {}
        #update() {}
        #process() {}
      }
    `,
    // Names that merely begin with a banned prefix's letters
    `
      class Account {
        #downloadFile() {}
        #endowmentFund() {}
      }
    `,
    // The Next.js allowlist is keyed on the name, so it stays spelling-neutral:
    // `private getStaticProps() {}` is silent and the `#` respelling matches it.
    `
      class Page {
        #getStaticProps() {}
      }
    `,
    // Getters and setters are skipped regardless of privacy spelling
    `
      class Account {
        #value = '';
        get #getValue() {
          return this.#value;
        }
        set #getValue(next) {
          this.#value = next;
        }
      }
    `,
    // Isolation control for the #-spelling cases below: renaming the member
    // while KEEPING the `private` modifier must also be silent, proving the
    // verdicts move with the prefix and not with the spelling.
    `
      class Account {
        private modifyUser() {}
        private static transformData() {}
      }
    `,
  ],
  invalid: [
    // Basic invalid cases - functions with disallowed prefixes
    {
      code: 'function getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'function updateUser() {}',
      errors: [error('updateUser', 'update')],
    },
    {
      code: 'function checkValidity() {}',
      errors: [error('checkValidity', 'check')],
    },
    {
      code: 'function manageTasks() {}',
      errors: [error('manageTasks', 'manage')],
    },
    {
      code: 'function processInput() {}',
      errors: [error('processInput', 'process')],
    },

    // Arrow functions with disallowed prefixes
    {
      code: 'const getData = () => {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'const updateUser = function() {}',
      errors: [error('updateUser', 'update')],
    },
    {
      code: 'const checkInput = () => {}',
      errors: [error('checkInput', 'check')],
    },
    {
      code: 'const manageState = function() {}',
      errors: [error('manageState', 'manage')],
    },
    {
      code: 'const processData = () => {}',
      errors: [error('processData', 'process')],
    },

    // Class methods with disallowed prefixes
    {
      code: `
        class UserService {
          protected async updateUserData() {}
        }
      `,
      errors: [error('updateUserData', 'update')],
    },
    {
      code: `
        class Service {
          getData() {}
          checkInput() {}
          processData() {}
          manageState() {}
        }
      `,
      errors: [
        error('getData', 'get'),
        error('checkInput', 'check'),
        error('processData', 'process'),
        error('manageState', 'manage'),
      ],
    },

    // EDGE CASES - Different casing with prefixes (should still be flagged)
    {
      code: 'function GetData() {}',
      errors: [error('GetData', 'get')],
    },
    {
      code: 'function UPDATEUser() {}',
      errors: [error('UPDATEUser', 'update')],
    },
    {
      code: 'function CheckInput() {}',
      errors: [error('CheckInput', 'check')],
    },
    {
      code: 'function MANAGETasks() {}',
      errors: [error('MANAGETasks', 'manage')],
    },
    {
      code: 'function ProcessData() {}',
      errors: [error('ProcessData', 'process')],
    },

    // EDGE CASES - Async functions with disallowed prefixes
    {
      code: 'async function getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'async function updateUser() {}',
      errors: [error('updateUser', 'update')],
    },
    {
      code: 'const getData = async () => {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'const updateUser = async function() {}',
      errors: [error('updateUser', 'update')],
    },

    // EDGE CASES - Generator functions with disallowed prefixes
    {
      code: 'function* getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'function* updateUser() {}',
      errors: [error('updateUser', 'update')],
    },

    // EDGE CASES - Async generator functions with disallowed prefixes
    {
      code: 'async function* getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'async function* updateUser() {}',
      errors: [error('updateUser', 'update')],
    },

    // EDGE CASES - Class methods with different access modifiers and disallowed prefixes
    {
      code: `
        class TestClass {
          public getData() {}
          private updateUser() {}
          protected checkInput() {}
          static manageTasks() {}
          async processData() {}
        }
      `,
      errors: [
        error('getData', 'get'),
        error('updateUser', 'update'),
        error('checkInput', 'check'),
        error('manageTasks', 'manage'),
        error('processData', 'process'),
      ],
    },

    // EDGE CASES - Object method shorthand with disallowed prefixes (currently not supported by rule)
    // Note: The rule currently doesn't handle object method shorthand syntax
    // {
    //   code: `
    //     const obj = {
    //       getData() {},
    //       updateUser() {},
    //       checkInput() {},
    //       manageTasks() {},
    //       processData() {}
    //     };
    //   `,
    //   errors: [
    //     // Expected errors would go here if the rule supported this syntax
    //   ],
    // },

    // EDGE CASES - Export patterns with disallowed prefixes
    {
      code: 'export function getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'export function updateUser() {}',
      errors: [error('updateUser', 'update')],
    },
    {
      code: 'export const getData = () => {};',
      errors: [error('getData', 'get')],
    },
    {
      code: 'export const updateUser = function() {};',
      errors: [error('updateUser', 'update')],
    },
    {
      code: 'export default function getData() {}',
      errors: [error('getData', 'get')],
    },
    {
      code: 'export default function updateUser() {}',
      errors: [error('updateUser', 'update')],
    },

    // EDGE CASES - Nested functions with disallowed prefixes
    {
      code: `
        function outer() {
          function getData() {}
          function updateUser() {}
          function checkInput() {}
          function manageTasks() {}
          function processData() {}

          const getInfo = () => {};
          const updateInfo = function() {};
        }
      `,
      errors: [
        error('getData', 'get'),
        error('updateUser', 'update'),
        error('checkInput', 'check'),
        error('manageTasks', 'manage'),
        error('processData', 'process'),
        error('getInfo', 'get'),
        error('updateInfo', 'update'),
      ],
    },

    // EDGE CASES - Functions in different scopes with disallowed prefixes
    {
      code: `
        if (true) {
          function getData() {}
          const updateUser = () => {};
        }
      `,
      errors: [error('getData', 'get'), error('updateUser', 'update')],
    },
    {
      code: `
        try {
          function checkInput() {}
          const manageState = function() {};
        } catch (e) {
          function processData() {}
        }
      `,
      errors: [
        error('checkInput', 'check'),
        error('manageState', 'manage'),
        error('processData', 'process'),
      ],
    },

    // EDGE CASES - Functions as object properties with disallowed prefixes (currently not supported by rule)
    // Note: The rule currently doesn't handle object property assignments
    // {
    //   code: `
    //     const config = {
    //       handlers: {
    //         getData: function() {},
    //         updateUser: () => {},
    //         checkInput() {},
    //         manageState: async function() {},
    //         processData: async () => {}
    //       }
    //     };
    //   `,
    //   errors: [
    //     // Expected errors would go here if the rule supported this syntax
    //   ],
    // },

    // EDGE CASES - Functions in arrays with disallowed prefixes
    {
      code: `
        const handlers = [
          function getData() {},
          function updateUser() {},
          () => {}, // anonymous - should be ignored
          function checkInput() {}
        ];
      `,
      errors: [
        error('getData', 'get'),
        error('updateUser', 'update'),
        error('checkInput', 'check'),
      ],
    },

    // EDGE CASES - Callback functions with disallowed prefixes
    {
      code: `
        someArray.forEach(function getData(item) {});
        someArray.map(function updateItem(item) {});
        someArray.filter(function checkItem(item) {});
      `,
      errors: [
        error('getData', 'get'),
        error('updateItem', 'update'),
        error('checkItem', 'check'),
      ],
    },

    // EDGE CASES - IIFE with disallowed prefixes
    {
      code: '(function getData() {})();',
      errors: [error('getData', 'get')],
    },
    {
      code: '(function updateUser() {})();',
      errors: [error('updateUser', 'update')],
    },

    // EDGE CASES - Functions with complex parameter patterns and disallowed prefixes
    {
      code: `
        function getData(...args: any[]) {}
        function updateUser(a: number, b: string = "default") {}
        function checkInput({ prop }: { prop: string }) {}
        function manageTasks([first, ...rest]: number[]) {}
      `,
      errors: [
        error('getData', 'get'),
        error('updateUser', 'update'),
        error('checkInput', 'check'),
        error('manageTasks', 'manage'),
      ],
    },

    // EDGE CASES - Multiple word combinations with disallowed prefixes
    {
      code: 'function getDataFromAPI() {}',
      errors: [error('getDataFromAPI', 'get')],
    },
    {
      code: 'function updateUserProfile() {}',
      errors: [error('updateUserProfile', 'update')],
    },
    {
      code: 'function checkInputValidation() {}',
      errors: [error('checkInputValidation', 'check')],
    },
    {
      code: 'function manageTaskQueue() {}',
      errors: [error('manageTaskQueue', 'manage')],
    },
    {
      code: 'function processUserData() {}',
      errors: [error('processUserData', 'process')],
    },

    // EDGE CASES - PascalCase variations with disallowed prefixes
    {
      code: 'function GetUserData() {}',
      errors: [error('GetUserData', 'get')],
    },
    {
      code: 'function UpdateUserProfile() {}',
      errors: [error('UpdateUserProfile', 'update')],
    },
    {
      code: 'function CheckInputData() {}',
      errors: [error('CheckInputData', 'check')],
    },
    {
      code: 'function ManageUserSessions() {}',
      errors: [error('ManageUserSessions', 'manage')],
    },
    {
      code: 'function ProcessFileData() {}',
      errors: [error('ProcessFileData', 'process')],
    },

    /**
     * COMPOUND LEXEME CARVE-OUT - regression guards. The exemption is limited to
     * the recognized compound; `check` + object is still the generic verb this
     * rule exists to ban.
     */
    {
      code: 'function checkUserPermissions() {}',
      errors: [error('checkUserPermissions', 'check')],
    },
    {
      code: 'const checkUserPermissions = (id: string) => !!id;',
      errors: [error('checkUserPermissions', 'check')],
    },
    // Near-misses: the second segment merely STARTS with a particle. Matching on
    // a lowercased substring instead of whole camelCase segments would silently
    // exempt every one of these.
    {
      code: 'function checkInvites() {}',
      errors: [error('checkInvites', 'check')],
    },
    {
      code: 'function checkIntegrity() {}',
      errors: [error('checkIntegrity', 'check')],
    },
    {
      code: 'const checkOutdatedEntries = () => {}',
      errors: [error('checkOutdatedEntries', 'check')],
    },
    {
      code: 'function CheckInputSchema() {}',
      errors: [error('CheckInputSchema', 'check')],
    },
    // A particle after a banned prefix is not by itself an exemption: only
    // lexicalized compounds are allowlisted, and `get out` / `update in` are not.
    {
      code: 'function getOutOfSyncItems() {}',
      errors: [error('getOutOfSyncItems', 'get')],
    },
    {
      code: 'function updateInPlace() {}',
      errors: [error('updateInPlace', 'update')],
    },
    {
      code: 'const processOutQueue = () => {}',
      errors: [error('processOutQueue', 'process')],
    },
    {
      code: `
        class Registration {
          public async checkUserEligibility() {}
          private checkOutdatedRoster() {}
        }
      `,
      errors: [
        error('checkUserEligibility', 'check'),
        error('checkOutdatedRoster', 'check'),
      ],
    },

    // EDGE CASES - ECMA #private methods. `#foo` and `private foo` are the same
    // privacy and are mutually exclusive (`private #foo` is TS18010), so the
    // `#` spelling cannot opt back into coverage by adding a modifier. The
    // reported name keeps the `#` so the message names a member that exists.
    {
      code: `
        class Account {
          #updateUser() {}
        }
      `,
      output: null,
      errors: [error('#updateUser', 'update')],
    },
    {
      code: `
        class Account {
          static #processData() {}
        }
      `,
      errors: [error('#processData', 'process')],
    },
    {
      code: `
        class Account {
          async #getData() {}
          async *#manageTasks() {}
          #doWork() {}
        }
      `,
      errors: [
        error('#getData', 'get'),
        error('#manageTasks', 'manage'),
        error('#doWork', 'do'),
      ],
    },
    // The compound-lexeme carve-out is matched on whole segments in the `#`
    // spelling too: `#checkIn` is exempt above, `#checkInput` is not.
    {
      code: `
        class Registration {
          #checkInput() {}
          #checkOutdatedRoster() {}
        }
      `,
      errors: [
        error('#checkInput', 'check'),
        error('#checkOutdatedRoster', 'check'),
      ],
    },
    // A `#foo` member and a public `foo` are distinct members; each is reported
    // under the name it was written with, so neither message names the other.
    {
      code: `
        class Account {
          updateUser() {}
          #updateUser() {}
        }
      `,
      errors: [error('updateUser', 'update'), error('#updateUser', 'update')],
    },
    // Call sites do not change the verdict: the rule renames nothing, so a
    // referenced #member reports exactly like an unreferenced one. `output:
    // null` pins that — a rename fixer would have to rewrite `this.#updateUser`
    // at every binding site, and this rule declares no fixer at all.
    {
      code: `
        class Account {
          #updateUser() {}
          run() {
            this.#updateUser();
          }
        }
      `,
      output: null,
      errors: [error('#updateUser', 'update')],
    },
    // Mixed spellings in one class: the `#` member joins its `private`,
    // `protected`, `public` and modifier-less siblings.
    {
      code: `
        class TestClass {
          public getData() {}
          #updateUser() {}
          protected checkInput() {}
          static #manageTasks() {}
          async processData() {}
        }
      `,
      errors: [
        error('getData', 'get'),
        error('#updateUser', 'update'),
        error('checkInput', 'check'),
        error('#manageTasks', 'manage'),
        error('processData', 'process'),
      ],
    },
  ],
});

/**
 * A class member spelled as a function-valued FIELD (`getUser = () => {}`) is
 * the same declaration as `getUser() {}` for everything this rule judges, so a
 * single `=` must not decide whether the name is read (#2161).
 *
 * Every case here asserts an EXACT report count. The function-expression and
 * arrow visitors also traverse a field's initializer, so a miscount is how a
 * double report would announce itself.
 */
ruleTesterTs.run(
  'semantic-function-prefixes (class-property spelling)',
  semanticFunctionPrefixes,
  {
    valid: [
      // Semantic field names are accepted in every function-valued spelling.
      'class Service { fetchData = () => {}; }',
      'class Service { modifyRecord = async () => {}; }',
      'class Service { validateInput = function () {}; }',
      'class Service { transformPayload = function* () {}; }',
      /**
       * Data fields name a value, not an operation, so the generic-verb
       * heuristic does not apply: the rule reads a field only when its
       * initializer is a function.
       */
      `
      class Counters {
        updateCount = 0;
        getters = {};
        checkList = [1, 2];
        processFlag = true;
        getterMap = new Map();
        getData = makeGetter();
      }
      `,
      // A field with no initializer declares no implementation to name.
      'class Api { declare getData: () => void; }',
      'class Api { getData!: () => void; }',
      'class Api { getData?: () => void; }',
      /**
       * Unreadable keys stay out of scope in the field spelling exactly as they
       * do in the method spelling.
       */
      'class Api { [getKey()] = () => {}; }',
      "class Api { ['getData'] = () => {}; }",
      "class Api { 'getData' = () => {}; }",
      // Every name-level exemption applies to a field unchanged.
      'class Widget { isReady = () => {}; }',
      'class Page { static getStaticProps = () => {}; }',
      'class Page { getServerSideProps = async () => {}; }',
      `
      class TeamMutator {
        checkIn = (memberId: string) => memberId;
        checkOut = (memberId: string) => memberId;
        checkInAndSet = async (memberId: string) => memberId;
        #checkInMember = (memberId: string) => memberId;
      }
      `,
      // A banned word that is the whole name is not a prefix.
      `
      class Registry {
        get = () => {};
        update = function () {};
        process = async () => {};
      }
      `,
      // A banned word that is merely a substring of the first segment.
      `
      class Assets {
        downloadFile = () => {};
        windowSize = () => {};
        endowmentFund = () => {};
      }
      `,
      /**
       * An auto-accessor field is an `AccessorProperty`, which desugars to a
       * getter/setter pair — the member kind this rule already skips.
       */
      'class Api { accessor getData = () => {}; }',
      /**
       * `TSAbstractMethodDefinition` / `TSAbstractPropertyDefinition` are
       * distinct node types that this rule has never visited in either
       * spelling. Pinned so the abstract gap stays a known, symmetric one
       * rather than an accident of the field arm.
       */
      `
      abstract class Repository {
        abstract getUserData(): void;
        abstract getHandler: () => void;
      }
      `,
      /**
       * Object literals stay out of scope: their keys routinely mirror an
       * external contract the author cannot rename.
       */
      'const config = { getData: () => {}, updateUser: function () {} };',
      /**
       * A named function expression carries its own binding, and the function
       * arm reports on that name. Both spellings defer to it identically, so
       * neither reports the outer name — the precedence is the same one the
       * variable spelling has always applied.
       */
      `
      const getUserData = function fetchInner() {};
      class Api {
        getUserData = function fetchInner() {};
      }
      `,
    ],
    invalid: [
      // The reproduction from #2161: a `=` away from the method spelling.
      {
        code: 'class Api { getUserData = () => {}; }',
        errors: [error('getUserData', 'get')],
      },
      {
        code: `
        class UserServiceArrow {
          getUserData = () => {};
          public processPayload = async () => {};
          private checkInput = function () {};
          static getStuffFromDb = () => {};
          #updateSecret = () => {};
        }
        `,
        errors: [
          error('getUserData', 'get'),
          error('processPayload', 'process'),
          error('checkInput', 'check'),
          error('getStuffFromDb', 'get'),
          error('#updateSecret', 'update'),
        ],
      },
      // Visibility is not a carve-out for a field, just as it is not for a method.
      {
        code: `
        class UserService {
          protected manageTasks = () => {};
          public doWork = async () => {};
        }
        `,
        errors: [error('manageTasks', 'manage'), error('doWork', 'do')],
      },
      /**
       * DOUBLE-REPORT GUARD. The function-expression visitor reports the inner
       * binding `getUserData`; the field arm must not report the key as well.
       */
      {
        code: 'class Api { getUserData = function getUserData() {}; }',
        errors: [error('getUserData', 'get')],
      },
      /**
       * The converse: a semantic field name over a generic inner binding still
       * reports once, from the arm that always owned it.
       */
      {
        code: 'class Api { fetchThing = function getInner() {}; }',
        errors: [error('getInner', 'get')],
      },
      // A field initializer's own nested declarations keep reporting on their own.
      {
        code: `
        class Api {
          fetchThing = () => {
            const getInner = () => {};
            return getInner;
          };
        }
        `,
        errors: [error('getInner', 'get')],
      },
      // Modifier spellings that only a field can carry.
      {
        code: 'class Child extends Base { override getData = () => {}; }',
        errors: [error('getData', 'get')],
      },
      {
        code: 'class Api { readonly getData = () => {}; }',
        errors: [error('getData', 'get')],
      },
      {
        code: 'class Api { getData? = () => {}; }',
        errors: [error('getData', 'get')],
      },
      {
        code: 'class Api { @observable getData = () => {}; }',
        errors: [error('getData', 'get')],
      },
      // An explicit type annotation does not hide the key.
      {
        code: 'class Api { getData: () => void = () => {}; }',
        errors: [error('getData', 'get')],
      },
      // Generator initializers are function values too.
      {
        code: 'class Api { getItems = function* () {}; }',
        errors: [error('getItems', 'get')],
      },
      {
        code: 'class Api { getItems = async function* () {}; }',
        errors: [error('getItems', 'get')],
      },
      // A class expression and a class nested in a function are still classes.
      {
        code: 'const Service = class { getData = () => {}; };',
        errors: [error('getData', 'get')],
      },
      {
        code: 'function buildService() { return class { getData = () => {}; }; }',
        errors: [error('getData', 'get')],
      },
      // PascalCase segmentation reads the same on a field key.
      {
        code: 'class Api { GetUserData = () => {}; }',
        errors: [error('GetUserData', 'get')],
      },
      /**
       * The compound-lexeme carve-out is matched on whole camelCase segments in
       * the field spelling too: `checkIn` is exempt above, these are not.
       */
      {
        code: `
        class Registration {
          checkInput = () => {};
          checkOutdatedRoster = async () => {};
          checkInvites = function () {};
        }
        `,
        errors: [
          error('checkInput', 'check'),
          error('checkOutdatedRoster', 'check'),
          error('checkInvites', 'check'),
        ],
      },
      // A merely grammatical verb-particle sequence is not a compound.
      {
        code: `
        class Sync {
          updateInPlace = () => {};
          getOutOfSyncItems = () => {};
          processOutQueue = async () => {};
        }
        `,
        errors: [
          error('updateInPlace', 'update'),
          error('getOutOfSyncItems', 'get'),
          error('processOutQueue', 'process'),
        ],
      },
      /**
       * An ECMA private field is the same privacy as `private`, and the message
       * names the member as written so it stays distinct from a public sibling.
       */
      {
        code: 'class Account { static #processData = () => {}; }',
        errors: [error('#processData', 'process')],
      },
      {
        code: `
        class Account {
          updateUser = () => {};
          #updateUser = () => {};
        }
        `,
        errors: [error('updateUser', 'update'), error('#updateUser', 'update')],
      },
      {
        code: 'class Registration { #checkInput = () => {}; }',
        errors: [error('#checkInput', 'check')],
      },
      /**
       * The two spellings of one member report identically — the asymmetry
       * #2161 reports is that only the first of these two used to be seen.
       */
      {
        code: `
        class Twin {
          getUserData() {}
          getUserDataToo = () => {};
        }
        `,
        errors: [error('getUserData', 'get'), error('getUserDataToo', 'get')],
      },
      // Fields, methods and free functions coexist without changing each other's verdict.
      {
        code: `
        function getTopLevel() {}
        class Mixed {
          getMethod() {}
          getField = () => {};
          fetchOk = () => {};
        }
        const getArrow = () => {};
        `,
        errors: [
          error('getTopLevel', 'get'),
          error('getMethod', 'get'),
          error('getField', 'get'),
          error('getArrow', 'get'),
        ],
      },
      /**
       * A name imposed by an implemented interface still reports. That is the
       * rule's pre-existing stance for the method spelling — heritage has never
       * been a carve-out here — and the field spelling inherits it rather than
       * inventing a narrower scope. These are the shapes #2161 measured in the
       * consumer codebase.
       */
      {
        code: `
        class TwitchAuthProvider implements AuthProvider {
          getCurrentScopesForUser = (userId: string) => [userId];
          getAccessTokenForUser = async (userId: string) => userId;
          getAppAccessToken = async () => 'token';
          getAnyAccessToken = async () => 'token';
        }
        `,
        errors: [
          error('getCurrentScopesForUser', 'get'),
          error('getAccessTokenForUser', 'get'),
          error('getAppAccessToken', 'get'),
          error('getAnyAccessToken', 'get'),
        ],
      },
    ],
  },
);
