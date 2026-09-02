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
      // Valid case: generic type parameter in exported arrow function
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
      // Valid case: TypeScript utility type Record in exported function
      {
        code: `
        export type RoundCohort = {
          id: string;
          name: string;
        };

        export const findCohortRoundFrom = (
          rounds: Record<string, RoundCohort>,
          matchId: string,
        ) => {
          // Implementation
        };
      `,
      },
      // Valid case: TypeScript utility type Partial in exported function
      {
        code: `
        export type MatchCohort = {
          id: string;
          name: string;
          score: number;
        };

        export const transformCohortMatches = (
          matchesCohort: MatchCohort[],
          updateData: Partial<MatchCohort>,
        ) => {
          // Implementation
        };
      `,
      },
      // Valid case: Multiple TypeScript utility types in exported function
      {
        code: `
        export type User = {
          id: string;
          name: string;
          email: string;
          preferences: Record<string, unknown>;
        };

        export const updateUserPreferences = (
          users: Record<string, User>,
          updates: Record<string, Partial<Pick<User, 'preferences'>>>,
        ) => {
          // Implementation
        };
      `,
      },
      // Valid case: exported props type with arrow component
      {
        code: `
        export type BannerProps = {
          message: string;
        };

        export const Banner = (props: BannerProps) => <div>{props.message}</div>;
      `,
      },
      // Valid case: exported props type with memoized component
      {
        code: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
      },
      // Valid case: props type exported through an export specifier
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export { BannerProps };

        export const Banner = memo((props: BannerProps) => <div>{props.message}</div>);
      `,
      },
      // Valid case: imported props type with memoized component
      {
        code: `
        import { memo } from 'react';
        import { BannerProps } from './types';

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
      },
      // Valid case: untyped props parameter
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props) {
          return <div>{props.message}</div>;
        });
      `,
      },
      // Valid case: memo applied to a non-component function, which the
      // uppercase-name condition excludes exactly as it does for declarations
      {
        code: `
        import { memo } from 'react';

        type ComputeInput = {
          value: number;
        };

        export const compute = memo(function computeUnmemoized(input: ComputeInput) {
          return input.value * 2;
        });
      `,
      },
      // Valid case: component is not exported
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
      },
      // Valid case: non-exported arrow component
      {
        code: `
        type BannerProps = {
          message: string;
        };

        const Banner = (props: BannerProps) => <div>{props.message}</div>;
      `,
      },
      // Valid case: memo of an imported identifier, whose props type is
      // declared in another module and cannot be exported from this file
      {
        code: `
        import { memo } from 'react';
        import { BannerUnmemoized } from './BannerUnmemoized';

        export const Banner = memo(BannerUnmemoized);
      `,
      },
      // Valid case: default export of a memoized imported identifier
      {
        code: `
        import { memo } from 'react';
        import { BannerUnmemoized } from './BannerUnmemoized';

        export default memo(BannerUnmemoized);
      `,
      },
      // Valid case: an unresolvable identifier stays silent even when the file
      // declares a non-exported type of its own
      {
        code: `
        import { memo } from 'react';
        import { BannerUnmemoized } from './BannerUnmemoized';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo(BannerUnmemoized);
      `,
      },
      // Valid case: destructured props with an exported type
      {
        code: `
        export type BannerProps = {
          message: string;
        };

        export const Banner = ({ message }: BannerProps) => <div>{message}</div>;
      `,
      },
      // Valid case: destructured props annotated with an inline literal, which
      // names no contract a consumer could import
      {
        code: `
        export const Banner = ({ message }: { message: string }) => <div>{message}</div>;
      `,
      },
      // Valid case: destructured props with an imported type
      {
        code: `
        import { memo } from 'react';
        import { BannerProps } from './types';

        export const Banner = memo(({ message }: BannerProps) => <div>{message}</div>);
      `,
      },
      // Valid case: destructured props on a component that is not exported
      {
        code: `
        type BannerProps = {
          message: string;
        };

        const Banner = ({ message }: BannerProps) => <div>{message}</div>;
      `,
      },
      // Valid case: a resolved identifier whose props type is exported
      {
        code: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = memo(BannerUnmemoized);
      `,
      },
      // Valid case: a lowercase binding stays outside the props check whether
      // the wrapper argument is a function or a name
      {
        code: `
        import { memo } from 'react';

        type ComputeInput = {
          value: number;
        };

        function computeUnmemoized(input: ComputeInput) {
          return input.value * 2;
        }

        export const compute = memo(computeUnmemoized);
      `,
      },
      // Valid case: a resolved identifier that holds no function exposes no
      // parameter list
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = createBanner<BannerProps>();

        export const Banner = memo(BannerUnmemoized);
      `,
      },
      // Valid case: a bare identifier re-exports a value rather than declaring
      // a component here, so its props are the other declaration's concern
      {
        code: `
        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = BannerUnmemoized;
      `,
      },
      // Valid case: mutually aliased wrappers terminate instead of recursing
      {
        code: `
        import { memo } from 'react';

        const Alias = memo(Banner);

        export const Banner = memo(Alias);
      `,
      },
      // Valid case: destructured props with an exported type on a declaration
      {
        code: `
        export type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
      },
      // Valid case: a lowercase declaration keeps its parameters outside the
      // props check, so a destructured parameter stays unread there
      {
        code: `
        type ComputeInput = {
          value: number;
        };

        export function compute({ value }: ComputeInput) {
          return value * 2;
        }
      `,
      },
      // Valid case: a generic function expression names its own type parameter
      // in the props annotation, which no module can export
      {
        code: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export const List = memo(function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        });
      `,
      },
      // Valid case: the type parameter of a component resolved through an
      // identifier, whose declaration follows the export
      {
        code: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export const List = memo(ListUnmemoized);

        function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        }
      `,
      },
      // Valid case: the ref parameter stays outside the props contract when the
      // props are destructured
      {
        code: `
        import { forwardRef } from 'react';

        export type BannerProps = {
          message: string;
        };

        type BannerRef = HTMLDivElement;

        export const Banner = forwardRef(({ message }: BannerProps, ref: Ref<BannerRef>) => (
          <div ref={ref}>{message}</div>
        ));
      `,
      },
      // Valid case: anonymous default export without a component wrapper stays
      // outside the component shapes, matching the existing declaration path
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export default (props: BannerProps) => <div>{props.message}</div>;
      `,
      },
      // Valid case: built-in React props helper
      {
        code: `
        import { memo } from 'react';

        export const Banner = memo(function BannerUnmemoized(props: ComponentProps<'div'>) {
          return <div {...props} />;
        });
      `,
      },
      // Valid case: forwardRef component with exported props and built-in ref type
      {
        code: `
        import { forwardRef } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = forwardRef(function BannerUnwrapped(
          props: BannerProps,
          ref: Ref<HTMLDivElement>,
        ) {
          return <div ref={ref}>{props.message}</div>;
        });
      `,
      },
      // Valid case: the ref parameter is outside the props contract, so a
      // non-exported type there is not a props violation
      {
        code: `
        import { forwardRef } from 'react';

        export type BannerProps = {
          message: string;
        };

        type BannerRef = HTMLDivElement;

        export const Banner = forwardRef(function BannerUnwrapped(
          props: BannerProps,
          ref: Ref<BannerRef>,
        ) {
          return <div ref={ref}>{props.message}</div>;
        });
      `,
      },
      // Valid case: the split default export `require-memo` emits, whose props
      // type is exported
      {
        code: `
        import { memo } from '../util/memo';

        export type BannerProps = {
          message: string;
        };

        const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
        export default Banner;
      `,
      },
      // Valid case: the split default export with an imported props type, which
      // is already available to consumers
      {
        code: `
        import { memo } from '../util/memo';
        import { BannerProps } from './types';

        const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
        export default Banner;
      `,
      },
      // Valid case: a default-exported identifier that names an import, whose
      // props type is declared in another module
      {
        code: `
        import { Banner } from './Banner';

        export default Banner;
      `,
      },
      // Valid case: the split shape around an imported identifier, which
      // resolves to no local declaration
      {
        code: `
        import { memo } from '../util/memo';
        import { BannerUnmemoized } from './BannerUnmemoized';

        const Banner = memo(BannerUnmemoized);
        export default Banner;
      `,
      },
      // Valid case: the split shape on a lowercase binding, which the
      // component-name condition excludes exactly as it does for declarations
      {
        code: `
        import { memo } from '../util/memo';

        type ComputeInput = {
          value: number;
        };

        const compute = memo(function computeUnmemoized(input: ComputeInput) {
          return input.value * 2;
        });
        export default compute;
      `,
      },
      // Valid case: a default-exported identifier holding no function exposes
      // no parameter list
      {
        code: `
        type BannerProps = {
          message: string;
        };

        const Banner = createBanner<BannerProps>();
        export default Banner;
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
        // Only the props contract carries a fixer, so a return type stays as is
        output: null,
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
        output: `
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
        output: null,
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
        output: null,
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
        output: null,
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
        output: null,
        errors: [
          {
            messageId: 'missingExportedType',
            data: { typeName: 'Params' },
          },
        ],
      },
      // Invalid case: arrow component with non-exported props type
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export const Banner = (props: BannerProps) => <div>{props.message}</div>;
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export const Banner = (props: BannerProps) => <div>{props.message}</div>;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: function expression component with non-exported props type
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export const Banner = function (props: BannerProps) {
          return <div>{props.message}</div>;
        };
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export const Banner = function (props: BannerProps) {
          return <div>{props.message}</div>;
        };
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memoized function expression, the shape require-memo emits
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memoized arrow component
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo((props: BannerProps) => <div>{props.message}</div>);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = memo((props: BannerProps) => <div>{props.message}</div>);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: namespaced React.memo
      {
        code: `
        import React from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = React.memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: `
        import React from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = React.memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: forwardRef component
      {
        code: `
        import { forwardRef } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = forwardRef(function BannerUnwrapped(
          props: BannerProps,
          ref: Ref<HTMLDivElement>,
        ) {
          return <div ref={ref}>{props.message}</div>;
        });
      `,
        output: `
        import { forwardRef } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = forwardRef(function BannerUnwrapped(
          props: BannerProps,
          ref: Ref<HTMLDivElement>,
        ) {
          return <div ref={ref}>{props.message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: namespaced React.forwardRef with an arrow component
      {
        code: `
        import React from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = React.forwardRef((props: BannerProps, ref: Ref<HTMLDivElement>) => (
          <div ref={ref}>{props.message}</div>
        ));
      `,
        output: `
        import React from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = React.forwardRef((props: BannerProps, ref: Ref<HTMLDivElement>) => (
          <div ref={ref}>{props.message}</div>
        ));
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memo wrapped around forwardRef
      {
        code: `
        import { forwardRef, memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo(
          forwardRef(function BannerUnwrapped(props: BannerProps, ref: Ref<HTMLDivElement>) {
            return <div ref={ref}>{props.message}</div>;
          }),
        );
      `,
        output: `
        import { forwardRef, memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = memo(
          forwardRef(function BannerUnwrapped(props: BannerProps, ref: Ref<HTMLDivElement>) {
            return <div ref={ref}>{props.message}</div>;
          }),
        );
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: props declared as an interface
      {
        code: `
        import { memo } from 'react';

        interface BannerProps {
          message: string;
        }

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export interface BannerProps {
          message: string;
        }

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: default export of a memoized component
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export default memo(function Banner(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export default memo(function Banner(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: default export of an anonymous memoized component, where
      // the wrapper is the only evidence of component-hood
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export default memo((props: BannerProps) => <div>{props.message}</div>);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export default memo((props: BannerProps) => <div>{props.message}</div>);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: generic props type reports both the wrapper and its
      // argument, each pointing at its own declaration
      {
        code: `
        import { memo } from 'react';

        type ListProps<T> = {
          items: T[];
        };

        type Item = {
          id: string;
        };

        export const List = memo(function ListUnmemoized(props: ListProps<Item>) {
          return <div>{props.items.length}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export type Item = {
          id: string;
        };

        export const List = memo(function ListUnmemoized(props: ListProps<Item>) {
          return <div>{props.items.length}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'ListProps' },
          },
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'Item' },
          },
        ],
      },
      // Invalid case: merged interface declarations are reported without a fix,
      // since TypeScript rejects exporting only one of them
      {
        code: `
        import { memo } from 'react';

        interface BannerProps {
          message: string;
        }

        interface BannerProps {
          tone: string;
        }

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: null,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: a props type with no declaration in the file is reported
      // without a fix, since there is nothing local to export
      {
        code: `
        import { memo } from 'react';

        export const Banner = memo(function BannerUnmemoized(props: AmbientBannerProps) {
          return <div>{props.message}</div>;
        });
      `,
        output: null,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'AmbientBannerProps' },
          },
        ],
      },
      // Invalid case: destructured props on an arrow component
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export const Banner = ({ message }: BannerProps) => <div>{message}</div>;
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export const Banner = ({ message }: BannerProps) => <div>{message}</div>;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: destructured props with a default value, which nests an
      // assignment inside the pattern but leaves the annotation in place
      {
        code: `
        type BannerProps = {
          message?: string;
        };

        export const Banner = ({ message = 'hi' }: BannerProps) => <div>{message}</div>;
      `,
        output: `
        export type BannerProps = {
          message?: string;
        };

        export const Banner = ({ message = 'hi' }: BannerProps) => <div>{message}</div>;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: destructured props inside the memoized function
      // expression require-memo emits
      {
        code: `
        import { memo } from 'react';

        interface BannerProps {
          message: string;
        }

        export const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export interface BannerProps {
          message: string;
        }

        export const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: destructured props carrying a generic argument report the
      // wrapper and its argument, each pointing at its own declaration
      {
        code: `
        import { memo } from 'react';

        type ListProps<T> = {
          items: T[];
        };

        type Item = {
          id: string;
        };

        export const List = memo(({ items }: ListProps<Item>) => <div>{items.length}</div>);
      `,
        output: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export type Item = {
          id: string;
        };

        export const List = memo(({ items }: ListProps<Item>) => <div>{items.length}</div>);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'ListProps' },
          },
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'Item' },
          },
        ],
      },
      // Invalid case: memo of an identifier naming a function declaration
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        }

        export const Banner = memo(BannerUnmemoized);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        }

        export const Banner = memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memo of an identifier naming a const arrow
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = memo(BannerUnmemoized);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memo of an identifier whose resolved props are
      // destructured, composing both indirections
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = ({ message }: BannerProps) => <div>{message}</div>;

        export const Banner = memo(BannerUnmemoized);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = ({ message }: BannerProps) => <div>{message}</div>;

        export const Banner = memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: memo wrapped around forwardRef of an identifier
      {
        code: `
        import { forwardRef, memo } from 'react';

        type BannerProps = {
          message: string;
        };

        function BannerUnwrapped(props: BannerProps, ref: Ref<HTMLDivElement>) {
          return <div ref={ref}>{props.message}</div>;
        }

        export const Banner = memo(forwardRef(BannerUnwrapped));
      `,
        output: `
        import { forwardRef, memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        function BannerUnwrapped(props: BannerProps, ref: Ref<HTMLDivElement>) {
          return <div ref={ref}>{props.message}</div>;
        }

        export const Banner = memo(forwardRef(BannerUnwrapped));
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: an identifier naming a declaration that is itself wrapped
      {
        code: `
        import { forwardRef, memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = forwardRef(({ message }: BannerProps, ref) => (
          <div ref={ref}>{message}</div>
        ));

        export const Banner = memo(BannerUnmemoized);
      `,
        output: `
        import { forwardRef, memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = forwardRef(({ message }: BannerProps, ref) => (
          <div ref={ref}>{message}</div>
        ));

        export const Banner = memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: namespaced React.memo of an identifier
      {
        code: `
        import React from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = React.memo(BannerUnmemoized);
      `,
        output: `
        import React from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = (props: BannerProps) => <div>{props.message}</div>;

        export const Banner = React.memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: default export of a memoized identifier, whose
      // capitalized binding is the only evidence of component-hood
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = ({ message }: BannerProps) => <div>{message}</div>;

        export default memo(BannerUnmemoized);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        const BannerUnmemoized = ({ message }: BannerProps) => <div>{message}</div>;

        export default memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: an exported declaration reached through a wrapper reports
      // once, since both paths land on the same annotation
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        }

        export const Banner = memo(BannerUnmemoized);
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        }

        export const Banner = memo(BannerUnmemoized);
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: destructured props on a component declaration
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: destructured props on a default-exported declaration
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export default function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export default function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: a generic component reports its non-exported props type
      // while its own type parameter stays out of the report
      {
        code: `
        import { memo } from 'react';

        type ListProps<T> = {
          items: T[];
        };

        export const List = memo(function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        });
      `,
        output: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export const List = memo(function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        });
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'ListProps' },
          },
        ],
      },
      // Invalid case: a component resolved through an identifier declared below
      // the export reports its props type, with no ancestor chain to walk
      {
        code: `
        import { memo } from 'react';

        type ListProps<T> = {
          items: T[];
        };

        export const List = memo(ListUnmemoized);

        function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        }
      `,
        output: `
        import { memo } from 'react';

        export type ListProps<T> = {
          items: T[];
        };

        export const List = memo(ListUnmemoized);

        function ListUnmemoized<T>({ items }: ListProps<T>) {
          return <div>{items.length}</div>;
        }
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'ListProps' },
          },
        ],
      },
      // Invalid case: destructured props whose type has no local declaration
      // are reported without a fix
      {
        code: `
        export const Banner = ({ message }: AmbientBannerProps) => <div>{message}</div>;
      `,
        output: null,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'AmbientBannerProps' },
          },
        ],
      },
      // Invalid case: two components sharing one props type each report, while
      // the single insertion point admits one fix per pass
      {
        code: `
        import { memo } from 'react';

        type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });

        export const Alert = (props: BannerProps) => <div>{props.message}</div>;
      `,
        output: `
        import { memo } from 'react';

        export type BannerProps = {
          message: string;
        };

        export const Banner = memo(function BannerUnmemoized(props: BannerProps) {
          return <div>{props.message}</div>;
        });

        export const Alert = (props: BannerProps) => <div>{props.message}</div>;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: the split default export `require-memo` emits for a
      // default-exported declaration, spelled as its fixer writes it
      {
        code: `
        import { memo } from '../util/memo';

        type BannerProps = {
          message: string;
        };

        const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
        export default Banner;
      `,
        output: `
        import { memo } from '../util/memo';

        export type BannerProps = {
          message: string;
        };

        const Banner = memo(function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        });
        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: the split default export around an arrow, where the
      // default-exported binding is the only name the component has
      {
        code: `
        import { memo } from '../util/memo';

        type BannerProps = {
          message: string;
        };

        const Banner = memo(({ message }: BannerProps) => <div>{message}</div>);
        export default Banner;
      `,
        output: `
        import { memo } from '../util/memo';

        export type BannerProps = {
          message: string;
        };

        const Banner = memo(({ message }: BannerProps) => <div>{message}</div>);
        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: the split default export of nested wrappers, where the
      // ref parameter stays outside the props contract
      {
        code: `
        import { forwardRef } from 'react';
        import { memo } from '../util/memo';

        type BannerProps = {
          message: string;
        };

        const Banner = memo(
          forwardRef(function BannerUnmemoized(
            { message }: BannerProps,
            ref: Ref<HTMLDivElement>,
          ) {
            return <div ref={ref}>{message}</div>;
          }),
        );
        export default Banner;
      `,
        output: `
        import { forwardRef } from 'react';
        import { memo } from '../util/memo';

        export type BannerProps = {
          message: string;
        };

        const Banner = memo(
          forwardRef(function BannerUnmemoized(
            { message }: BannerProps,
            ref: Ref<HTMLDivElement>,
          ) {
            return <div ref={ref}>{message}</div>;
          }),
        );
        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: the split default export whose wrapper argument names a
      // local declaration, which is two hops from the export
      {
        code: `
        import { memo } from '../util/memo';

        type BannerProps = {
          message: string;
        };

        function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        const Banner = memo(BannerUnmemoized);
        export default Banner;
      `,
        output: `
        import { memo } from '../util/memo';

        export type BannerProps = {
          message: string;
        };

        function BannerUnmemoized({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        const Banner = memo(BannerUnmemoized);
        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: an unwrapped component default-exported by name, which is
      // the same program as `export default function Banner(...)`
      {
        code: `
        type BannerProps = {
          message: string;
        };

        const Banner = ({ message }: BannerProps) => <div>{message}</div>;
        export default Banner;
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        const Banner = ({ message }: BannerProps) => <div>{message}</div>;
        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: a declaration that is both named- and default-exported
      // reports once, since both paths land on the same annotation
      {
        code: `
        type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        export default Banner;
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: a component declaration default-exported by name, whose
      // declaration carries no `export` of its own
      {
        code: `
        type BannerProps = {
          message: string;
        };

        function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        export default Banner;
      `,
        output: `
        export type BannerProps = {
          message: string;
        };

        function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }

        export default Banner;
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
      // Invalid case: the props type is declared ambient (`declare type`)
      // rather than merely unexported. `findExportableTypeDeclaration`
      // matches it by AST type and name regardless of the `declare` modifier,
      // and prepending `export` to an ambient type alias is valid TypeScript
      // (`export declare type ...`), so the fix still applies.
      {
        code: `
        declare type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        output: `
        export declare type BannerProps = {
          message: string;
        };

        export function Banner({ message }: BannerProps) {
          return <div>{message}</div>;
        }
      `,
        errors: [
          {
            messageId: 'missingExportedPropsType',
            data: { typeName: 'BannerProps' },
          },
        ],
      },
    ],
  },
);

describe('enforce-exported-function-types messages', () => {
  it('explains missingExportedType', () => {
    expect(enforceExportedFunctionTypes.meta.messages.missingExportedType).toBe(
      'Type "{{typeName}}" is used in a parameter of an exported function but is not exported. Callers cannot import the parameter contract, which forces duplicate or ad-hoc types and makes the API drift. Export the type (e.g., `export type {{typeName}} = ...`) or reuse an already exported type.',
    );
  });

  it('explains missingExportedReturnType', () => {
    expect(
      enforceExportedFunctionTypes.meta.messages.missingExportedReturnType,
    ).toBe(
      'Return type "{{typeName}}" belongs to an exported function but is not exported. Consumers cannot reference the returned shape for validation or composition, which leads to duplicated types and diverging contracts. Export the return type alias or interface so callers can import the shared contract.',
    );
  });

  it('explains missingExportedPropsType', () => {
    expect(
      enforceExportedFunctionTypes.meta.messages.missingExportedPropsType,
    ).toBe(
      'Props type "{{typeName}}" is used by an exported React component but is not exported. Other modules cannot type the props when composing the component and end up recreating the shape. Export the props type (e.g., `export type {{typeName}} = ...`) or reference an existing exported props contract.',
    );
  });
});
