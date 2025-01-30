import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceExportedFunctionTypes } from '../rules/enforce-exported-function-types';

ruleTesterJsx.run('enforce-exported-function-types', enforceExportedFunctionTypes, {
  valid: [
    // Valid case: imported type used in exported function
    {
      code: `
        import { SafeTimestamp } from '../../util/firestore/timestamp';

        export type PhaseChangeTaskPayload = {
          gameId: string;
          tournamentId: string;
          phase: TournamentPhase;
        } & RequireOnlyOne<{
          epochMillis: number;
          time: SafeTimestamp;
        }>;

        export function processPhaseChange(payload: PhaseChangeTaskPayload): void {
          // Implementation
        }
      `,
    },
    // Valid case: exported type with exported function
    {
      code: `
        export type NotificationActions = {
          markAsRead: (toId: string, notificationId: string) => Promise<void>;
          markAsArchived: (toId: string, notificationId: string) => Promise<void>;
        };

        export function useUpdateNotification(): NotificationActions {
          return {
            markAsRead: async (toId, notificationId) => {},
            markAsArchived: async (toId, notificationId) => {},
          };
        }
      `,
    },
    // Valid case: exported props type with React component
    {
      code: `
        export type NotificationBannerProps = {
          message: string;
          onClose: () => void;
        };

        export function NotificationBanner(props: NotificationBannerProps) {
          return (
            <div>
              <p>{props.message}</p>
              <button onClick={props.onClose}>Close</button>
            </div>
          );
        }
      `,
    },
    // Valid case: non-exported function with non-exported type
    {
      code: `
        type InternalType = {
          value: string;
        };

        function internalFunction(param: InternalType): InternalType {
          return param;
        }
      `,
    },
    // Valid case: primitive types
    {
      code: `
        export function simpleFunction(value: string): number {
          return 42;
        }
      `,
    },
    // Valid case: generic type with exported base type
    {
      code: `
        export type AuthenticatedRequest<T> = {
          data: T;
          auth: {
            uid: string;
          };
        };

        export type Params = {
          gameId: string;
          previousId?: string;
          groupId: string;
        };

        export const createTemplateTournament = async (
          request: AuthenticatedRequest<Params>
        ) => {
          return { tournamentNew: request.data };
        };
      `,
    },
    // Valid case: generic type with exported base type and return type
    {
      code: `
        export type AuthenticatedRequest<T> = {
          data: T;
          auth: {
            uid: string;
          };
        };

        export type Params = {
          gameId: string;
          previousId?: string;
          groupId: string;
        };

        export type Response = Promise<{
          tournamentNew: Tournament;
        }>;

        export const createTemplateTournament = async (
          request: AuthenticatedRequest<Params>
        ): Response => {
          return { tournamentNew: request.data };
        };
      `,
    },
  ],
  invalid: [
    // Invalid case: non-exported type with exported function
    {
      code: `
        type NotificationActions = {
          markAsRead: (toId: string, notificationId: string) => Promise<void>;
        };

        export function useUpdateNotification(): NotificationActions {
          return {
            markAsRead: async (toId, notificationId) => {},
          };
        }
      `,
      errors: [
        {
          messageId: 'missingExportedReturnType',
          data: { typeName: 'NotificationActions' },
        },
      ],
    },
    // Invalid case: non-exported props type with React component
    {
      code: `
        type NotificationBannerProps = {
          message: string;
          onClose: () => void;
        };

        export function NotificationBanner(props: NotificationBannerProps) {
          return (
            <div>
              <p>{props.message}</p>
              <button onClick={props.onClose}>Close</button>
            </div>
          );
        }
      `,
      errors: [
        {
          messageId: 'missingExportedPropsType',
          data: { typeName: 'NotificationBannerProps' },
        },
      ],
    },
    // Invalid case: non-exported parameter type
    {
      code: `
        type Config = {
          timeout: number;
        };

        export function initializeApp(config: Config) {
          return config;
        }
      `,
      errors: [
        {
          messageId: 'missingExportedType',
          data: { typeName: 'Config' },
        },
      ],
    },
    // Invalid case: arrow function with non-exported return type
    {
      code: `
        type Result = {
          value: string;
        };

        export const getData = (): Result => {
          return { value: 'test' };
        };
      `,
      errors: [
        {
          messageId: 'missingExportedReturnType',
          data: { typeName: 'Result' },
        },
      ],
    },
    // Invalid case: non-exported generic base type
    {
      code: `
        type AuthenticatedRequest<T> = {
          data: T;
          auth: {
            uid: string;
          };
        };

        export type Params = {
          gameId: string;
          previousId?: string;
          groupId: string;
        };

        export const createTemplateTournament = async (
          request: AuthenticatedRequest<Params>
        ) => {
          return { tournamentNew: request.data };
        };
      `,
      errors: [
        {
          messageId: 'missingExportedType',
          data: { typeName: 'AuthenticatedRequest' },
        },
      ],
    },
    // Invalid case: non-exported generic parameter type
    {
      code: `
        export type AuthenticatedRequest<T> = {
          data: T;
          auth: {
            uid: string;
          };
        };

        type Params = {
          gameId: string;
          previousId?: string;
          groupId: string;
        };

        export const createTemplateTournament = async (
          request: AuthenticatedRequest<Params>
        ) => {
          return { tournamentNew: request.data };
        };
      `,
      errors: [
        {
          messageId: 'missingExportedType',
          data: { typeName: 'Params' },
        },
      ],
    },
  ],
});
