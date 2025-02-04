import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceExportedFunctionTypes } from '../rules/enforce-exported-function-types';

ruleTesterJsx.run(
  'enforce-exported-function-types',
  enforceExportedFunctionTypes,
  {
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
      // Valid case: imported generic type used in exported function
      {
        code: `
        import { Result } from '../../util/result';
        import { SafeTimestamp } from '../../util/firestore/timestamp';

        export function processTimestamp(time: SafeTimestamp): Result<Date> {
          return { success: true, data: time.toDate() };
        }
      `,
      },
      // Valid case: imported base type with local generic type
      {
        code: `
        import { BaseRequest } from '../../util/request';

        export type AuthenticatedRequest<T> = BaseRequest & {
          data: T;
          auth: {
            uid: string;
          };
        };

        export type Params = {
          gameId: string;
        };

        export function handleRequest(req: AuthenticatedRequest<Params>): void {
          // Implementation
        }
      `,
      },
      // Valid case: imported generic type with imported type parameter
      {
        code: `
        import { Result } from '../../util/result';
        import { User } from '../../models/user';

        export function getUser(id: string): Result<User> {
          return { success: true, data: { id, name: 'Test' } };
        }
      `,
      },
      // Valid case: multiple imported types in type intersection
      {
        code: `
        import { BaseEntity } from '../../models/base';
        import { Timestamps } from '../../util/timestamps';
        import { Metadata } from '../../util/metadata';

        export function createEntity(): BaseEntity & Timestamps & Metadata {
          return {
            id: '123',
            createdAt: new Date(),
            updatedAt: new Date(),
            meta: {}
          };
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
      // Valid case: generic type parameter in exported function
      {
        code: `
        import { DocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
        import { Change } from 'firebase-functions/core';

        export const removeFromUserGroups = async <TData extends DocumentData>(
          change: Change<DocumentSnapshot<TData>>,
        ) => {
          // Implementation
        };
      `,
      },
      // Valid case: imported type used in exported function parameter
      {
        code: `
        import { SafeTimestamp } from '../types/SafeTimestamp';

        export function processTimestamp(timestamp: SafeTimestamp) {
          // Implementation
        }
      `,
      },
      // Valid case: imported type used in exported function return type
      {
        code: `
        import { SafeTimestamp } from '../types/SafeTimestamp';

        export function getCurrentTimestamp(): SafeTimestamp {
          // Implementation
          return { seconds: 0, nanoseconds: 0 };
        }
      `,
      },
      // Valid case: imported type used in exported arrow function
      {
        code: `
        import { SafeTimestamp } from '../types/SafeTimestamp';

        export const processTimestamp = (timestamp: SafeTimestamp): SafeTimestamp => {
          // Implementation
          return timestamp;
        };
      `,
      },
      // Valid case: generic type parameter with constraint
      {
        code: `
        import { Timestamp } from 'firebase-admin/firestore';

        export const convertToDate = <TTime extends Timestamp | Date>(
          timestamp: TTime,
        ) => {
          return timestamp instanceof Timestamp
            ? timestamp.toDate()
            : (timestamp as Date);
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
  },
);
