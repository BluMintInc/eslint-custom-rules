import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/enforce-serializable-params';

const propertyError = (
  message: string,
): TSESLint.TestCaseError<'nonSerializableProperty'> =>
  ({ message } as unknown as TSESLint.TestCaseError<'nonSerializableProperty'>);

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
        propertyError(
          'Property "userRef" uses non-serializable type "DocumentReference", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert DocumentReference to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
        propertyError(
          'Property "createdAt" uses non-serializable type "Date", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert Date to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
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
        propertyError(
          'Property "timestamp" uses non-serializable type "Timestamp", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert Timestamp to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
        propertyError(
          'Property "users" uses non-serializable type "DocumentReference", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert DocumentReference to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
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
        propertyError(
          'Property "cache" uses non-serializable type "Map", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert Map to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
        propertyError(
          'Property "set" uses non-serializable type "Set", which Firebase cannot encode when sending callable/HTTPS request payloads. Non-JSON values fail at runtime and silently lose data. Accept only JSON-safe primitives, arrays, or plain objects, and convert Set to a safe representation (e.g., Date -> ISO string, DocumentReference -> document path string, Map/Set -> plain array or object).',
        ),
      ],
    },
  ],
});
