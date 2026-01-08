import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFExtensionForEntryPoints } from '../rules/enforce-f-extension-for-entry-points';

ruleTesterTs.run(
  'enforce-f-extension-for-entry-points',
  enforceFExtensionForEntryPoints,
  {
    valid: [
      // 1. Correct extension (.f.ts)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/deleteUser.f.ts',
      },
      // 2. Not in functions/src/
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/src/other/deleteUser.ts',
      },
      // 3. Test file (.test.ts)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/deleteUser.test.ts',
      },
      // 4. Spec file (.spec.ts)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/deleteUser.spec.ts',
      },
      // 15. Test file (.test.tsx)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => <div />);`,
        filename: '/workspace/functions/src/callable/user/deleteUser.test.tsx',
      },
      // 16. Spec file (.spec.tsx)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => <div />);`,
        filename: '/workspace/functions/src/callable/user/deleteUser.spec.tsx',
      },
      // 17. Default import from a local file (should be ignored)
      {
        code: `import onCall from './localHelper'; onCall();`,
        filename: '/workspace/functions/src/util/myFunc.ts',
      },
      // 18. Default import from an allowed source (should be checked)
      {
        code: `import onCall from '../../v2/https/onCall'; onCall();`,
        filename: '/workspace/functions/src/callable/user/myFunc.f.ts',
      },
      // 19. Precision path check (should ignore if functions/src/ is just a substring)
      {
        code: `import { onCall } from '../../v2/https/onCall'; onCall();`,
        filename: '/workspace/myfunctions/src/deleteUser.ts',
      },
      // 20. Precision path check (should match if it starts with functions/src/)
      {
        code: `import { onCall } from '../../v2/https/onCall'; onCall();`,
        filename: 'functions/src/deleteUser.f.ts',
      },
      // 5. Defining the wrapper (FunctionDeclaration)
      {
        code: `export function onCall() {}`,
        filename: '/workspace/functions/src/v2/https/onCall.ts',
      },
      // 6. Defining the wrapper (VariableDeclaration)
      {
        code: `export const onCall = () => {}`,
        filename: '/workspace/functions/src/v2/https/onCall.ts',
      },
      // 7. Locally defined function with same name (not imported)
      {
        code: `function onCall() {} onCall();`,
        filename: '/workspace/functions/src/util/myFunc.ts',
      },
      // 8. Not top-level call (inside another function)
      {
        code: `import { onCall } from '../../v2/https/onCall'; function setup() { onCall(() => {}); }`,
        filename: '/workspace/functions/src/util/myFunc.ts',
      },
      // 9. Call to a function that is NOT an entry point
      {
        code: `import { otherFunc } from './other'; otherFunc();`,
        filename: '/workspace/functions/src/util/myFunc.ts',
      },
      // 10. Call to a function that is an import but not an entry point wrapper
      {
        code: `import { onCall } from './localOnCall'; onCall();`,
        filename: '/workspace/functions/src/util/myFunc.ts',
      },
      // 11. JSX file with .f.tsx extension
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => <div />);`,
        filename: '/workspace/functions/src/callable/user/Component.f.tsx',
      },
      // 12. Multiple entry points in one .f.ts file
      {
        code: `import { onCall } from '../../v2/https/onCall'; export const a = onCall(() => {}); export const b = onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/auth.f.ts',
      },
      // 13. Export default function definition exemption
      {
        code: `export default function onCall() {}`,
        filename: '/workspace/functions/src/v2/https/onCall.ts',
      },
      // 14. MemberExpression call exemption
      {
        code: `import * as functions from 'firebase-functions'; functions.https.onCall(() => {});`,
        filename: '/workspace/functions/src/util/legacy.ts',
      },
      // 15. non-identifier callee (should be ignored)
      {
        code: `import { onCall } from '../../v2/https/onCall'; const getCall = () => onCall; getCall()(() => {});`,
        filename: '/workspace/functions/src/callable/user/nonIdentifier.ts',
      },
      // 16. multiple exports, hitting isDefiningEntryPoint
      {
        code: `export const onCall = () => {}; export const other = onCall(() => {});`,
        filename: '/workspace/functions/src/v2/https/onCall.ts',
      },
      // 17. ExportDefaultDeclaration hit (should be ignored if in correct file)
      {
        code: `export const onCall = () => {}; export default function onCall() {};`,
        filename: '/workspace/functions/src/v2/https/onCall.ts',
      },
      // 18. Namespace import from an allowed source
      {
        code: `import * as onCall from '../../v2/https/onCall'; onCall();`,
        filename: '/workspace/functions/src/callable/user/myFunc.f.ts',
      },
      // 19. Default import with extension
      {
        code: `import onCall from '../../v2/https/onCall.ts'; onCall();`,
        filename: '/workspace/functions/src/callable/user/myFunc.f.ts',
      },
      // 21. Import with no slashes in path
      {
        code: `import onCall from 'onCall'; onCall();`,
        filename: '/workspace/functions/src/callable/user/noSlash.f.ts',
      },
      // 22. Not an ImportBinding (should be covered by case 20, but let's be explicit)
      {
        code: `const onCall = () => {}; onCall();`,
        filename: '/workspace/functions/src/callable/user/localConst.ts',
      },
    ],

    invalid: [
      // 1. Basic violation (.ts calling onCall)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/deleteUser.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'deleteUser.ts',
              entryPoint: 'onCall',
              suggestedName: 'deleteUser.f.ts',
            },
          },
        ],
      },
      // 2. violation with onCallVaripotent
      {
        code: `import { onCallVaripotent } from '../../v2/https/onCall'; export default onCallVaripotent(() => {});`,
        filename: '/workspace/functions/src/callable/scripts/upsert.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'upsert.ts',
              entryPoint: 'onCallVaripotent',
              suggestedName: 'upsert.f.ts',
            },
          },
        ],
      },
      // 3. violation with onRequest
      {
        code: `import { onRequest } from '../../v2/https/onRequest'; export default onRequest(() => {});`,
        filename: '/workspace/functions/src/queues/tasks/sync.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'sync.ts',
              entryPoint: 'onRequest',
              suggestedName: 'sync.f.ts',
            },
          },
        ],
      },
      // 4. violation with sequentialDocumentWritten
      {
        code: `import { sequentialDocumentWritten } from '../../v2/firestore/sequentialDocumentWritten'; export default sequentialDocumentWritten({}, []);`,
        filename: '/workspace/functions/src/firestore/Membership/onWrite.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'onWrite.ts',
              entryPoint: 'sequentialDocumentWritten',
              suggestedName: 'onWrite.f.ts',
            },
          },
        ],
      },
      // 5. Aliased import violation
      {
        code: `import { onCall as firebaseOnCall } from '../../v2/https/onCall'; export default firebaseOnCall(() => {});`,
        filename: '/workspace/functions/src/callable/myFunction.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'myFunction.ts',
              entryPoint: 'firebaseOnCall',
              suggestedName: 'myFunction.f.ts',
            },
          },
        ],
      },
      // 6. Direct variable assignment
      {
        code: `import { onWebhook } from '../util/webhook/onWebhook'; const handler = onWebhook({}); export default handler;`,
        filename: '/workspace/functions/src/webhooks/mux.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'mux.ts',
              entryPoint: 'onWebhook',
              suggestedName: 'mux.f.ts',
            },
          },
        ],
      },
      // 7. Multiple violations (only first one reported because of 'reported' flag)
      {
        code: `import { onCall } from '../../v2/https/onCall'; export const a = onCall(() => {}); export const b = onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/auth.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'auth.ts',
              entryPoint: 'onCall',
              suggestedName: 'auth.f.ts',
            },
          },
        ],
      },
      // 8. .tsx file violation
      {
        code: `import { onCall } from '../../v2/https/onCall'; export default onCall(() => <div />);`,
        filename: '/workspace/functions/src/callable/user/Component.tsx',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'Component.tsx',
              entryPoint: 'onCall',
              suggestedName: 'Component.f.tsx',
            },
          },
        ],
      },
      // 9. onSchedule violation
      {
        code: `import { onSchedule } from 'firebase-functions/v2/scheduler'; onSchedule('every 5 minutes', () => {});`,
        filename: '/workspace/functions/src/schedulers/cleanup.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'cleanup.ts',
              entryPoint: 'onSchedule',
              suggestedName: 'cleanup.f.ts',
            },
          },
        ],
      },
      // 10. onDocumentCreated violation
      {
        code: `import { onDocumentCreated } from 'firebase-functions/v2/firestore'; onDocumentCreated('path', () => {});`,
        filename: '/workspace/functions/src/firestore/onCreated.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'onCreated.ts',
              entryPoint: 'onDocumentCreated',
              suggestedName: 'onCreated.f.ts',
            },
          },
        ],
      },
      // 11. default import violation
      {
        code: `import onCall from '../../v2/https/onCall'; export default onCall(() => {});`,
        filename: '/workspace/functions/src/callable/user/defaultImport.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'defaultImport.ts',
              entryPoint: 'onCall',
              suggestedName: 'defaultImport.f.ts',
            },
          },
        ],
      },
      // 12. default import with non-matching local name violation
      {
        code: `import myHandler from '../../v2/https/onCall'; export default myHandler(() => {});`,
        filename:
          '/workspace/functions/src/callable/user/nonMatchingDefault.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'nonMatchingDefault.ts',
              entryPoint: 'myHandler',
              suggestedName: 'nonMatchingDefault.f.ts',
            },
          },
        ],
      },
      // 13. default import with non-matching local name violation (onRequest)
      {
        code: `import reqHandler from '../../v2/https/onRequest'; export default reqHandler(() => {});`,
        filename:
          '/workspace/functions/src/callable/user/nonMatchingRequest.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'nonMatchingRequest.ts',
              entryPoint: 'reqHandler',
              suggestedName: 'nonMatchingRequest.f.ts',
            },
          },
        ],
      },
      // 14. Namespace import violation
      {
        code: `import * as onCall from '../../v2/https/onCall'; onCall();`,
        filename: '/workspace/functions/src/callable/user/namespaceImport.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'namespaceImport.ts',
              entryPoint: 'onCall',
              suggestedName: 'namespaceImport.f.ts',
            },
          },
        ],
      },
      // 15. Default import with extension violation
      {
        code: `import onCall from '../../v2/https/onCall.ts'; onCall();`,
        filename: '/workspace/functions/src/callable/user/defaultWithExt.ts',
        errors: [
          {
            messageId: 'requireFExtension',
            data: {
              fileName: 'defaultWithExt.ts',
              entryPoint: 'onCall',
              suggestedName: 'defaultWithExt.f.ts',
            },
          },
        ],
      },
    ],
  },
);
