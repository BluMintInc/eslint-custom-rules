import { ruleTesterJsx } from '../utils/ruleTester';
import { noEntireObjectHookDeps } from '../rules/no-entire-object-hook-deps';

ruleTesterJsx.run('no-entire-object-hook-deps-bug', noEntireObjectHookDeps, {
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
