import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIdentifiableFirestoreType } from '../rules/enforce-identifiable-firestore-type';

ruleTesterTs.run(
  'enforce-identifiable-firestore-type',
  enforceIdentifiableFirestoreType,
  {
    valid: [
      {
        code: `
        import { Identifiable } from 'functions/src/types/Identifiable';
        export type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      {
        // Issue #1271: on a Windows backslash firestore path the rule now runs
        // (via separator normalization) and correctly passes a valid type whose
        // name matches its folder and extends Identifiable.
        code: `
        import { Identifiable } from 'functions/src/types/Identifiable';
        export type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename:
          'C:\\repo\\functions\\src\\types\\firestore\\Connection\\index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Identifiable & {
          username: string;
          imgUrl: string;
          dateCreated: T;
        };

        export type Guild<T = Timestamp> = GroupInfo<T>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      {
        code: `
        import { Identifiable } from 'path-to-identifiable';
        export type GroupInfo<T = Timestamp> = Resolve<Identifiable & {
          username: string;
          imgUrl: string;
          dateCreated: T;
          groupNumber: number;
          createdBy?: string;
          privacy?: 'private' | 'public' | 'connected';
        }>;
      `,
        filename: 'functions/src/types/firestore/GroupInfo/index.ts',
      },
      {
        code: `
        import { Identifiable } from 'path-to-identifiable';
        export type AdCampaign<TQuota extends Quota, TTime> = Identifiable & {
          quota: TQuota;
          timeRange: TTime;
        };
      `,
        filename: 'functions/src/types/firestore/AdCampaign/index.ts',
      },
      {
        code: `
        import { Resolve } from '../../../utility-types';
        export type UserItem = Resolve<{
          /**
           * id should be \`chainId-contractAddress-itemId\`
           */
          id: string;
          itemId: number;
          amount: number;
          address: string;
          chainId: number;
          provider: NftProvider;
        }>;
      `,
        filename: 'functions/src/types/firestore/UserItem/index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Readonly<
          Identifiable & {
            username: string;
            usernameLowercase: string;
            imgUrl: string;
            dateCreated: T;
          }
        >;

        export type Guild<T = Timestamp> = Readonly<GroupInfo<T>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      {
        code: `
        type Resolve<T> = T;
        type BaseType = { id: string; value: number };
        type TypeA = BaseType;
        type TypeB = Resolve<BaseType>;

        export type Guild = TypeA & TypeB;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      // Issue #1635: a folder-matching alias exported separately (rather than
      // inline) must still satisfy the rule, since consumers can import it.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export type { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // The export specifier is legal TypeScript even when it precedes the
      // aliased declaration it references (type declarations hoist), so the
      // rule must not depend on visiting the export before the alias.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export { Connection };

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Renaming on export (including `as default`) still exports the local
      // "Connection" binding, so it must satisfy the gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection as default };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Files outside functions/src/types/firestore/** are untouched by the
      // rule regardless of what they export.
      {
        code: `
        export const notAFirestoreType = 1;
      `,
        filename: 'functions/src/types/Connection/index.ts',
      },
    ],
    invalid: [
      {
        code: `
        export type Connection = {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      {
        code: `
        export type WrongName = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      {
        code: `
        export type Connection = {
          id: string;
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      {
        code: `
        export const defaultConnection = {
          id: '123',
          userIdsConnected: ['user1', 'user2'],
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      {
        code: `
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Readonly<{
          username: string;
          usernameLowercase: string;
          imgUrl: string;
          dateCreated: T;
        }>;

        export type Guild<T = Timestamp> = Readonly<GroupInfo<T>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Guild = Map<Identifiable, string>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        export type Guild = Resolve<Map<{ id: string }, string>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Guild = Array<Identifiable>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        type Loop = Readonly<Loop>;

        export type Guild = Resolve<Loop>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Aliased = Identifiable;

        export type Guild = keyof Aliased;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        // Issue #1271: a Windows backslash firestore-types path must be enforced.
        // Before separator normalization the forward-slash pattern never
        // matched, so the rule silently no-op'd on Windows.
        code: `
        export type Connection = {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename:
          'C:\\repo\\functions\\src\\types\\firestore\\Connection\\index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // Issue #1635: a folder-matching type alias with no `export` at all is
      // unreachable by any consumer, so it must not satisfy the rule.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // An unrelated export existing alongside the unexported matching alias
      // does not make the alias itself reachable.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export const DEFAULT_CONNECTION = { id: '1' };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // A re-export with a source exports a binding from another module, not
      // the local alias declared in this file, so it must not satisfy the gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection } from './other';
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // A separately-exported alias still needs to extend Identifiable; being
      // exported doesn't exempt it from the id-field requirement.
      {
        code: `
        type Connection = {
          userIdsConnected: string[];
        };

        export { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // No alias named after the folder exists at all; an unrelated exported
      // type doesn't satisfy the requirement.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Other = Identifiable & {
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
    ],
  },
);
