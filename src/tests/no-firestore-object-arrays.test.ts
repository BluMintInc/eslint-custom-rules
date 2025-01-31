import { ruleTesterTs } from '../utils/ruleTester';
import { noFirestoreObjectArrays } from '../rules/no-firestore-object-arrays';

ruleTesterTs.run('no-firestore-object-arrays', noFirestoreObjectArrays, {
  valid: [
    // Test: Allow primitive arrays
    {
      code: `
        export type UserProfile = {
          id: string;
          tags: string[];
          scores: number[];
          flags: boolean[];
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Allow map/record structure
    {
      code: `
        export type UserProfile = {
          id: string;
          friends: Record<string, { name: string }>;
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Ignore files outside Firestore types directory
    {
      code: `
        export type Config = {
          items: { id: string; value: string }[];
        };
      `,
      filename: 'src/types/config.ts',
    },
  ],
  invalid: [
    // Test: Basic object array
    {
      code: `
        export type UserProfile = {
          id: string;
          friends: { id: string; name: string }[];
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Array of type alias
    {
      code: `
        type Friend = { id: string; name: string };
        export type UserProfile = {
          friends: Friend[];
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Nested object arrays
    {
      code: `
        export type ComplexData = {
          steps: { actions: { type: string; payload: any }[] }[];
        };
      `,
      filename: 'functions/src/types/firestore/complex.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
  ],
});
