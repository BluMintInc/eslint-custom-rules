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
          dates: Date[];
          timestamps: Timestamp[];
          geoPoints: GeoPoint[];
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
          contacts: { [key: string]: { email: string } };
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Allow primitive array with generic syntax
    {
      code: `
        export type UserProfile = {
          id: string;
          tags: Array<string>;
          readOnlyScores: ReadonlyArray<number>;
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Allow union of primitive arrays
    {
      code: `
        export type UserProfile = {
          id: string;
          values: (string | number)[];
          metadata: Array<string | null>;
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Ignore files outside Firestore types directory
    {
      code: `
        export type Config = {
          items: { id: string; value: string }[];
          settings: Array<{ key: string; value: any }>;
        };
      `,
      filename: 'src/types/config.ts',
    },
    // Test: Allow Record/Map with complex value types
    {
      code: `
        type ComplexValue = {
          data: { nested: string };
          metadata: Record<string, unknown>;
        };
        export type DataStructure = {
          mappedData: Record<string, ComplexValue>;
          indexedData: { [key: string]: ComplexValue };
        };
      `,
      filename: 'functions/src/types/firestore/data.ts',
    },
    // Test: Allow namespaced primitive arrays (e.g., firebase.firestore.Timestamp)
    {
      code: `
        declare namespace firebase { namespace firestore { export class Timestamp {} } }
        export type T = { ts: firebase.firestore.Timestamp[] };
      `,
      filename: 'functions/src/types/firestore/ts.ts',
    },
    // Test: Allow nullable primitive arrays and unknown/any
    {
      code: `
        export type T = {
          maybeNumbers: (number | null | undefined)[];
          anyValues: any[];
          unknownValues: unknown[];
          neverValues: never[];
        };
      `,
      filename: 'functions/src/types/firestore/misc.ts',
    },
    // Test: Allow tuples of primitives (still primitive container)
    {
      code: `
        export type T = {
          coords: Array<[number, number]>;
          flags: (readonly [boolean, string])[];
        };
      `,
      filename: 'functions/src/types/firestore/tuples.ts',
    },
    // Test: Allow arrays of primitive arrays (e.g., string[][])
    {
      code: `
        export type T = {
          matrix: string[][];
          lists: Array<Array<number>>;
        };
      `,
      filename: 'functions/src/types/firestore/primitives-nested.ts',
    },
    // Test: Allow arrays of alias to string literal union (bug repro)
    {
      code: `
        export type ChannelGroupPermanence = 'temporary' | 'pinned';
        export type Model = {
          types: ChannelGroupPermanence[];
          list: Array<ChannelGroupPermanence>;
          readOnly: ReadonlyArray<ChannelGroupPermanence>;
          nested: (ChannelGroupPermanence)[];
        };
      `,
      filename: 'functions/src/types/firestore/User/ChannelGroup/util/isTemporary.ts',
    },
    // Test: Allow variable-level arrays of alias to string literal union
    {
      code: `
        export type ChannelGroupPermanence = 'temporary' | 'pinned';
        export const TEMP1: ChannelGroupPermanence[] = ['temporary', 'pinned'];
        export const TEMP2: ReadonlyArray<ChannelGroupPermanence> = ['temporary'];
        export const TEMP3: Array<ChannelGroupPermanence> = ['temporary'];
      `,
      filename: 'functions/src/types/firestore/User/ChannelGroup/util/isTemporary.ts',
    },
    // Test: Allow arrays of enums
    {
      code: `
        export enum Perm { TEMPORARY = 'temporary', PINNED = 'pinned' }
        export type T = { arr: Perm[]; ro: ReadonlyArray<Perm> };
        export const ok: Perm[] = [Perm.TEMPORARY, Perm.PINNED];
      `,
      filename: 'functions/src/types/firestore/enums.ts',
    },
    // Test: Allow namespaced alias to string literals
    {
      code: `
        declare namespace NS { export type Role = 'owner' | 'member' }
        export type T = { roles: NS.Role[]; list: Array<NS.Role> };
      `,
      filename: 'functions/src/types/firestore/ns-alias.ts',
    },
    // Test: Allow arrays of keyof and template literal aliases
    {
      code: `
        type Some = { a: 1; b: 2 };
        type Slug = \`\${string}-\${string}\`;
        export type T = { keys: (keyof Some)[]; slugs: Slug[] };
      `,
      filename: 'functions/src/types/firestore/keys-and-templates.ts',
    },
    // Test: Allow arrays of alias-of-alias literals
    {
      code: `
        type A = 'a' | 'b';
        type B = A;
        export type T = { list: B[]; arr: Array<B> };
      `,
      filename: 'functions/src/types/firestore/alias-of-alias.ts',
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
          contacts: Array<Friend>;
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
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
    // Test: Array with intersection type
    {
      code: `
        type WithTimestamp = { createdAt: Timestamp };
        type WithMetadata = { metadata: Record<string, unknown> };
        export type DataEntry = {
          items: (WithTimestamp & WithMetadata)[];
        };
      `,
      filename: 'functions/src/types/firestore/data.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Array with union of objects
    {
      code: `
        type ImageData = { url: string; width: number; height: number };
        type VideoData = { url: string; duration: number };
        export type MediaContent = {
          media: (ImageData | VideoData)[];
        };
      `,
      filename: 'functions/src/types/firestore/media.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: ReadonlyArray of objects
    {
      code: `
        type Comment = { text: string; author: string };
        export type Post = {
          comments: ReadonlyArray<Comment>;
        };
      `,
      filename: 'functions/src/types/firestore/post.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Array with mapped type
    {
      code: `
        type Keys = 'name' | 'email';
        export type UserData = {
          fields: Array<{ [K in Keys]: string }>;
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Array with indexed access type
    {
      code: `
        type DataShape = {
          user: { name: string; email: string };
          post: { title: string; content: string };
        };
        export type Collection = {
          items: Array<DataShape['user']>;
        };
      `,
      filename: 'functions/src/types/firestore/collection.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Deeply nested object arrays
    {
      code: `
        export type DeepStructure = {
          level1: {
            level2: {
              level3: Array<{
                data: { value: string }[];
              }>;
            }[];
          }[];
        };
      `,
      filename: 'functions/src/types/firestore/deep.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays of arrays of objects (still invalid)
    {
      code: `
        type Obj = { x: number };
        export type T = { grid: Obj[][] };
      `,
      filename: 'functions/src/types/firestore/array-of-arrays.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Namespaced object arrays should still be invalid
    {
      code: `
        declare namespace models { export interface User { id: string } }
        export type T = { users: models.User[] };
      `,
      filename: 'functions/src/types/firestore/ns-objects.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Alias to object should be invalid
    {
      code: `
        type Obj = { id: string };
        type Alias = Obj;
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/alias-object.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Alias to union including object should be invalid
    {
      code: `
        type Obj = { id: string };
        type Alias = Obj | 'ok';
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/alias-union-object.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Namespaced interface alias should be invalid
    {
      code: `
        declare namespace NS { export interface Obj { id: string } }
        type Alias = NS.Obj;
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/ns-alias-object.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Alias to mapped/intersection object should be invalid
    {
      code: `
        type Keys = 'a' | 'b';
        type Mapped = { [K in Keys]: string } & { extra: number };
        type Alias = Mapped;
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/mapped-intersection.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
  ],
});
