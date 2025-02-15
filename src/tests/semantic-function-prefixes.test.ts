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
  ],
  invalid: [
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
    {
      code: 'function doSomething() {}',
      errors: [
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'do',
            alternatives: 'execute, perform, apply',
          },
        },
      ],
    },
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
          doSomething() {}
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
        {
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: 'do',
            alternatives: 'execute, perform, apply',
          },
        },
      ],
    },
  ],
});
