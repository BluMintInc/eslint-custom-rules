import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian', noHungarian, {
  valid: [
    // The bug case: function call with a parameter that uses Hungarian notation
    // This should be valid because we're not defining the function, just calling it
    `
    import type { NextRequest } from 'next/server';

    const checkSitemap = (pathname: string) => {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    };
    `,

    // Another example with a different built-in method
    `
    const isValidEmail = (email: string) => {
      return email.includes('@') && email.endsWith('.com');
    };
    `,

    // Example with multiple method calls
    `
    const formatText = (text: string) => {
      return text.toLowerCase().startsWith('a') ? text.toUpperCase() : text.trim();
    };
    `,

    // Test 1: String methods with parameters that use Hungarian notation
    `
    function processString(text: string) {
      return text.replace(/strPattern/g, 'replacement')
        .split('strSeparator')
        .indexOf('strNeedle');
    }
    `,

    // Test 2: Array methods with parameters that use Hungarian notation
    `
    function processArray(items: string[]) {
      return items.filter(itemString => itemString.length > 0)
        .map(itemString => itemString.toUpperCase())
        .find(itemString => itemString.startsWith('A'));
    }
    `,

    // Test 3: Object methods with parameters that use Hungarian notation
    `
    function processObject(obj: Record<string, any>) {
      const keys = Object.keys(obj).filter(keyString => keyString.startsWith('prefix'));
      const values = Object.values(obj).filter(valueObject => valueObject !== null);
      return { keys, values };
    }
    `,

    // Test 4: Promise methods with parameters that use Hungarian notation
    `
    async function processPromise() {
      return Promise.resolve().then(resultObject => resultObject)
        .catch(errorObject => console.error(errorObject));
    }
    `,

    // Test 5: DOM API methods with parameters that use Hungarian notation
    `
    function processDom() {
      document.querySelector('div').addEventListener('click', eventObject => {
        const targetElement = eventObject.target as HTMLElement;
        targetElement.setAttribute('dataString', 'value');
      });
    }
    `,

    // Test 6: Custom functions with parameters that use Hungarian notation
    `
    function customFunction(paramString: string, paramNumber: number) {
      return paramString.repeat(paramNumber);
    }

    const result = customFunction('hello', 3);
    `,

    // Test 7: Nested function calls with parameters that use Hungarian notation
    `
    function nestedCalls(text: string) {
      return text
        .split(',')
        .map(itemString => itemString.trim())
        .filter(itemString => customFunction(itemString, 2).length > 0);
    }
    `,

    // Test 8: Method chaining with parameters that use Hungarian notation
    `
    const result = ['a', 'b', 'c']
      .map(itemString => itemString.toUpperCase())
      .filter(itemString => itemString !== 'B')
      .reduce((accString, itemString) => accString + itemString, '');
    `,

    // Test 9: Class methods with parameters that use Hungarian notation
    `
    class TestClass {
      process(inputString: string) {
        return inputString.toLowerCase();
      }
    }

    const instance = new TestClass();
    instance.process('TEST');
    `,

    // Test 10: Imported functions with parameters that use Hungarian notation
    `
    import { processData } from './utils';

    const result = processData('inputString', 42);
    `,

    // Test 11: Function expressions with parameters that use Hungarian notation
    `
    const fn = function(paramString: string) {
      return paramString.trim();
    };

    fn('  test  ');
    `,

    // Test 12: Arrow functions with parameters that use Hungarian notation
    `
    const formatText = (paramString: string) => paramString.trim();
    formatText('  test  ');
    `,

    // Test 13: Callback functions with parameters that use Hungarian notation
    `
    [1, 2, 3].forEach(function(itemNumber) {
      console.log(itemNumber * 2);
    });
    `,

    // Test 14: Event handlers with parameters that use Hungarian notation
    `
    document.addEventListener('click', function(eventObject) {
      console.log(eventObject.target);
    });
    `,

    // Test 15: Higher-order functions with parameters that use Hungarian notation
    `
    function createProcessor(transformFn: (paramString: string) => string) {
      return function(input: string) {
        return transformFn(input);
      };
    }

    const processor = createProcessor(paramString => paramString.toUpperCase());
    `,

    // Test 16: Function calls with object literals that have properties with Hungarian notation
    `
    function processConfig(config: any) {
      return config.name;
    }

    processConfig({ nameString: 'John', ageNumber: 30 });
    `,

    // Test 17: Function calls with array literals that contain elements with Hungarian notation
    `
    function processItems(items: string[]) {
      return items.join(', ');
    }

    processItems(['itemString1', 'itemString2', 'itemString3']);
    `,

    // Test 18: Function calls with template literals that contain expressions with Hungarian notation
    `
    function processTemplate(template: string) {
      return template.trim();
    }

    const name = 'John';
    processTemplate(\`Hello, \${name}!\`);
    `,

    // Test 19: Function calls with spread operators that use variables with Hungarian notation
    `
    function processArgs(...args: any[]) {
      return args.join(', ');
    }

    const items = [1, 2, 3];
    processArgs(...items);
    `,

    // Test 20: Function calls with destructuring that use variables with Hungarian notation
    `
    function processUser({ name, age }: { name: string, age: number }) {
      return \`\${name} is \${age} years old\`;
    }

    const userData = { name: 'John', age: 30 };
    processUser(userData);
    `,

    // Test 21: External library function calls with parameters that use Hungarian notation
    `
    import axios from 'axios';

    async function fetchData(urlString: string) {
      const response = await axios.get(urlString, {
        params: { paramString: 'value' }
      });
      return response.data;
    }
    `,

    // Test 22: Function calls with optional parameters that use Hungarian notation
    `
    function processWithOptions(text: string, optionsObject?: { trim?: boolean }) {
      return optionsObject?.trim ? text.trim() : text;
    }

    processWithOptions('  test  ', { trim: true });
    `,

    // Test 23: Function calls with default parameters that use Hungarian notation
    `
    function processWithDefaults(text: string, defaultValueString: string = '') {
      return text || defaultValueString;
    }

    processWithDefaults('', 'default');
    `
  ],
  invalid: []
});
