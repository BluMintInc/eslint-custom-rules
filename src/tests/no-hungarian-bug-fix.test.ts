import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

// This test specifically tests the bug fix for the issue where the rule was incorrectly
// flagging function invocations like pathname.startsWith('/sitemap')
ruleTesterTs.run('no-hungarian-bug-fix', noHungarian, {
  valid: [
    // The bug case: function call with a parameter that uses Hungarian notation
    // This should be valid because we're not defining the function, just calling it
    `
    function checkSitemap(pathname: string) {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    }
    `,

    // Test with string methods that have parameters with Hungarian notation
    `
    function processString(text: string) {
      return text.replace(/strPattern/g, 'replacement');
    }
    `,

    // Test with array methods that have parameters with Hungarian notation
    `
    function processArray(items: string[]) {
      return items.filter(itemString => itemString.length > 0);
    }
    `,

    // Test with object methods that have parameters with Hungarian notation
    `
    function processObject(obj: Record<string, any>) {
      return Object.keys(obj).filter(keyString => keyString.startsWith('prefix'));
    }
    `,

    // Test with custom functions that have parameters with Hungarian notation
    `
    function customFunction(paramString: string) {
      return paramString.trim();
    }

    function callCustomFunction() {
      return customFunction('test');
    }
    `
  ],
  invalid: []
});
