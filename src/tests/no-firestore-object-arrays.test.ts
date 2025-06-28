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
    // Test: Allow string enum/type alias arrays
    {
      code: `
        export type ChannelGroupPermanence = 'temporary' | 'pinned' | 'permanent';
        export const TEMPORARY_PERMANENCE_TYPES: ChannelGroupPermanence[] = [
          'temporary',
          'pinned',
        ];
      `,
      filename:
        'functions/src/types/firestore/User/ChannelGroup/util/isTemporary.ts',
    },
    // Test: Allow union of string literals
    {
      code: `
        export type Status = 'active' | 'inactive' | 'pending';
        export type UserData = {
          statuses: Status[];
        };
      `,
      filename: 'functions/src/types/firestore/user-status.ts',
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
    // Test: Allow imported string union types (edge case from bug report)
    {
      code: `
        import { UserRole, Permission } from '../auth';
        export type UserData = {
          roles: UserRole[];
          permissions: Permission[];
        };
      `,
      filename: 'functions/src/types/firestore/user.ts',
    },
    // Test: Allow locally defined string union with complex names
    {
      code: `
        type DatabaseConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
        type NetworkProtocol = 'http' | 'https' | 'ws' | 'wss';
        export type SystemConfig = {
          dbStatuses: DatabaseConnectionStatus[];
          protocols: NetworkProtocol[];
        };
      `,
      filename: 'functions/src/types/firestore/config.ts',
    },
    // Test: Allow mixed primitive union arrays
    {
      code: `
        export type FlexibleData = {
          values: (string | number | boolean)[];
          optionalValues: Array<string | null | undefined>;
          mixedReadonly: ReadonlyArray<number | Date>;
        };
      `,
      filename: 'functions/src/types/firestore/flexible.ts',
    },
    // Test: Allow nested string unions
    {
      code: `
        type InnerStatus = 'active' | 'inactive';
        type OuterStatus = InnerStatus | 'pending';
        export type StatusData = {
          statuses: OuterStatus[];
        };
      `,
      filename: 'functions/src/types/firestore/status.ts',
    },
    // Test: Allow literal type arrays
    {
      code: `
        export type LiteralData = {
          specificStrings: ('option1' | 'option2' | 'option3')[];
          specificNumbers: (1 | 2 | 3 | 4 | 5)[];
          specificBooleans: (true | false)[];
        };
      `,
      filename: 'functions/src/types/firestore/literals.ts',
    },
    // Test: Allow arrays with generic constraints that resolve to primitives
    {
      code: `
        type StringLike<T extends string> = T;
        type NumberLike<T extends number> = T;
        export type GenericData = {
          stringLikes: StringLike<'test'>[];
          numberLikes: NumberLike<42>[];
        };
      `,
      filename: 'functions/src/types/firestore/generics.ts',
    },
    // Test: Allow enum-like const assertions
    {
      code: `
        const STATUSES = ['active', 'inactive', 'pending'] as const;
        type Status = typeof STATUSES[number];
        export type UserData = {
          statuses: Status[];
        };
      `,
      filename: 'functions/src/types/firestore/enums.ts',
    },
    // Test: Allow template literal types
    {
      code: `
        type EventType = \`user_\${string}\` | \`system_\${string}\`;
        export type EventData = {
          eventTypes: EventType[];
        };
      `,
      filename: 'functions/src/types/firestore/events.ts',
    },
    // Test: Allow keyof types that resolve to strings
    {
      code: `
        type ConfigKeys = {
          theme: string;
          language: string;
          timezone: string;
        };
        export type UserPreferences = {
          enabledFeatures: (keyof ConfigKeys)[];
        };
      `,
      filename: 'functions/src/types/firestore/preferences.ts',
    },
    // Test: Allow conditional types that resolve to primitives
    {
      code: `
        type StringOrNumber<T> = T extends string ? string : number;
        export type ConditionalData = {
          values: StringOrNumber<string>[];
        };
      `,
      filename: 'functions/src/types/firestore/conditional.ts',
    },
    // Test: Allow imported types from different modules
    {
      code: `
        import { FirebaseAuthError } from 'firebase-admin/auth';
        import { Timestamp } from 'firebase-admin/firestore';
        export type LogEntry = {
          timestamps: Timestamp[];
          errorCodes: string[];
        };
      `,
      filename: 'functions/src/types/firestore/logs.ts',
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
    // Test: Interface arrays (should be flagged)
    {
      code: `
        interface UserProfile {
          id: string;
          name: string;
        }
        export type UserData = {
          profiles: UserProfile[];
        };
      `,
      filename: 'functions/src/types/firestore/interfaces.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Class-like type arrays
    {
      code: `
        type UserClass = {
          new(): { id: string; name: string };
        };
        export type ClassData = {
          users: UserClass[];
        };
      `,
      filename: 'functions/src/types/firestore/classes.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Function type arrays (edge case)
    {
      code: `
        type Handler = {
          handle: (data: any) => void;
          name: string;
        };
        export type HandlerData = {
          handlers: Handler[];
        };
      `,
      filename: 'functions/src/types/firestore/handlers.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Complex nested object with arrays
    {
      code: `
        type NestedObject = {
          metadata: {
            tags: string[];
            config: { key: string; value: any };
          };
        };
        export type ComplexData = {
          items: NestedObject[];
        };
      `,
      filename: 'functions/src/types/firestore/complex-nested.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Object arrays in function parameters
    {
      code: `
        type ProcessorConfig = {
          name: string;
          options: Record<string, unknown>;
        };
        export type ProcessorData = {
          configs: Array<ProcessorConfig>;
        };
      `,
      filename: 'functions/src/types/firestore/processors.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Mixed object and primitive union (should be flagged if contains objects)
    {
      code: `
        type MixedItem = { id: string } | string;
        export type MixedData = {
          items: MixedItem[];
        };
      `,
      filename: 'functions/src/types/firestore/mixed.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Tuple-like object arrays
    {
      code: `
        type Coordinate = { x: number; y: number };
        type Point3D = { x: number; y: number; z: number };
        export type GeometryData = {
          coordinates: Coordinate[];
          points: Point3D[];
        };
      `,
      filename: 'functions/src/types/firestore/geometry.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Object arrays with optional properties
    {
      code: `
        type OptionalObject = {
          id: string;
          name?: string;
          metadata?: Record<string, unknown>;
        };
        export type OptionalData = {
          items: OptionalObject[];
        };
      `,
      filename: 'functions/src/types/firestore/optional.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Recursive object type arrays
    {
      code: `
        type TreeNode = {
          id: string;
          children: TreeNode[];
        };
        export type TreeData = {
          nodes: TreeNode[];
        };
      `,
      filename: 'functions/src/types/firestore/recursive.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Generic object type arrays
    {
      code: `
        type GenericObject<T> = {
          data: T;
          metadata: { created: Date };
        };
        export type GenericData = {
          items: GenericObject<string>[];
        };
      `,
      filename: 'functions/src/types/firestore/generic-objects.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
    // Test: Utility type object arrays
    {
      code: `
        type BaseUser = {
          id: string;
          name: string;
          email: string;
        };
        export type UserData = {
          partialUsers: Partial<BaseUser>[];
          requiredUsers: Required<BaseUser>[];
          pickedUsers: Pick<BaseUser, 'id' | 'name'>[];
        };
      `,
      filename: 'functions/src/types/firestore/utility-types.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Namespace qualified object arrays
    {
      code: `
        declare namespace API {
          interface Response {
            data: any;
            status: number;
          }
        }
        export type APIData = {
          responses: API.Response[];
        };
      `,
      filename: 'functions/src/types/firestore/namespaced.ts',
      errors: [{ messageId: 'noObjectArrays' }],
    },
  ],
});
