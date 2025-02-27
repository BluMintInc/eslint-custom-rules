import { functionsReadTopToBottom } from '../rules/functions-read-top-to-bottom';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * Tests for the functions-read-top-to-bottom rule.
 * These tests are sensitive to whitespace since we aren't running
 * prettier as part of the rule. Please be careful!
 */
ruleTesterTs.run(
  'functions-read-top-to-bottom',
  functionsReadTopToBottom,
  {
    valid: [
      {
        code: `
          function handleClick() {
            processUserInput(userInput);
          }

          function processUserInput(input) {
            return sanitize(input);
          }

          function fetchData() {
            return api.get('/data');
          }

          function transformData(data) {
            return data.map((item) => item.value);
          }
        `,
      },
      {
        code: `
          // Arrow functions should also be considered
          const handleClick = () => {
            processUserInput(userInput);
          };

          const processUserInput = (input) => {
            return sanitize(input);
          };

          const fetchData = () => {
            return api.get('/data');
          };

          const transformData = (data) => {
            return data.map((item) => item.value);
          };
        `,
      },
      {
        code: `
// Mixed function declarations and expressions
function handleClick() {
  processUserInput(userInput);
}

const processUserInput = function(input) {
  return sanitize(input);
};

function fetchData() {
  return api.get('/data');
}

const transformData = (data) => {
  return data.map((item) => item.value);
};
        `,
      },
      {
        code: `
// Functions with no dependencies
function functionA() {
  return 'A';
}

function functionB() {
  return 'B';
}

function functionC() {
  return 'C';
}
        `,
      },
      {
        code: `
// Nested functions should be ignored
function outer() {
  function inner() {
    return 'inner';
  }
  return inner();
}

function another() {
  return 'another';
}
        `,
      },
      {
        code: `
// Object methods should be ignored
const obj = {
  firstMethod() {
    return 'first';
  },
  secondMethod() {
    return 'second';
  }
};

function standalone() {
  return obj.firstMethod();
}
        `,
      },
      {
        code: `
// Event handlers should be at the top
function onSubmit() {
  validateForm();
  submitForm();
}

function validateForm() {
  return checkFields();
}

function submitForm() {
  return sendData();
}

function checkFields() {
  return true;
}

function sendData() {
  return fetch('/api/submit');
}
        `,
      },
      {
        code: `
// Complex dependency chain
function initializeApp() {
  setupRoutes();
  configureStore();
}

function setupRoutes() {
  registerRouteHandlers();
}

function configureStore() {
  setupReducers();
  setupMiddleware();
}

function registerRouteHandlers() {
  addHomeRoute();
  addProfileRoute();
}

function setupReducers() {
  return combineReducers();
}

function setupMiddleware() {
  return applyMiddleware();
}

function addHomeRoute() {
  return route('/home');
}

function addProfileRoute() {
  return route('/profile');
}

function combineReducers() {
  return { users: userReducer };
}

function applyMiddleware() {
  return [logger, thunk];
}

function userReducer() {
  return {};
}
        `,
      },
      {
        code: `
// Single function should be valid
function singleFunction() {
  return 'I am alone';
}
        `,
      },
    ],
    invalid: [
      {
        code: `
function fetchData() {
  return api.get('/data');
}

function processUserInput(input) {
  return sanitize(input);
}

function transformData(data) {
  return data.map((item) => item.value);
}

function handleClick() {
  processUserInput(userInput);
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input) {
  return sanitize(input);
}

function fetchData() {
  return api.get('/data');
}

function transformData(data) {
  return data.map((item) => item.value);
}
        `,
      },
      {
        code: `
const fetchData = () => {
  return api.get('/data');
};

const processUserInput = (input) => {
  return sanitize(input);
};

const transformData = (data) => {
  return data.map((item) => item.value);
};

const handleClick = () => {
  processUserInput(userInput);
};
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
const handleClick = () => {
  processUserInput(userInput);
};

const processUserInput = (input) => {
  return sanitize(input);
};

const fetchData = () => {
  return api.get('/data');
};

const transformData = (data) => {
  return data.map((item) => item.value);
};
        `,
      },
      {
        code: `
function transformData(data) {
  return data.map((item) => item.value);
}

function handleClick() {
  processUserInput(userInput);
}

function fetchData() {
  return api.get('/data');
}

function processUserInput(input) {
  return sanitize(input);
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input) {
  return sanitize(input);
}

function fetchData() {
  return api.get('/data');
}

function transformData(data) {
  return data.map((item) => item.value);
}
        `,
      },
      {
        code: `
// Mixed function declarations and expressions in wrong order
function fetchData() {
  return api.get('/data');
}

const transformData = (data) => {
  return data.map((item) => item.value);
};

const processUserInput = function(input) {
  return sanitize(input);
};

function handleClick() {
  processUserInput(userInput);
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function handleClick() {
  processUserInput(userInput);
}

const processUserInput = function(input) {
  return sanitize(input);
};

// Mixed function declarations and expressions in wrong order
function fetchData() {
  return api.get('/data');
}

const transformData = (data) => {
  return data.map((item) => item.value);
};
        `,
      },
      {
        code: `
// Event handlers should be at the top but are at the bottom
function validateForm() {
  return checkFields();
}

function submitForm() {
  return sendData();
}

function checkFields() {
  return true;
}

function sendData() {
  return fetch('/api/submit');
}

function onSubmit() {
  validateForm();
  submitForm();
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function onSubmit() {
  validateForm();
  submitForm();
}

// Event handlers should be at the top but are at the bottom
function validateForm() {
  return checkFields();
}

function submitForm() {
  return sendData();
}

function checkFields() {
  return true;
}

function sendData() {
  return fetch('/api/submit');
}
        `,
      },
      {
        code: `
// Complex dependency chain in wrong order
function addHomeRoute() {
  return route('/home');
}

function addProfileRoute() {
  return route('/profile');
}

function setupRoutes() {
  registerRouteHandlers();
}

function registerRouteHandlers() {
  addHomeRoute();
  addProfileRoute();
}

function configureStore() {
  setupReducers();
  setupMiddleware();
}

function setupReducers() {
  return combineReducers();
}

function setupMiddleware() {
  return applyMiddleware();
}

function combineReducers() {
  return { users: userReducer };
}

function applyMiddleware() {
  return [logger, thunk];
}

function userReducer() {
  return {};
}

function initializeApp() {
  setupRoutes();
  configureStore();
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function userReducer() {
  return {};
}

function initializeApp() {
  setupRoutes();
  configureStore();
}

// Complex dependency chain in wrong order
function addHomeRoute() {
  return route('/home');
}

function addProfileRoute() {
  return route('/profile');
}

function registerRouteHandlers() {
  addHomeRoute();
  addProfileRoute();
}

function setupRoutes() {
  registerRouteHandlers();
}

function combineReducers() {
  return { users: userReducer };
}

function setupReducers() {
  return combineReducers();
}

function applyMiddleware() {
  return [logger, thunk];
}

function setupMiddleware() {
  return applyMiddleware();
}

function configureStore() {
  setupReducers();
  setupMiddleware();
}
        `,
      },
      {
        code: `
// Functions with comments should preserve comments
function processData(data) {
  return transform(data);
}

// This is an important utility function
// It handles all data transformation
function transform(input) {
  return input.map(i => i * 2);
}

// Main entry point for the application
// Handles user interaction
function handleUserAction() {
  const data = getData();
  processData(data);
}

function getData() {
  return [1, 2, 3];
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
// Handles user interaction
function handleUserAction() {
  const data = getData();
  processData(data);
}

// Functions with comments should preserve comments
function processData(data) {
  return transform(data);
}

function getData() {
  return [1, 2, 3];
}

// It handles all data transformation
function transform(input) {
  return input.map(i => i * 2);
}
        `,
      },
      {
        code: `
// Circular dependencies should be handled gracefully
function funcA() {
  return funcB();
}

function funcC() {
  return "C";
}

function funcB() {
  funcA();
  return funcC();
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function funcC() {
  return "C";
}

function funcB() {
  funcA();
  return funcC();
}

// Circular dependencies should be handled gracefully
function funcA() {
  return funcB();
}
        `,
      },
      {
        code: `
// Functions with different naming conventions
function get_data() {
  return fetchFromAPI();
}

function fetchFromAPI() {
  return apiCall();
}

function apiCall() {
  return { data: 'result' };
}

function handleSubmit() {
  const data = get_data();
  return processData(data);
}

function processData(data) {
  return data;
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function handleSubmit() {
  const data = get_data();
  return processData(data);
}

// Functions with different naming conventions
function get_data() {
  return fetchFromAPI();
}

function processData(data) {
  return data;
}

function apiCall() {
  return { data: 'result' };
}

function fetchFromAPI() {
  return apiCall();
}
        `,
      },
      {
        code: `
function fetchData() {
  return api.get('/data');
}

function processUserInput(input) {
  return sanitize(input);
}

function transformData(data) {
  return data.map((item) => item.value);
}

function handleClick() {
  processUserInput(userInput);
}
        `,
        errors: [{ messageId: 'functionsReadTopToBottom' }],
        output: `
function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input) {
  return sanitize(input);
}

function fetchData() {
  return api.get('/data');
}

function transformData(data) {
  return data.map((item) => item.value);
}
        `,
      },
    ],
  },
);
