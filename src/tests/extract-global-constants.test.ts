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
    // Should flag immutable array constants
    {
      code: `
        export class DatadogGitHubIssue implements GitHubIssueRequest {
          public get labels(): components['schemas']['issue']['labels'] {
            const labels = ['datadog', 'fix-me'];

            if (this.host) {
              labels.push(\`\${this.host}\`);
            }

            if (this.version) {
              labels.push(\`v\${this.version}\`);
            }

            return labels;
          }
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'labels' },
        },
      ],
    },
    // Should flag array with only immutable values
    {
      code: `
        function Component() {
          const COLORS = ['red', 'green', 'blue'];
          return COLORS;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'COLORS' },
        },
      ],
    },
    // Should flag array with immutable expressions
    {
      code: `
        function Component() {
          const SIZES = [100 + 50, 200 * 2, 300];
          return SIZES;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'SIZES' },
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
  ],
});
