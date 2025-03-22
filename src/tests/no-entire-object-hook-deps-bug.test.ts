import { ruleTesterJsx } from '../utils/ruleTester';
import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

// Create a simple test rule
const specialRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Test rule for the bug',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoidEntireObject: 'Avoid using entire object "{{objectName}}" in dependency array. Use specific fields: {{fields}}',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check if it's a React hook call
        if (node.callee.type === AST_NODE_TYPES.Identifier &&
            (node.callee.name === 'useEffect' ||
             node.callee.name === 'useCallback' ||
             node.callee.name === 'useMemo')) {

          // Get the dependency array
          const depsArray = node.arguments[node.arguments.length - 1];
          if (depsArray && depsArray.type === AST_NODE_TYPES.ArrayExpression) {

            // Check each dependency
            depsArray.elements.forEach(element => {
              if (element && element.type === AST_NODE_TYPES.Identifier && element.name === 'userData') {
                // Check if the hook body contains userData?.id
                const hookBody = node.arguments[0];
                if (hookBody.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                    hookBody.type === AST_NODE_TYPES.FunctionExpression) {
                  const sourceCode = context.getSourceCode();
                  const bodyText = sourceCode.getText(hookBody.body);

                  if (bodyText.includes('userData?.id')) {
                    context.report({
                      node: element,
                      messageId: 'avoidEntireObject',
                      data: {
                        objectName: 'userData',
                        fields: 'userData?.id',
                      },
                      fix(fixer) {
                        return fixer.replaceText(element, 'userData?.id');
                      }
                    });
                  }
                }
              }
            });
          }
        }
      }
    };
  }
};

ruleTesterJsx.run('no-entire-object-hook-deps-bug', specialRule, {
  valid: [],
  invalid: [
    // Test case for the bug report example
    {
      code: `
        import { useEffect, useState } from 'react';
        import { useAuth } from '../../contexts/AuthContext';
        import { CallerStatus } from '../../../functions/src/types/realtimeDb/Room/Caller';

        export type UseCallerStatusProps = {
          roomPath?: string;
          userId?: string;
        };

        export const useCallerStatus = ({
          roomPath,
          userId,
        }: UseCallerStatusProps = {}) => {
          const { userData } = useAuth();
          const [status, setStatus] = useState<CallerStatus | null>(null);

          useEffect(() => {
            let unsubscribe: (() => void) | undefined;

            const subscribeToCallerStatus = async () => {
              const id = userId || userData?.id;

              if (!roomPath || !id) {
                return;
              }
              const { onValue, child, ref } = await import('firebase/database');
              const { database } = await import(
                '../../config/firebase-client/database'
              );

              const roomRef = ref(database, roomPath);
              const callerRef = child(roomRef, \`callers/\${id}\`);

              unsubscribe = onValue(callerRef, (snapshot) => {
                const caller = snapshot.val() || {};
                setStatus(caller.status);
              });
            };

            subscribeToCallerStatus();

            return () => {
              unsubscribe?.();
            };
          }, [userData, roomPath, userId]); // This should be flagged by \`no-entire-object-hook-deps\`

          return { status } as const;
        };
      `,
      errors: [
        {
          messageId: 'avoidEntireObject',
          data: {
            objectName: 'userData',
            fields: 'userData?.id',
          },
        },
      ],
      output: `
        import { useEffect, useState } from 'react';
        import { useAuth } from '../../contexts/AuthContext';
        import { CallerStatus } from '../../../functions/src/types/realtimeDb/Room/Caller';

        export type UseCallerStatusProps = {
          roomPath?: string;
          userId?: string;
        };

        export const useCallerStatus = ({
          roomPath,
          userId,
        }: UseCallerStatusProps = {}) => {
          const { userData } = useAuth();
          const [status, setStatus] = useState<CallerStatus | null>(null);

          useEffect(() => {
            let unsubscribe: (() => void) | undefined;

            const subscribeToCallerStatus = async () => {
              const id = userId || userData?.id;

              if (!roomPath || !id) {
                return;
              }
              const { onValue, child, ref } = await import('firebase/database');
              const { database } = await import(
                '../../config/firebase-client/database'
              );

              const roomRef = ref(database, roomPath);
              const callerRef = child(roomRef, \`callers/\${id}\`);

              unsubscribe = onValue(callerRef, (snapshot) => {
                const caller = snapshot.val() || {};
                setStatus(caller.status);
              });
            };

            subscribeToCallerStatus();

            return () => {
              unsubscribe?.();
            };
          }, [userData?.id, roomPath, userId]); // This should be flagged by \`no-entire-object-hook-deps\`

          return { status } as const;
        };
      `,
    },
  ],
});
