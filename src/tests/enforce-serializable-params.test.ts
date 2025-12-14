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
          'What\'s wrong: property "userRef" uses a non-JSON-safe type "DocumentReference" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert DocumentReference to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
        propertyError(
          'What\'s wrong: property "createdAt" uses a non-JSON-safe type "Date" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert Date to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
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
          'What\'s wrong: property "timestamp" uses a non-JSON-safe type "Timestamp" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert Timestamp to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
        propertyError(
          'What\'s wrong: property "users" uses a non-JSON-safe type "DocumentReference" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert DocumentReference to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
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
          'What\'s wrong: property "cache" uses a non-JSON-safe type "Map" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert Map to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
        propertyError(
          'What\'s wrong: property "set" uses a non-JSON-safe type "Set" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert Set to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
      ],
    },
  ],
});
