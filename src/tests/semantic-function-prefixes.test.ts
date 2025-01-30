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
      }
    `,
    // Anonymous functions are ignored
    '() => {}',
    '(function() {})',
    // Words that contain disallowed prefixes as substrings should be valid
    'const DownloadLivestreamButtonUnmemoized = () => {}',
    'function downloadFile() {}',
    'const ManageDownloadQueue = () => {}',
    'function processDownloadStatus() {}',
    'const WindowManager = () => {}',
    'function checkoutCart() {}',
  ],
  invalid: [
    {
      code: 'function getData() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'get',
          alternatives: 'fetch, retrieve, compute, derive',
        },
      }],
    },
    {
      code: 'function updateUser() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'update',
          alternatives: 'modify, set, apply',
        },
      }],
    },
    {
      code: 'function checkValidity() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'check',
          alternatives: 'validate, assert, ensure',
        },
      }],
    },
    {
      code: 'function manageTasks() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'manage',
          alternatives: 'control, coordinate, schedule',
        },
      }],
    },
    {
      code: 'function processInput() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'process',
          alternatives: 'transform, sanitize, compute',
        },
      }],
    },
    {
      code: 'function doSomething() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'do',
          alternatives: 'execute, perform, apply',
        },
      }],
    },
    {
      code: 'const getData = () => {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'get',
          alternatives: 'fetch, retrieve, compute, derive',
        },
      }],
    },
    {
      code: 'const updateUser = function() {}',
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'update',
          alternatives: 'modify, set, apply',
        },
      }],
    },
    {
      code: `
        class UserService {
          protected async updateUserData() {}
        }
      `,
      errors: [{
        messageId: 'avoidGenericPrefix',
        data: {
          prefix: 'update',
          alternatives: 'modify, set, apply',
        },
      }],
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
