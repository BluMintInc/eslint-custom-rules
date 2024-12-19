import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/enforce-serializable-params';

ruleTesterTs.run('enforce-serializable-params', rule, {
  valid: [
    {
      code: `
        type ValidParams = {
          id: string;
          count: number;
          isActive: boolean;
          data: {
            name: string;
            values: number[];
          };
          providers?: { id: string; name: string }[] | null;
        };

        export const validFunction = async (request: CallableRequest<ValidParams>) => {
          // Valid implementation
        };
      `,
    },
  ],
  invalid: [
    {
      code: `
        type InvalidParams = {
          userRef: DocumentReference;
          createdAt: Date;
        };

        export const invalidFunction = async (request: CallableRequest<InvalidParams>) => {
          // Invalid implementation
        };
      `,
      errors: [
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'DocumentReference', prop: 'userRef' },
        },
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'Date', prop: 'createdAt' },
        },
      ],
    },
    {
      code: `
        type NestedInvalidParams = {
          data: {
            timestamp: Timestamp;
            users: Array<DocumentReference>;
          };
        };

        export const nestedInvalidFunction = async (request: CallableRequest<NestedInvalidParams>) => {
          // Invalid implementation
        };
      `,
      errors: [
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'Timestamp', prop: 'timestamp' },
        },
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'DocumentReference', prop: 'users' },
        },
      ],
    },
    {
      code: `
        type MixedParams = {
          id: string;
          cache: Map<string, any>;
          set: Set<number>;
        };

        export const mixedFunction = async (request: CallableRequest<MixedParams>) => {
          // Invalid implementation
        };
      `,
      errors: [
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'Map', prop: 'cache' },
        },
        {
          messageId: 'nonSerializableProperty',
          data: { type: 'Set', prop: 'set' },
        },
      ],
    },
  ],
});
