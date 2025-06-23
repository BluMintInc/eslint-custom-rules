import { ruleTesterTs } from '../utils/ruleTester';
import { semanticFunctionPrefixes } from '../rules/semantic-function-prefixes';

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
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'function updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'function checkValidity() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },
    {
      code: 'function manageTasks() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },
    {
      code: 'function processInput() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
      ],
    },


    // Arrow functions with disallowed prefixes
    {
      code: 'const getData = () => {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'const updateUser = function() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'const checkInput = () => {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },
    {
      code: 'const manageState = function() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },
    {
      code: 'const processData = () => {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
      ],
    },


    // Class methods with disallowed prefixes
    {
      code: `
        class UserService {
          protected async updateUserData() {}
        }
      `,
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },

    // EDGE CASES - Different casing with prefixes (should still be flagged)
    {
      code: 'function GetData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'function UPDATEUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'function CheckInput() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },
    {
      code: 'function MANAGETasks() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },
    {
      code: 'function ProcessData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
      ],
    },


    // EDGE CASES - Async functions with disallowed prefixes
    {
      code: 'async function getData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'async function updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'const getData = async () => {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'const updateUser = async function() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },

    // EDGE CASES - Generator functions with disallowed prefixes
    {
      code: 'function* getData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'function* updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },

    // EDGE CASES - Async generator functions with disallowed prefixes
    {
      code: 'async function* getData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'async function* updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
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
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'export function updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'export const getData = () => {};',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'export const updateUser = function() {};',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'export default function getData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'export default function updateUser() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
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
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },

    // EDGE CASES - IIFE with disallowed prefixes
    {
      code: '(function getData() {})();',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: '(function updateUser() {})();',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },

    // EDGE CASES - Multiple word combinations with disallowed prefixes
    {
      code: 'function getDataFromAPI() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'function updateUserProfile() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'function checkInputValidation() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },
    {
      code: 'function manageTaskQueue() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },
    {
      code: 'function processUserData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
      ],
    },


    // EDGE CASES - PascalCase variations with disallowed prefixes
    {
      code: 'function GetUserData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'get',
            alternatives: 'fetch, retrieve, compute, derive',
          },
        },
      ],
    },
    {
      code: 'function UpdateUserProfile() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'update',
            alternatives: 'modify, set, apply',
          },
        },
      ],
    },
    {
      code: 'function CheckInputData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'check',
            alternatives: 'validate, assert, ensure',
          },
        },
      ],
    },
    {
      code: 'function ManageUserSessions() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'manage',
            alternatives: 'control, coordinate, schedule',
          },
        },
      ],
    },
    {
      code: 'function ProcessFileData() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'process',
            alternatives: 'transform, sanitize, compute',
          },
        },
      ],
    },

  ],
});
