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

    // additionalNonSerializableTypes is additive, so a project-specific type is
    // JSON-safe as far as the defaults are concerned. The matching `invalid`
    // case is this code verbatim with the type listed — the option is the only
    // difference between reporting and staying silent.
    {
      code: `
        type CustomParams = {
          id: string;
          ref: FirestoreDocument;
        };

        export const customFunction = async (request: CallableRequest<CustomParams>) => {
          // Implementation
        };
      `,
    },

    // functionTypes narrowed away from the default: the payload of a wrapper the
    // list no longer names is never inspected. Identical to the first `invalid`
    // case apart from this option.
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
      options: [{ functionTypes: ['HttpsRequest'] }],
    },

    // The other direction for the same option: a custom wrapper is inert while
    // the default list does not name it. Paired with the widened `invalid` case.
    {
      code: `
        type WrappedParams = {
          createdAt: Date;
        };

        export const httpsFunction = async (request: HttpsRequest<WrappedParams>) => {
          // Implementation
        };
      `,
    },

    // A type parameter naming no local alias is unresolvable, so the rule knows
    // nothing about its shape. Reporting it would flag every imported request
    // type; these pin the silence that keeps the #1750 fallthrough from
    // over-correcting into a false positive.
    {
      code: `
        export const importedFunction = async (request: CallableRequest<ImportedParams>) => {
          // Implementation
        };
      `,
    },
    {
      code: `
        export const indexedFunction = async (request: CallableRequest<Record<string, string>>) => {
          // Implementation
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

    // additionalNonSerializableTypes extends the built-in set: the same code
    // appears in `valid` without the option, so nothing but the option can make
    // this report.
    {
      code: `
        type CustomParams = {
          id: string;
          ref: FirestoreDocument;
        };

        export const customFunction = async (request: CallableRequest<CustomParams>) => {
          // Implementation
        };
      `,
      options: [{ additionalNonSerializableTypes: ['FirestoreDocument'] }],
      errors: [
        propertyError(
          'What\'s wrong: property "ref" uses a non-JSON-safe type "FirestoreDocument" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert FirestoreDocument to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
      ],
    },

    // functionTypes widened to a custom request wrapper. An inclusion filter
    // only shows an effect when it is changed to name something the fixture
    // uses, so this pairs with the `valid` case that omits the option.
    {
      code: `
        type WrappedParams = {
          createdAt: Date;
        };

        export const httpsFunction = async (request: HttpsRequest<WrappedParams>) => {
          // Implementation
        };
      `,
      options: [{ functionTypes: ['HttpsRequest'] }],
      errors: [
        propertyError(
          'What\'s wrong: property "createdAt" uses a non-JSON-safe type "Date" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert Date to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
        ),
      ],
    },

    // #1750: the plainest spelling of the violation. A bad type used directly as
    // the type parameter is a bare TSTypeReference, which the rule used to hand
    // to the alias map and then drop when the lookup missed — so the array,
    // union and object-literal spellings reported while this one stayed silent.
    {
      code: `
        export const directFunction = async (request: CallableRequest<Timestamp>) => {
          // Invalid implementation
        };
      `,
      errors: [{ messageId: 'nonSerializableParam' }],
    },
    {
      code: `
        export const refFunction = async (request: CallableRequest<DocumentReference>) => {
          // Invalid implementation
        };
      `,
      errors: [{ messageId: 'nonSerializableParam' }],
    },

    // The same fallthrough reaches a non-serializable type behind a generic.
    {
      code: `
        export const cacheFunction = async (request: CallableRequest<Map<string, number>>) => {
          // Invalid implementation
        };
      `,
      errors: [{ messageId: 'nonSerializableParam' }],
    },

    // #1750: TypeScript hoists type aliases, so a request type declared below
    // its consumer is legal. Resolution happens after traversal for this reason;
    // reading the alias map mid-traversal missed every such declaration.
    {
      code: `
        export const hoistedFunction = async (request: CallableRequest<HoistedParams>) => {
          // Invalid implementation
        };

        type HoistedParams = {
          createdAt: Timestamp;
        };
      `,
      errors: [{ messageId: 'nonSerializableProperty' }],
    },
  ],
});
