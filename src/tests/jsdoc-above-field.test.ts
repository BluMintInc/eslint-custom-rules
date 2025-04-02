import { ruleTesterTs } from '../utils/ruleTester';
import { jsdocAboveField } from '../rules/jsdoc-above-field';

ruleTesterTs.run('jsdoc-above-field', jsdocAboveField, {
  valid: [
    // JSDoc comment above field in interface
    `
    interface User {
      /** @remarks: right now it stores like this '+15168384181' */
      phone?: string;
    }
    `,
    // JSDoc comment above field in type
    `
    type User = {
      /** @remarks: right now it stores like this '+15168384181' */
      phone?: string;
    };
    `,
    // Multi-line JSDoc comment above field
    `
    interface User {
      /**
       * @remarks: right now it stores like this '+15168384181'
       * with multiple lines of documentation
       */
      phone?: string;
    }
    `,
    // Regular (non-JSDoc) comment inline is fine
    `
    interface User {
      phone?: string; // This is just a simple comment, not JSDoc
    }
    `,
    // JSDoc comment above field with decorators
    `
    class User {
      /** @email format */
      @Column()
      private readonly email?: string;
    }
    `,
  ],
  invalid: [
    // JSDoc comment inline after field in interface
    {
      code: `
      interface User {
        phone?: string; /** @remarks: right now it stores like this '+15168384181' */
      }
      `,
      errors: [{ messageId: 'moveJSDocAboveField' }],
      output: `
      interface User {
        /** @remarks: right now it stores like this '+15168384181' */
phone?: string;
      }
      `,
    },
    // JSDoc comment inline after field in type
    {
      code: `
      type User = {
        phone?: string; /** @remarks: right now it stores like this '+15168384181' */
      };
      `,
      errors: [{ messageId: 'moveJSDocAboveField' }],
      output: `
      type User = {
        /** @remarks: right now it stores like this '+15168384181' */
phone?: string;
      };
      `,
    },
    // JSDoc comment inline after field in class
    {
      code: `
      class User {
        phone?: string; /** @remarks: right now it stores like this '+15168384181' */
      }
      `,
      errors: [{ messageId: 'moveJSDocAboveField' }],
      output: `
      class User {
        /** @remarks: right now it stores like this '+15168384181' */
phone?: string;
      }
      `,
    },
    // JSDoc comment (with @) inline after field
    {
      code: `
      interface User {
        phone?: string; /* @remarks: right now it stores like this '+15168384181' */
      }
      `,
      errors: [{ messageId: 'moveJSDocAboveField' }],
      output: `
      interface User {
        /** @remarks: right now it stores like this '+15168384181' */
phone?: string;
      }
      `,
    },
    // JSDoc comment inline after field with decorators
    {
      code: `
      class User {
        @Column()
        private readonly email?: string; /** @email format */
      }
      `,
      errors: [{ messageId: 'moveJSDocAboveField' }],
      output: `
      class User {
        /** @email format */
@Column()
        private readonly email?: string;
      }
      `,
    },
  ],
});
