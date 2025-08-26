import { RuleTester } from '@typescript-eslint/utils/dist/ts-eslint';
import { extractGlobalConstants } from '../rules/extract-global-constants';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('extract-global-constants', extractGlobalConstants, {
  valid: [
    // Should allow mutable array initialization inside functions
    {
      code: `
        function Component() {
          const items = [];
          items.push(1);
          return items;
        }
      `,
    },
    // Should allow mutable object initialization inside functions
    {
      code: `
        function Component() {
          const config = {};
          config.key = 'value';
          return config;
        }
      `,
    },
    // Should allow array initialization with methods inside functions
    {
      code: `
        function Component() {
          const items = [1, 2, 3].map(x => x * 2);
          return items;
        }
      `,
    },
    // Should allow array initialization with spread inside functions
    {
      code: `
        function Component() {
          const items = [...someArray];
          return items;
        }
      `,
    },
    // Should allow Set/Map initialization inside functions
    {
      code: `
        function Component() {
          const set = new Set();
          set.add(1);
          return set;
        }
      `,
    },
    // Test case from the bug report
    {
      code: `
        const menuItemsFile = useMemo(() => {
          const items: ReactNode[] = [];
          if (MenuItemEdit) {
            items.push(MenuItemEdit);
          }
          if (MenuItemRemove) {
            items.push(MenuItemRemove);
          }
          return items;
        }, [MenuItemEdit, MenuItemRemove]);
      `,
    },
    // Should handle jest.resetModules() without throwing TypeError
    {
      code: `
        export async function mockFirestore(rootCollections: MockCollections) {
          mockFirebase(rootCollections);
          const mockFirebaseAdmin = await import('firebase-admin');
          jest.mock('../../../../functions/src/config/firebaseAdmin', () => {
            return {
              db: mockFirebaseAdmin.firestore(),
            };
          });

          // Clear the module cache to ensure the new mock is used
          jest.resetModules();
        }
      `,
    },
    // Should allow nested array/object initialization
    {
      code: `
        function Component() {
          const nested = { arr: [1, 2, { items: [] }] };
          nested.arr[2].items.push(3);
          return nested;
        }
      `,
    },
    // Should allow array/object destructuring with mutation
    {
      code: `
        function Component() {
          const { items = [] } = props;
          items.push(1);
          return items;
        }
      `,
    },
    // Should allow class instance creation
    {
      code: `
        function Component() {
          const instance = new MyClass();
          instance.configure();
          return instance;
        }
      `,
    },
    // Should allow Promise chain returning mutable values
    {
      code: `
        function Component() {
          const result = Promise.resolve([])
            .then(arr => {
              arr.push(1);
              return arr;
            });
          return result;
        }
      `,
    },
    // Should handle generic type constraints
    {
      code: `
        import { DocumentData, DocumentReference } from 'firebase-admin/firestore';
        import { PartialWithFieldValue } from 'firebase-admin/firestore';

        export class DocSetter<T extends { id: string } & DocumentData> {
          public set = async (documentData: DocumentDataPartial<T>) => {
            const ref = this.collectionRef.doc(documentData.id) as DocumentReference<T>;
            await this.converterApplier
              .toDocumentRef(ref)
              .set(documentData as PartialWithFieldValue<T>, { merge: true });
            return ref;
          };
        }
      `,
    },
    // Should allow JSX elements in local variables
    {
      code: `
        import { ReactNode } from 'react';
        import { EventHit, RenderCard, RenderWrapper } from '../algolia/catalog-wrappers/EventsCalendar';

        export const transformToEventKeyed = <THit extends EventHit<Date>>({
          hit,
          Card,
          Wrapper,
        }: TransformToEventProps<THit>) => {
          const cardRendered: ReactNode = <Card {...hit} />;

          return {
            key: hit.objectID,
            Node: Wrapper ? <Wrapper hit={hit}>{cardRendered}</Wrapper> : cardRendered,
          };
        };
      `,
    },
    // Should allow 0 and 1 in loop expressions
    {
      code: `
        function loopWithZeroAndOne() {
          for (let i = 0; i < array.length; i += 1) {
            console.log(i);
          }
        }
      `,
    },
    // Should allow 0 and 1 in loop expressions (alternative syntax)
    {
      code: `
        function loopWithZeroAndOne() {
          for (let i = 0; i <= 1; i++) {
            console.log(i);
          }
        }
      `,
    },
    // Should allow dynamic values in loop expressions
    {
      code: `
        function loopWithDynamicValues() {
          for (let i = 0; i < items.length; i++) {
            console.log(items[i]);
          }
        }
      `,
    },
    // Should allow as const in loop expressions
    {
      code: `
        function loopWithAsConst() {
          const START = 2 as const;
          const INCREMENT = 2 as const;
          const MAX = 10 as const;
          for (let i = START; i < MAX; i += INCREMENT) {
            console.log(i);
          }
        }
      `,
    },
    // Should allow as const inline in loop expressions
    {
      code: `
        function loopWithInlineAsConst() {
          for (let i = 2 as const; i < 10 as const; i += 2 as const) {
            console.log(i);
          }
        }
      `,
    },
    // Should allow while loops with 0 and 1
    {
      code: `
        function whileLoopWithZeroAndOne() {
          let count = 0;
          while (count < 1) {
            count++;
          }
        }
      `,
    },
    // Should allow do-while loops with 0 and 1
    {
      code: `
        function doWhileLoopWithZeroAndOne() {
          let count = 0;
          do {
            count++;
          } while (count < 1);
        }
      `,
    },
    // Should handle destructuring pattern with empty declarations array
    {
      code: `
        import type { DocumentData } from 'firebase-admin/firestore';

        interface PropagatorFactory<T, U> {}
        interface AlgoliaPropagatorFactoryProps<T, U> {}
        interface AlgoliaPropagatorBuildProps<T, U> {}
        class AlgoliaPropagator {
          constructor(props: any) {}
        }

        class AlgoliaPropagatorFactory<
          TData extends DocumentData,
          TDataTransformed extends DocumentData = TData,
        > implements PropagatorFactory<TData, TDataTransformed>
        {
          constructor(
            private readonly props: AlgoliaPropagatorFactoryProps<
              TData,
              TDataTransformed
            >,
          ) {}

          public buildAll({
            data,
            beforeData,
            path,
            fieldPrepperFactory,
          }: AlgoliaPropagatorBuildProps<TData, TDataTransformed>) {
            const dataUnprepped = this.transformData
              ? this.transformData(data)
              : (data as unknown as TDataTransformed);

            const beforeDataUnprepped =
              beforeData && this.transformData
                ? this.transformData(beforeData)
                : (beforeData as unknown as TDataTransformed);
            return [
              new AlgoliaPropagator({
                unpreppedData: dataUnprepped,
                unpreppedDataBefore: beforeDataUnprepped,
                path,
                index: this.index,
                fieldPrepperFactory,
              }),
            ] as const;
          }

          private get transformData() {
            return this.props.transformData;
          }

          private get index() {
            return this.props.index;
          }
        }
      `,
    },
    // Should handle object destructuring with immutable values
    {
      code: `
        function Component() {
          const { name, age } = { name: 'John', age: 30 };
          return name + age;
        }
      `,
    },
    // Should handle array destructuring with immutable values
    {
      code: `
        function Component() {
          const [first, second] = ['hello', 'world'];
          return first + second;
        }
      `,
    },
    // Should handle nested object destructuring
    {
      code: `
        function Component() {
          const { user: { name, profile: { age } } } = data;
          return name + age;
        }
      `,
    },
    // Should handle nested array destructuring
    {
      code: `
        function Component() {
          const [[a, b], [c, d]] = [[1, 2], [3, 4]];
          return a + b + c + d;
        }
      `,
    },
    // Should handle mixed destructuring patterns
    {
      code: `
        function Component() {
          const { items: [first, ...rest] } = { items: [1, 2, 3] };
          return first + rest.length;
        }
      `,
    },
    // Should handle destructuring with defaults
    {
      code: `
        function Component() {
          const { name = 'default', count = 0 } = props;
          return name + count;
        }
      `,
    },
    // Should handle array destructuring with defaults
    {
      code: `
        function Component() {
          const [x = 1, y = 2] = arr;
          return x + y;
        }
      `,
    },
    // Should handle destructuring with rest elements
    {
      code: `
        function Component() {
          const { first, ...rest } = obj;
          return first + Object.keys(rest).length;
        }
      `,
    },
    // Should handle array destructuring with rest elements
    {
      code: `
        function Component() {
          const [head, ...tail] = arr;
          return head + tail.length;
        }
      `,
    },
    // Should handle empty object destructuring
    {
      code: `
        function Component() {
          const {} = obj;
          return 'empty';
        }
      `,
    },
    // Should handle empty array destructuring
    {
      code: `
        function Component() {
          const [] = arr;
          return 'empty';
        }
      `,
    },
    // Should handle destructuring with computed property names
    {
      code: `
        function Component() {
          const { [key]: value } = obj;
          return value;
        }
      `,
    },
    // Should handle destructuring in arrow functions
    {
      code: `
        const handler = ({ data, meta }) => {
          return data + meta;
        };
      `,
    },
    // Should handle destructuring in function expressions
    {
      code: `
        const handler = function({ data, meta }) {
          return data + meta;
        };
      `,
    },
    // Should handle destructuring in method definitions
    {
      code: `
        class Component {
          process({ data, meta }) {
            return data + meta;
          }
        }
      `,
    },
    // Should handle destructuring in async functions
    {
      code: `
        async function process({ data, meta }) {
          const result = await fetch(data);
          return result + meta;
        }
      `,
    },
    // Should handle destructuring in generator functions
    {
      code: `
        function* generate({ start, end }) {
          for (let i = start; i < end; i++) {
            yield i;
          }
        }
      `,
    },
    // Should handle destructuring with type annotations
    {
      code: `
        function Component() {
          const { name, age }: { name: string; age: number } = person;
          return name + age;
        }
      `,
    },
    // Should handle destructuring in try-catch blocks
    {
      code: `
        function Component() {
          try {
            const { data } = response;
            return data;
          } catch ({ message }) {
            return message;
          }
        }
      `,
    },
    // Should handle destructuring in for-of loops
    {
      code: `
        function Component() {
          for (const { name, value } of items) {
            console.log(name, value);
          }
        }
      `,
    },
    // Should handle destructuring in for-in loops
    {
      code: `
        function Component() {
          for (const [key, value] of Object.entries(obj)) {
            console.log(key, value);
          }
        }
      `,
    },
    // Should handle complex destructuring with multiple patterns
    {
      code: `
        function Component() {
          const {
            user: { name, profile: { settings: [theme, lang] } },
            meta: { timestamp }
          } = complexData;
          return name + theme + lang + timestamp;
        }
      `,
    },
    // Should handle destructuring with renamed variables
    {
      code: `
        function Component() {
          const { name: userName, age: userAge } = user;
          return userName + userAge;
        }
      `,
    },
    // Should handle destructuring in block statements
    {
      code: `
        function Component() {
          {
            const { data } = response;
            console.log(data);
          }
          return 'done';
        }
      `,
    },
    // Should handle destructuring in if statements
    {
      code: `
        function Component() {
          if (condition) {
            const { result } = computation;
            return result;
          }
          return null;
        }
      `,
    },
    // Should handle destructuring in switch statements
    {
      code: `
        function Component() {
          switch (type) {
            case 'user': {
              const { name } = data;
              return name;
            }
            default:
              return null;
          }
        }
      `,
    },
    // Should handle destructuring with mutable values (should not trigger rule)
    {
      code: `
        function Component() {
          const { items } = { items: [] };
          items.push(1);
          return items;
        }
      `,
    },
    // Should handle destructuring with function values (should not trigger rule)
    {
      code: `
        function Component() {
          const { handler } = { handler: () => {} };
          return handler();
        }
      `,
    },
    // Firestore sentinels inside object literal with as const satisfies should NOT be flagged
    {
      code: `
        function createEvent(expireAt: Date) {
          const varipotentEventData = {
            createdAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromDate(expireAt),
          } as const satisfies UpdateData<VaripotentEvent>;
          return varipotentEventData;
        }
      `,
    },
    // Same as above but with extra parentheses around the object and only as const
    {
      code: `
        function createEvent(expireAt: Date) {
          const varipotentEventData = ({
            createdAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromDate(expireAt),
          } as const);
          return varipotentEventData;
        }
      `,
    },
    // Using other FieldValue sentinels (increment/arrayUnion) should also be ignored
    {
      code: `
        function updateStats() {
          const update = {
            views: FieldValue.increment(1),
            tags: FieldValue.arrayUnion('x'),
            lastViewed: FieldValue.serverTimestamp(),
          } as const satisfies UpdateData<Stats>;
          return update;
        }
      `,
    },
    // Nested object with sentinels should be ignored
    {
      code: `
        function nestedUpdate(userId: string, expireAt: Date) {
          const payload = {
            user: {
              id: userId,
              lastLogin: FieldValue.serverTimestamp(),
            },
            meta: {
              expireAt: Timestamp.fromDate(expireAt),
            },
          } as const satisfies UpdateData<UserDoc>;
          return payload;
        }
      `,
    },
    // Object literal with a TS as-type (not const) plus sentinel should be ignored
    {
      code: `
        function asTypeOnly(expireAt: Date) {
          const data = ({
            createdAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromDate(expireAt),
          } as UpdateData<VaripotentEvent>);
          return data;
        }
      `,
    },
    // ParenthesizedExpression + satisfies wrapper around object with sentinel should be ignored
    {
      code: `
        function parenthesized(expireAt: Date) {
          const data = (({
            createdAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromDate(expireAt),
          }) as const) satisfies UpdateData<VaripotentEvent>;
          return data;
        }
      `,
    },
    // Optional chaining leading to a call expression in a property should still be ignored
    {
      code: `
        function withOptional(expireAt: Date) {
          const data = {
            createdAt: FieldValue?.serverTimestamp(),
            expireAt: Timestamp.fromDate(expireAt),
          } as const;
          return data;
        }
      `,
    },
    // Arrays without explicit readonly should be allowed (mutable by default)
    {
      code: `
        export class DatadogGitHubIssue implements GitHubIssueRequest {
          public get labels(): components['schemas']['issue']['labels'] {
            const labels = ['datadog', 'fix-me'];

            if (this.host) {
              labels.push(\`${'${'}this.host${'}'}\`);
            }

            if (this.version) {
              labels.push(\`v${'${'}this.version${'}'}\`);
            }

            return labels;
          }
        }
      `,
    },
    {
      code: `
        function Component() {
          const COLORS = ['red', 'green', 'blue'];
          return COLORS;
        }
      `,
    },
    {
      code: `
        function Component() {
          const SIZES = [100 + 50, 200 * 2, 300];
          return SIZES;
        }
      `,
    },
  ],
  invalid: [
    // Should flag immutable string constants
    {
      code: `
        function Component() {
          const MESSAGE = 'Hello';
          return MESSAGE;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'MESSAGE' },
        },
      ],
    },
    // Should flag immutable number constants
    {
      code: `
        function Component() {
          const MAX_COUNT = 100;
          return MAX_COUNT;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'MAX_COUNT' },
        },
      ],
    },
    // Should flag immutable boolean constants
    {
      code: `
        function Component() {
          const ENABLED = true;
          return ENABLED;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'ENABLED' },
        },
      ],
    },
    // Should flag immutable RegExp constants
    {
      code: `
        function Component() {
          const REGEX = /test/;
          return REGEX;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'REGEX' },
        },
      ],
    },
    // Should flag numeric literals > 1 in for loop initialization
    {
      code: `
        function loopWithMagicNumbers() {
          for (let i = 3; i < array.length; i++) {
            console.log(i);
          }
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 3 },
        },
      ],
    },
    // Should flag numeric literals > 1 in for loop test condition
    {
      code: `
        function loopWithMagicNumbers() {
          for (let i = 0; i < 5; i++) {
            console.log(i);
          }
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 5 },
        },
      ],
    },
    // Should flag numeric literals > 1 in for loop update expression
    {
      code: `
        function loopWithMagicNumbers() {
          for (let i = 0; i < array.length; i += 2) {
            console.log(i);
          }
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 2 },
        },
      ],
    },
    // Should flag numeric literals > 1 in while loop test condition
    {
      code: `
        function whileLoopWithMagicNumbers() {
          let count = 0;
          while (count < 5) {
            count++;
          }
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 5 },
        },
      ],
    },
    // Should flag numeric literals > 1 in do-while loop test condition
    {
      code: `
        function doWhileLoopWithMagicNumbers() {
          let count = 0;
          do {
            count += 2;
          } while (count < 10);
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 10 },
        },
      ],
    },
    // Should flag multiple numeric literals > 1 in the same loop
    {
      code: `
        function loopWithMultipleMagicNumbers() {
          for (let i = 2; i < 10; i += 3) {
            console.log(i);
          }
        }
      `,
      errors: [
        {
          messageId: 'requireAsConst',
          data: { value: 2 },
        },
        {
          messageId: 'requireAsConst',
          data: { value: 10 },
        },
        {
          messageId: 'requireAsConst',
          data: { value: 3 },
        },
      ],
    },
    // Should still flag regular identifier constants (not destructuring)
    {
      code: `
        function Component() {
          const API_URL = 'https://api.example.com';
          return fetch(API_URL);
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'API_URL' },
        },
      ],
    },
    // Should flag multiple identifier constants in same function
    {
      code: `
        function Component() {
          const MAX_RETRIES = 3;
          const TIMEOUT = 5000;
          return { MAX_RETRIES, TIMEOUT };
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'MAX_RETRIES' },
        },
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'TIMEOUT' },
        },
      ],
    },
    // Should flag identifier constants in nested blocks
    {
      code: `
        function Component() {
          if (condition) {
            const ERROR_MESSAGE = 'Something went wrong';
            return ERROR_MESSAGE;
          }
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'ERROR_MESSAGE' },
        },
      ],
    },
    // Should flag identifier constants in arrow functions
    {
      code: `
        const handler = () => {
          const DEFAULT_VALUE = 42;
          return DEFAULT_VALUE;
        };
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'DEFAULT_VALUE' },
        },
      ],
    },
    // Should flag identifier constants in async functions
    {
      code: `
        async function fetchData() {
          const CACHE_KEY = 'user-data';
          return await cache.get(CACHE_KEY);
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'CACHE_KEY' },
        },
      ],
    },
  ],
});
