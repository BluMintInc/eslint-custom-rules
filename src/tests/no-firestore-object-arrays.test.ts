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
    // Test: Allow primitive arrays with undefined/null unions
    {
      code: `
        export type UserSettings = {
          id: string;
          preferences: (string | undefined)[];
          optionalTags: Array<string | null>;
          mixedValues: (string | number | boolean)[];
        };
      `,
      filename: 'functions/src/types/firestore/settings.ts',
    },
    // Test: Allow arrays of primitive types with complex unions
    {
      code: `
        export type DataTypes = {
          id: string;
          values: (string | number | boolean | null | undefined)[];
          timestamps: Array<Date | Timestamp>;
          coordinates: (GeoPoint | null)[];
        };
      `,
      filename: 'functions/src/types/firestore/data-types.ts',
    },
    // Test: Allow nested firestore directory structures (with primitive arrays)
    {
      code: `
        export type NestedType = {
          tags: string[];
          scores: number[];
        };
      `,
      filename: 'functions/src/types/firestore/nested/deep/type.ts',
    },
    // Test: Allow arrays in interface declarations
    {
      code: `
        export interface UserInterface {
          id: string;
          tags: string[];
          scores: number[];
        }
      `,
      filename: 'functions/src/types/firestore/interfaces.ts',
    },
    // Test: Allow optional primitive arrays
    {
      code: `
        export type OptionalArrays = {
          id: string;
          tags?: string[];
          scores?: Array<number>;
          flags?: ReadonlyArray<boolean>;
        };
      `,
      filename: 'functions/src/types/firestore/optional.ts',
    },
    // Test: Allow readonly primitive arrays
    {
      code: `
        export type ReadonlyArrays = {
          id: string;
          readonly tags: string[];
          readonly scores: ReadonlyArray<number>;
          readonly flags: readonly boolean[];
        };
      `,
      filename: 'functions/src/types/firestore/readonly.ts',
    },
    // Test: Allow tuple types (not arrays)
    {
      code: `
        export type TupleTypes = {
          id: string;
          coordinates: [number, number];
          rgb: [number, number, number];
          metadata: [string, number, boolean];
        };
      `,
      filename: 'functions/src/types/firestore/tuples.ts',
    },
    // Test: Allow arrays in generic type parameters
    {
      code: `
        export type GenericWrapper<T> = {
          id: string;
          data: T;
        };
        export type StringArrayWrapper = GenericWrapper<string[]>;
        export type NumberArrayWrapper = GenericWrapper<Array<number>>;
      `,
      filename: 'functions/src/types/firestore/generics.ts',
    },
    // Test: Allow arrays in conditional types with primitives
    {
      code: `
        export type ConditionalArray<T> = T extends string ? string[] : number[];
        export type StringOrNumberArray = ConditionalArray<string>;
      `,
      filename: 'functions/src/types/firestore/conditional.ts',
    },
    // Test: Allow arrays with simple utility types
    {
      code: `
        export type UtilityArrays = {
          id: string;
          names: string[];
          values: number[];
          flags: boolean[];
        };
      `,
      filename: 'functions/src/types/firestore/utility.ts',
    },
    // Test: Allow different firestore path variations
    {
      code: `
        export type PathVariation = {
          items: { id: string; value: string }[];
        };
      `,
      filename: 'functions\\src\\types\\firestore\\windows-path.ts',
    },
    // Test: Allow case variations in path
    {
      code: `
        export type CaseVariation = {
          items: { id: string; value: string }[];
        };
      `,
      filename: 'functions/src/types/FIRESTORE/case.ts',
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

    // Test: Arrays with namespace qualified types
    {
      code: `
        declare namespace MyNamespace {
          interface CustomType {
            value: string;
          }
        }
        export type NamespaceArrays = {
          id: string;
          items: MyNamespace.CustomType[];
          data: Array<MyNamespace.CustomType>;
        };
      `,
      filename: 'functions/src/types/firestore/namespace.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays of class instances
    {
      code: `
        class MyClass {
          value: string;
        }
        export type ClassArrays = {
          id: string;
          instances: MyClass[];
          objects: Array<MyClass>;
        };
      `,
      filename: 'functions/src/types/firestore/classes.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays with generic constraints
    {
      code: `
        interface Identifiable {
          id: string;
        }
        export type GenericArrays<T extends Identifiable> = {
          id: string;
          items: T[];
          data: Array<T>;
        };
      `,
      filename: 'functions/src/types/firestore/generic-constraints.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays in interface declarations
    {
      code: `
        interface ObjectData {
          value: string;
        }
        export interface InterfaceWithArrays {
          id: string;
          objects: ObjectData[];
          items: Array<ObjectData>;
        }
      `,
      filename: 'functions/src/types/firestore/interface-arrays.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Optional object arrays
    {
      code: `
        type OptionalObject = { value: string };
        export type OptionalObjectArrays = {
          id: string;
          optional?: OptionalObject[];
          maybeItems?: Array<OptionalObject>;
        };
      `,
      filename: 'functions/src/types/firestore/optional-objects.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Readonly object arrays
    {
      code: `
        type ReadonlyObject = { value: string };
        export type ReadonlyObjectArrays = {
          id: string;
          readonly items: ReadonlyObject[];
          readonly data: ReadonlyArray<ReadonlyObject>;
          readonly objects: readonly ReadonlyObject[];
        };
      `,
      filename: 'functions/src/types/firestore/readonly-objects.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays with conditional types containing objects
    {
      code: `
        type ConditionalObject<T> = T extends string ? { value: T } : { data: T };
        export type ConditionalObjectArrays = {
          id: string;
          items: ConditionalObject<string>[];
          data: Array<ConditionalObject<number>>;
        };
      `,
      filename: 'functions/src/types/firestore/conditional-objects.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays with utility types on objects
    {
      code: `
        type BaseObject = { name: string; value: number; flag: boolean };
        export type UtilityObjectArrays = {
          id: string;
          picked: Pick<BaseObject, 'name' | 'value'>[];
          omitted: Array<Omit<BaseObject, 'flag'>>;
          partial: Partial<BaseObject>[];
        };
      `,
      filename: 'functions/src/types/firestore/utility-objects.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Mixed primitive and object unions in arrays
    {
      code: `
        type MixedUnion = string | { value: number };
        export type MixedUnionArrays = {
          id: string;
          mixed: MixedUnion[];
          data: Array<string | { data: boolean }>;
        };
      `,
      filename: 'functions/src/types/firestore/mixed-unions.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Complex intersection with objects
    {
      code: `
        type BaseType = { id: string };
        type WithTimestamp = { timestamp: Date };
        type WithMetadata = { meta: Record<string, unknown> };
        export type ComplexIntersections = {
          id: string;
          items: (BaseType & WithTimestamp & WithMetadata)[];
          data: Array<BaseType & WithTimestamp>;
        };
      `,
      filename: 'functions/src/types/firestore/complex-intersections.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Very deeply nested object arrays (stress test)
    {
      code: `
        export type VeryDeepStructure = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: Array<{
                    deepData: {
                      moreData: { value: string }[];
                    }[];
                  }>;
                }[];
              }[];
            }[];
          }[];
        };
      `,
      filename: 'functions/src/types/firestore/very-deep.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Real-world tournament example from documentation
    {
      code: `
        interface Match {
          id: string;
          player1: string;
          player2: string;
          score1: number;
          score2: number;
        }
        export type Tournament = {
          id: string;
          name: string;
          matches: Match[];
          rounds: Array<{ roundNumber: number; matches: Match[] }>;
        };
      `,
      filename: 'functions/src/types/firestore/tournament.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: E-commerce product catalog example
    {
      code: `
        interface Product {
          id: string;
          name: string;
          price: number;
        }
        interface Category {
          id: string;
          name: string;
          products: Product[];
        }
        export type Catalog = {
          id: string;
          categories: Category[];
          featuredProducts: Array<Product>;
        };
      `,
      filename: 'functions/src/types/firestore/catalog.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Chat/messaging system example
    {
      code: `
        interface Message {
          id: string;
          text: string;
          sender: string;
          timestamp: Date;
        }
        interface Conversation {
          id: string;
          participants: string[];
          messages: Message[];
        }
        export type ChatSystem = {
          id: string;
          conversations: Conversation[];
          recentMessages: Array<Message>;
        };
      `,
      filename: 'functions/src/types/firestore/chat.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: File/media management system
    {
      code: `
        interface FileMetadata {
          id: string;
          name: string;
          size: number;
          type: string;
        }
        interface Folder {
          id: string;
          name: string;
          files: FileMetadata[];
          subfolders: Folder[];
        }
        export type FileSystem = {
          id: string;
          rootFolders: Folder[];
          recentFiles: Array<FileMetadata>;
        };
      `,
      filename: 'functions/src/types/firestore/filesystem.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays with template literal types
    {
      code: `
        type EventType = 'click' | 'hover' | 'focus';
        type EventHandler<T extends EventType> = {
          type: \`on\${Capitalize<T>}\`;
          handler: () => void;
        };
        export type EventHandlers = {
          id: string;
          handlers: EventHandler<EventType>[];
          listeners: Array<EventHandler<'click'>>;
        };
      `,
      filename: 'functions/src/types/firestore/events.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays in type with default export
    {
      code: `
        interface Item {
          id: string;
          value: string;
        }
        type DefaultType = {
          items: Item[];
          data: Array<Item>;
        };
        export default DefaultType;
      `,
      filename: 'functions/src/types/firestore/default-export.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Arrays in type assertions
    {
      code: `
        interface TypedItem {
          id: string;
          type: string;
        }
        export type AssertionTypes = {
          id: string;
          items: TypedItem[];
          data: Array<TypedItem>;
        };
      `,
      filename: 'functions/src/types/firestore/assertions.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
    // Test: Object arrays in nested firestore directory
    {
      code: `
        export type NestedObjectArrays = {
          items: { id: string; value: string }[];
          data: Array<{ name: string; count: number }>;
        };
      `,
      filename: 'functions/src/types/firestore/nested/deep/objects.ts',
      errors: [
        { messageId: 'noObjectArrays' },
        { messageId: 'noObjectArrays' },
      ],
    },
  ],
});
