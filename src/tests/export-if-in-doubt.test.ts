import { exportIfInDoubt } from '../rules/export-if-in-doubt';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('export-if-in-doubt', exportIfInDoubt, {
  valid: [
    // Exporting const
    "export const myConst = 'Hello';",

    // Exporting function
    'export function myFunction() {}',

    // Exporting type
    'export type MyType = string;',

    // Function body (should not enforce rule within function bodies)
    "export function myFunction() { const myConst = 'Hello'; }",
    // Named export
    "function myFunction() { const myConst = 'Hello'; }; export { myFunction };",
    // Default export
    "export default function myFunction() { const myConst = 'Hello'; }",
    // Named as default export
    "function myFunction() { const myConst = 'Hello'; }; export { myFunction as default };",

    // `export default <identifier>` publishes the declaration it names, in every
    // spelling the declaration can take.
    'const myConst = 1;\nexport default myConst;',
    'function myFunction() {}\nexport default myFunction;',
    'const myArrow = () => 1;\nexport default myArrow;',

    // Hoisting makes this legal, and the rule must not depend on the export
    // appearing after the declaration.
    'export default myFunction;\nfunction myFunction() {}',

    // Default-exporting an imported binding declares nothing locally.
    "import myImport from 'z';\nexport default myImport;",

    // Classes are not tracked as top-level declarations at all.
    'export default class MyClass {}',

    `import { https } from 'firebase-functions';
        import { UserItem } from '../../types/firestore/User/UserItem';
        import { db } from '../../config/firebaseAdmin';
        import {
          CollectionReference,
          DocumentReference,
        } from 'firebase-admin/firestore';
        import { UserItemCacher } from '../../util/UserItemCacher';
        import { User } from '../../types/firestore/User';
        
        export type ListAssetsImxPayload = {
          address: string;
          userId: string;
        };
        
        export const listAssetsImx = https.onRequest(async (req, res) => {
          const { address, userId } = req.body as ListAssetsImxPayload;
        
          const userRef = db.doc("User/\${userId}") as DocumentReference<User>;
          const userItemRef = userRef.collection(
            'UserItem',s
          ) as CollectionReference<UserItem>;
        
          const cacher = new UserItemCacher(userItemRef, [address]);
          await cacher.cacheFromProvider('imx');
        
          res.sendStatus(200);
        });
        
        export { listAssetsImx as default };
        `,
  ],
  invalid: [
    {
      code: "const myConst = 'Hello';",
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'myConst',
            kind: 'const',
            exportExample: 'export const myConst = …;',
          },
        },
      ],
    },
    {
      code: 'function myFunction() {}',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'myFunction',
            kind: 'function',
            exportExample: 'export function myFunction(…) { … }',
          },
        },
      ],
    },
    {
      code: 'type MyType = string;',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'MyType',
            kind: 'type',
            exportExample: 'export type MyType = …;',
          },
        },
      ],
    },
    // The suggested example must stay a placeholder: pasting it verbatim may
    // never replace the initializer, the parameters/body, or the aliased type.
    {
      code: 'const config = { retries: 3, timeout: 5000 };',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'config',
            kind: 'const',
            exportExample: 'export const config = …;',
          },
        },
      ],
    },
    {
      code: 'let counter = 0;',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'counter',
            kind: 'let',
            exportExample: 'export let counter = …;',
          },
        },
      ],
    },
    {
      code: 'var legacyFlag = true;',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'legacyFlag',
            kind: 'var',
            exportExample: 'export var legacyFlag = …;',
          },
        },
      ],
    },
    {
      code: 'function computeTotal(a: number, b: number) { return a + b; }',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'computeTotal',
            kind: 'function',
            exportExample: 'export function computeTotal(…) { … }',
          },
        },
      ],
    },
    {
      code: 'type UserRecord = { id: string; name: string };',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'UserRecord',
            kind: 'type',
            exportExample: 'export type UserRecord = …;',
          },
        },
      ],
    },
    // Pinning the fully rendered message guards the template itself: a future
    // edit that fabricates a concrete value inside it fails here too.
    {
      code: 'const config = { retries: 3 };',
      errors: [
        {
          message:
            'What\'s wrong: Top-level const "config" is not exported. Why it matters: Top-level declarations define your module\'s public API; leaving this unexported makes it unusable from other files and hides reusable utilities (often resulting in dead code or duplicated implementations). How to fix: Export it (for example: export const config = …;) or move it into a narrower scope if it is intentionally private.',
        },
      ],
    },
    // A name that only flows INTO the default export is still unimportable, so
    // recognizing `export default <identifier>` must not suppress these.
    {
      code: 'const myConst = 1;\nexport default wrap(myConst);',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'myConst',
            kind: 'const',
            exportExample: 'export const myConst = …;',
          },
        },
      ],
    },
    {
      code: 'const myConst = 1;\nexport default { myConst };',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'myConst',
            kind: 'const',
            exportExample: 'export const myConst = …;',
          },
        },
      ],
    },
    {
      code: 'const myConst = 1;\nexport default 42;',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'myConst',
            kind: 'const',
            exportExample: 'export const myConst = …;',
          },
        },
      ],
    },
    // Only the default-exported name is spared; its siblings still report.
    {
      code: 'const exported = 1;\nconst unexported = 2;\nexport default exported;',
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'unexported',
            kind: 'const',
            exportExample: 'export const unexported = …;',
          },
        },
      ],
    },
    {
      code: `import { https } from 'firebase-functions';
        import { UserItem } from '../../types/firestore/User/UserItem';
        import { db } from '../../config/firebaseAdmin';
        import {
          CollectionReference,
          DocumentReference,
        } from 'firebase-admin/firestore';
        import { UserItemCacher } from '../../util/UserItemCacher';
        import { User } from '../../types/firestore/User';

        type ListAssetsImxPayload = {
          address: string;
          userId: string;
        };
        
        export const listAssetsImx = https.onRequest(async (req, res) => {
          const { address, userId } = req.body as ListAssetsImxPayload;
        
          const userRef = db.doc("User/\${userId}") as DocumentReference<User>;
          const userItemRef = userRef.collection(
            'UserItem',
          ) as CollectionReference<UserItem>;
        
          const cacher = new UserItemCacher(userItemRef, [address]);
          await cacher.cacheFromProvider('imx');
        
          res.sendStatus(200);
        });
        
        export { listAssetsImx as default };
        `,
      errors: [
        {
          messageId: 'exportIfInDoubt',
          data: {
            name: 'ListAssetsImxPayload',
            kind: 'type',
            exportExample: 'export type ListAssetsImxPayload = …;',
          },
        },
      ],
    },
  ],
});
