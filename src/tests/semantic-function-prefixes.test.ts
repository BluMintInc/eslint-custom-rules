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
    // Class getters are allowed
    `
      class User {
        get name() {
          return this._name;
        }
      }
    `,
    // Anonymous functions are ignored
    '() => {}',
    '(function() {})',
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
  ],
});
