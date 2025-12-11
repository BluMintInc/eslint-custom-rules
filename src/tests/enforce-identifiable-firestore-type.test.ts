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
    ],
  },
);
