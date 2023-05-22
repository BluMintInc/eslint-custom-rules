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
            'UserItem',
          ) as CollectionReference<UserItem>;
        
          const cacher = new UserItemCacher(userItemRef, [address]);
          await cacher.cacheFromProvider('imx');
        
          res.sendStatus(200);
        });
        
        export { listAssetsImx as default };
        `,
  ],
  invalid: [
    // Not exporting const
    "const myConst = 'Hello';",

    // Not exporting function
    'function myFunction() {}',

    // Not exporting type
    'type MyType = string;',

    `import { https } from 'firebase-functions';
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
  ].map((testCase) => {
    return {
      code: testCase,
      errors: [{ messageId: 'exportIfInDoubt' }],
    };
  }),
});
