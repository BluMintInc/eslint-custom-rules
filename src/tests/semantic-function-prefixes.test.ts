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
  ],
});
