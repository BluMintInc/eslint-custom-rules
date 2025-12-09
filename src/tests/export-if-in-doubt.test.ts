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
            exportExample: 'export const myConst',
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
            exportExample: 'export function myFunction',
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
            exportExample: 'export type MyType',
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
            exportExample: 'export type ListAssetsImxPayload',
          },
        },
      ],
    },
  ],
});
