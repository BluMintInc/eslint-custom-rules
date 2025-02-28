import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian-function-call', noHungarian, {
  valid: [
    // The bug case: function call with a parameter that uses Hungarian notation
    // This should be valid because we're not defining the function, just calling it
    `
    import type { NextRequest } from 'next/server';

    const isSitemap = (pathname: string) => {
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
    `
  ],
  invalid: []
});
