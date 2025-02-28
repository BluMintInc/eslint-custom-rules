import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian-function-call', noHungarian, {
  valid: [
    // Test case for the bug: function call with 'isSitemap' should not be flagged
    `
    import type { NextRequest } from 'next/server';

    const isSitemap = (pathname: string) => {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    };

    export const isPassthrough = (request: NextRequest) => {
      return (
        request.nextUrl.pathname === '/firebase-messaging-sw.js' ||
        request.nextUrl.pathname === '/robots.txt' ||
        request.nextUrl.pathname === '/sitemap.xml' ||
        isSitemap(request.nextUrl.pathname)
      );
    };
    `,
    // Additional test cases for function calls
    `
    const isString = (value: any) => typeof value === 'string';
    const result = isString('test');
    `,
    `
    const hasNumber = (text: string) => /\d/.test(text);
    if (hasNumber('abc123')) {
      console.log('Contains a number');
    }
    `,
  ],
  invalid: [
    // Variables with Hungarian notation should still be flagged
    {
      code: `
      const nameString = "John";
      const ageNumber = 30;
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'nameString' } },
        { messageId: 'noHungarian', data: { name: 'ageNumber' } },
      ],
    },
    {
      code: `
      const strName = "John";
      const intAge = 30;
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'strName' } },
        { messageId: 'noHungarian', data: { name: 'intAge' } },
      ],
    },
  ],
});
