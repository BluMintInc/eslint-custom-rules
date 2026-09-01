import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { noFirestoreObjectArrays } from '../rules/no-firestore-object-arrays';
import { preferUnionFromConstArray } from '../rules/prefer-union-from-const-array';

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
    // Test: Allow nullable primitive arrays
    {
      code: `
        export type T = {
          maybeNumbers: (number | null | undefined)[];
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
      filename:
        'functions/src/types/firestore/User/ChannelGroup/util/isTemporary.ts',
    },
    // Test: Allow variable-level arrays of alias to string literal union
    {
      code: `
        export type ChannelGroupPermanence = 'temporary' | 'pinned';
        export const TEMP1: ChannelGroupPermanence[] = ['temporary', 'pinned'];
        export const TEMP2: ReadonlyArray<ChannelGroupPermanence> = ['temporary'];
        export const TEMP3: Array<ChannelGroupPermanence> = ['temporary'];
      `,
      filename:
        'functions/src/types/firestore/User/ChannelGroup/util/isTemporary.ts',
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
    // Test: Allow arrays of a const-array-derived string union, the shape
    // prefer-union-from-const-array autofixes toward
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];
export type Guild = { id: string; roles: MemberRole[] };
`,
      filename: 'functions/src/types/firestore/Guild/index.ts',
    },
    // Test: Const-array-derived union under every array syntax
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];
export type Guild = {
  roles: readonly MemberRole[];
  list: Array<MemberRole>;
  frozen: ReadonlyArray<MemberRole>;
  nested: (MemberRole)[];
};
`,
      filename: 'functions/src/types/firestore/Guild/roles.ts',
    },
    // Test: Const-array-derived union used inline, without an alias
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin', 'member'] as const;
export type Guild = {
  roles: (typeof MEMBER_ROLE_VALUES)[number][];
  list: Array<(typeof MEMBER_ROLE_VALUES)[number]>;
  frozen: ReadonlyArray<(typeof MEMBER_ROLE_VALUES)[number]>;
};
`,
      filename: 'functions/src/types/firestore/Guild/inline.ts',
    },
    // Test: Const array of numbers, booleans, null and template literals
    {
      code: `
export const CODES = [1, 2, -3] as const;
export const FLAGS = [true, false] as const;
export const NULLABLE = ['a', null, undefined] as const;
export const TEMPLATES = [\`a-\${'b'}\`, 'c'] as const;
export type Code = (typeof CODES)[number];
export type Flag = (typeof FLAGS)[number];
export type Nullable = (typeof NULLABLE)[number];
export type Template = (typeof TEMPLATES)[number];
export type Doc = {
  codes: Code[];
  flags: Flag[];
  nullables: Nullable[];
  templates: Template[];
};
`,
      filename: 'functions/src/types/firestore/Doc/primitives.ts',
    },
    // Test: Alias chain over a const-array-derived union
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin'] as const;
type A = (typeof MEMBER_ROLE_VALUES)[number];
type B = A;
export type Guild = { roles: B[]; list: Array<B> };
`,
      filename: 'functions/src/types/firestore/Guild/alias-chain.ts',
    },
    // Test: Const array assembled by spreading other const arrays
    {
      code: `
export const ADMIN_ROLES = ['owner', 'admin'] as const;
export const ALL_ROLES = [...ADMIN_ROLES, 'member'] as const;
export type MemberRole = (typeof ALL_ROLES)[number];
export type Guild = { roles: MemberRole[] };
`,
      filename: 'functions/src/types/firestore/Guild/spread.ts',
    },
    // Test: Const array without an `as const` assertion still yields a
    // primitive element type
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin', 'member'];
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];
export type Guild = { roles: MemberRole[] };
`,
      filename: 'functions/src/types/firestore/Guild/no-assertion.ts',
    },
    // Test: Const array of primitive tuples matches the tuple/nested-array
    // allowance
    {
      code: `
export const COORDS = [[0, 0], [1, 1]] as const;
export type Coord = (typeof COORDS)[number];
export type Doc = { path: Coord[] };
`,
      filename: 'functions/src/types/firestore/Doc/coords.ts',
    },
    // Test: Union mixing a const-array-derived union with literals
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin'] as const;
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number] | 'guest';
export type Guild = { roles: MemberRole[] };
`,
      filename: 'functions/src/types/firestore/Guild/union.ts',
    },
    // Test: Const array declared after the type that consumes it
    {
      code: `
export type Guild = { roles: MemberRole[] };
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];
export const MEMBER_ROLE_VALUES = ['owner', 'admin'] as const;
`,
      filename: 'functions/src/types/firestore/Guild/hoisted.ts',
    },
    // Test: A const array nested beside the model type that consumes it backs a
    // primitive element union exactly as a top-level one does
    {
      code: `
function build() {
  const VALUES = ['a', 'b'] as const;
  type Post = { roles: (typeof VALUES)[number][] };
}
`,
      filename: 'functions/src/types/firestore/nested-const-array.ts',
    },
    // Test: Nested const array behind an arrow body
    {
      code: `
const build = () => {
  const VALUES = ['owner', 'admin'] as const;
  type Role = (typeof VALUES)[number];
  type Guild = { roles: Role[] };
};
`,
      filename: 'functions/src/types/firestore/nested-const-alias.ts',
    },
    // Test: Nested const array spreading another nested const array
    {
      code: `
function build() {
  const ADMIN_ROLES = ['owner', 'admin'] as const;
  const ALL_ROLES = [...ADMIN_ROLES, 'member'] as const;
  type Guild = { roles: (typeof ALL_ROLES)[number][] };
}
`,
      filename: 'functions/src/types/firestore/nested-const-spread.ts',
    },
    // Test: Unknown (imported) element type stays silent when nested, so the
    // widened lexical search cannot be read as "assume object on a miss"
    {
      code: `
import type { Comment } from './comment';
function build() {
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/nested-imported.ts',
    },
    // Test: An object alias declared in a sibling scope must not resolve — that
    // binding is not in scope at the reference, so TypeScript never sees it
    {
      code: `
function other() {
  type Comment = { text: string };
  return null as unknown as Comment;
}
export type Post = { comments: Comment[] };
`,
      filename: 'functions/src/types/firestore/sibling-scope.ts',
    },
    // Test: The nearest declaration wins, so an inner primitive alias shadows a
    // same-named outer object alias
    {
      code: `
type Comment = { text: string };
function build() {
  type Comment = string;
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/shadow-primitive.ts',
    },
    // Test: Nested enum element types remain primitive-like
    {
      code: `
function build() {
  enum Perm { TEMPORARY = 'temporary', PINNED = 'pinned' }
  type Post = { perms: Perm[]; ro: ReadonlyArray<Perm> };
}
`,
      filename: 'functions/src/types/firestore/nested-enum.ts',
    },
    // Test: Nested alias to a primitive union
    {
      code: `
function build() {
  type Role = 'owner' | 'member';
  type Post = { roles: Role[]; arr: Array<Role> };
}
`,
      filename: 'functions/src/types/firestore/nested-primitive-alias.ts',
    },
    // Test: A same-named nested const that is not an array literal shadows the
    // outer const array, so the reference no longer denotes a literal union
    {
      code: `
export const VALUES = ['a', 'b'] as const;
function build() {
  const VALUES = { a: 1 };
  type Post = { roles: string[] };
}
`,
      filename: 'functions/src/types/firestore/shadow-const.ts',
    },
    // Test: A type parameter holds no statement, so it shadows a same-named
    // outer alias only through the scope chain, not through the enclosing
    // statement containers. `Friend` inside the interface is its own opaque
    // parameter, and the policy for an unknown reference is to not assume
    // object (#2261)
    {
      code: `
type Friend = { id: string; name: string };
export interface UserProfile<Friend> {
  friends: Friend[];
}
`,
      filename: 'functions/src/types/firestore/user.ts',
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'friends' },
        },
      ],
    },
    // Test: Numeric literal property keys preserve field name
    {
      code: `
        export type NumericKeys = {
          123: { name: string }[];
          0x1f: Array<{ value: number }>;
        };
      `,
      filename: 'functions/src/types/firestore/numeric.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: '123' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: '31' },
        },
      ],
    },
    // Test: Computed property keys preserve identifier and literal labels
    {
      code: `
        const SOME_CONST = 'computedField';
        export type ComputedKeys = {
          [SOME_CONST]: { value: string }[];
          ['literal-key']: Array<{ value: number }>;
        };
      `,
      filename: 'functions/src/types/firestore/computed.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'SOME_CONST' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'literal-key' },
        },
      ],
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
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'friends' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'contacts' },
        },
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
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'steps' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'actions' },
        },
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'items' },
        },
      ],
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'media' },
        },
      ],
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'fields' },
        },
      ],
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'items' },
        },
      ],
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
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'level1' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'level2' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'level3' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'data' },
        },
      ],
    },
    // Test: Arrays of arrays of objects (still invalid)
    {
      code: `
        type Obj = { x: number };
        export type T = { grid: Obj[][] };
      `,
      filename: 'functions/src/types/firestore/array-of-arrays.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'grid' },
        },
      ],
    },
    // Test: Namespaced object arrays should still be invalid
    {
      code: `
        declare namespace models { export interface User { id: string } }
        export type T = { users: models.User[] };
      `,
      filename: 'functions/src/types/firestore/ns-objects.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'users' },
        },
      ],
    },
    // Test: Alias to object should be invalid
    {
      code: `
        type Obj = { id: string };
        type Alias = Obj;
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/alias-object.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'list' },
        },
      ],
    },
    // Test: Alias to union including object should be invalid
    {
      code: `
        type Obj = { id: string };
        type Alias = Obj | 'ok';
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/alias-union-object.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'list' },
        },
      ],
    },
    // Test: Namespaced interface alias should be invalid
    {
      code: `
        declare namespace NS { export interface Obj { id: string } }
        type Alias = NS.Obj;
        export type T = { list: Alias[] };
      `,
      filename: 'functions/src/types/firestore/ns-alias-object.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'list' },
        },
      ],
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
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'list' },
        },
      ],
    },
    // Test: any[] should be flagged
    {
      code: `
        export type T = { loose: any[] };
      `,
      filename: 'functions/src/types/firestore/misc.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'loose' },
        },
      ],
    },
    // Test: unknown[] should be flagged
    {
      code: `
        export type T = { mystery: unknown[] };
      `,
      filename: 'functions/src/types/firestore/misc.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'mystery' },
        },
      ],
    },
    // Test: a const array of object literals indexed by [number] is still an
    // object array, so the const-array narrowing is not a blanket amnesty
    {
      code: `
export const OBJECT_VALUES = [{ a: 1 }, { a: 2 }] as const;
export type Entry = (typeof OBJECT_VALUES)[number];
export type Guild = { entries: Entry[] };
`,
      filename: 'functions/src/types/firestore/Guild/index.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: A const array mixing primitives and objects is still an object array
    {
      code: `
export const MIXED_VALUES = ['owner', { role: 'admin' }] as const;
export type Mixed = (typeof MIXED_VALUES)[number];
export type Guild = { entries: Mixed[] };
`,
      filename: 'functions/src/types/firestore/Guild/mixed.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'entries' },
        },
      ],
    },
    // Test: typeof over a non-array const carries no element union
    {
      code: `
export const ROLE_MAP = { owner: 1, admin: 2 } as const;
export type Role = (typeof ROLE_MAP)[number];
export type Guild = { roles: Role[] };
`,
      filename: 'functions/src/types/firestore/Guild/object-const.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'roles' },
        },
      ],
    },
    // Test: A non-number index is not the element union, so the conservative
    // object-lookup classification stands
    {
      code: `
export const MEMBER_ROLE_VALUES = ['owner', 'admin'] as const;
export type Length = (typeof MEMBER_ROLE_VALUES)['length'];
export type Guild = { lengths: Length[] };
`,
      filename: 'functions/src/types/firestore/Guild/length.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'lengths' },
        },
      ],
    },
    // Test: A const array that cannot be resolved in this file (for example an
    // imported one) stays conservative
    {
      code: `
import { IMPORTED_VALUES } from './values';
export type Imported = (typeof IMPORTED_VALUES)[number];
export type Guild = { entries: Imported[] };
`,
      filename: 'functions/src/types/firestore/Guild/imported.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'entries' },
        },
      ],
    },
    // Test: A const array of objects consumed inline, without an alias
    {
      code: `
export const OBJECT_VALUES = [{ a: 1 }] as const;
export type Guild = { entries: (typeof OBJECT_VALUES)[number][] };
`,
      filename: 'functions/src/types/firestore/Guild/inline-objects.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'entries' },
        },
      ],
    },
    // Test: An alias declared beside the model type inside a function body
    {
      code: `
function buildDefaults() {
  type Comment = { text: string; author: string };
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/nested-alias.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A nested interface element type
    {
      code: `
function buildDefaults() {
  interface Comment { text: string }
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/nested-interface.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: The generic array spellings resolve a nested element type too
    {
      code: `
function buildDefaults() {
  type Comment = { text: string };
  type Post = { generic: Array<Comment>; readonlyGeneric: ReadonlyArray<Comment> };
}
`,
      filename: 'functions/src/types/firestore/nested-generic.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'generic' },
        },
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'readonlyGeneric' },
        },
      ],
    },
    // Test: An alias declared inside an arrow function body
    {
      code: `
const buildDefaults = () => {
  type Comment = { text: string };
  type Post = { comments: Comment[] };
};
`,
      filename: 'functions/src/types/firestore/nested-arrow.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A bare block is a statement container like any other
    {
      code: `
{
  type Comment = { text: string };
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/nested-block.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A switch case holds its statements under `consequent`
    {
      code: `
switch (kind) {
  case 'post': {
    type Comment = { text: string };
    type Post = { comments: Comment[] };
    break;
  }
}
`,
      filename: 'functions/src/types/firestore/nested-switch.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A class static block is a statement container
    {
      code: `
class Builder {
  static {
    type Comment = { text: string };
    type Post = { comments: Comment[] };
  }
}
`,
      filename: 'functions/src/types/firestore/nested-static-block.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: The export forms are looked through in a nested container, so the
    // `export` keyword alone cannot decide whether an element type resolves
    {
      code: `
namespace Models {
  export type Comment = { text: string };
  export type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/nested-export-alias.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    {
      code: `
namespace Models {
  export interface Comment { text: string }
  export type Post = { comments: Array<Comment> };
}
`,
      filename: 'functions/src/types/firestore/nested-export-interface.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A nested alias declared below its own reference still resolves,
    // matching TypeScript's hoisting of type declarations
    {
      code: `
function buildDefaults() {
  type Post = { comments: Comment[] };
  type Comment = { text: string };
}
`,
      filename: 'functions/src/types/firestore/nested-hoisted.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A nested alias chain resolves each hop in the scope it is written in
    {
      code: `
function buildDefaults() {
  type Comment = { text: string };
  type Alias = Comment;
  type Post = { comments: Alias[] };
}
`,
      filename: 'functions/src/types/firestore/nested-alias-chain.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: The nearest declaration wins in the reporting direction too — an
    // inner object alias shadows a same-named outer primitive alias
    {
      code: `
type Comment = string;
function buildDefaults() {
  type Comment = { text: string };
  type Post = { comments: Comment[] };
}
`,
      filename: 'functions/src/types/firestore/shadow-object.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'comments' },
        },
      ],
    },
    // Test: A nested const array of objects behind `(typeof X)[number]` is still
    // an object array, so the widened const-array search stays conservative
    {
      code: `
function buildDefaults() {
  const OBJECT_VALUES = [{ a: 1 }] as const;
  type Post = { entries: (typeof OBJECT_VALUES)[number][] };
}
`,
      filename: 'functions/src/types/firestore/nested-const-objects.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'entries' },
        },
      ],
    },
    // Test: A same-named nested const array of objects shadows an outer const
    // array of primitives
    {
      code: `
export const VALUES = ['a', 'b'] as const;
function buildDefaults() {
  const VALUES = [{ a: 1 }] as const;
  type Post = { entries: (typeof VALUES)[number][] };
}
`,
      filename: 'functions/src/types/firestore/shadow-const-objects.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'entries' },
        },
      ],
    },
    // Test: Over-decline control for #2261. A parameter binds `Friend` in
    // VALUE space only, so the outer alias still answers in TYPE space and the
    // object array stays visible. Dropping the alias silences this case, which
    // is what makes the report evidence of resolution rather than a default
    {
      code: `
type Friend = { id: string; name: string };
export function makeProfile(Friend: string) {
  type UserProfile = {
    friends: Friend[];
  };
  return null as unknown as UserProfile;
}
`,
      filename: 'functions/src/types/firestore/value-binder-shadow.ts',
      errors: [
        {
          messageId: 'noObjectArrays',
          data: { fieldName: 'friends' },
        },
      ],
    },
  ],
});

// Both rules ship in the recommended config and the union rewriter is fixable,
// so a single `eslint --fix` pass must not turn silent Firestore types into
// violations by rewriting a literal union into `(typeof VALUES)[number]`.
describe('no-firestore-object-arrays after prefer-union-from-const-array --fix', () => {
  const TARGET_ID = '@blumintinc/blumint/no-firestore-object-arrays';
  const REWRITER_ID = '@blumintinc/blumint/prefer-union-from-const-array';
  const FILENAME = 'functions/src/types/firestore/Guild/index.ts';

  const SOURCE = [
    "export type MemberRole = 'owner' | 'admin' | 'member';",
    '',
    'export type Guild = {',
    '  id: string;',
    '  roles: MemberRole[];',
    '};',
    '',
  ].join('\n');

  const OBJECT_ARRAY_SOURCE = [
    'export type Guild = {',
    '  members: { id: string; name: string }[];',
    '};',
    '',
  ].join('\n');

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      TARGET_ID,
      noFirestoreObjectArrays as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      REWRITER_ID,
      preferUnionFromConstArray as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  it('reports nothing before or after the union rewriter runs', () => {
    const linter = makeLinter();
    expect(
      linter.verify(SOURCE, configFor({ [TARGET_ID]: 'error' }), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor({ [REWRITER_ID]: 'error' }),
      FILENAME,
    );
    // Without this assertion the test passes vacuously whenever the rewriter
    // stops emitting the const-array form.
    expect(fixed.output).toContain('(typeof MEMBER_ROLE_VALUES)[number]');
    expect(
      linter.verify(
        fixed.output,
        configFor({ [TARGET_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(0);
  });

  it('still reports a genuine object array through the same pipeline', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      OBJECT_ARRAY_SOURCE,
      configFor({ [REWRITER_ID]: 'error' }),
      FILENAME,
    );
    expect(
      linter.verify(
        fixed.output,
        configFor({ [TARGET_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(1);
  });
});
