import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import {
  ruleTesterJsx,
  ruleTesterTs,
  withParserOptions,
} from '../utils/ruleTester';
import { extractGlobalConstants } from '../rules/extract-global-constants';

const buildExtractMessage = (name: string) =>
  `What's wrong: Declaration "${name}" does not reference values from this scope.\nWhy it matters: Keeping it nested recreates the same constant/helper on every call, which adds avoidable allocations and obscures that the value can be shared.\nHow to fix: Hoist it to module scope (use UPPER_SNAKE_CASE for immutable constants) so it is created once and can be imported.`;

const buildRequireAsConstMessage = (value: number) =>
  `What's wrong: Numeric literal ${value} is used directly as a loop boundary.\nWhy it matters: Without "as const", TypeScript widens it to number, so if you later extract or reuse the value you lose the literal-type boundary and it is easier for related loops to drift out of sync.\nHow to fix: Extract it to a named constant with "as const" (or add "as const" inline) to keep the boundary explicit and reusable.`;

type ExtractGlobalConstantsError = TSESLint.TestCaseError<
  'extractGlobalConstants' | 'requireAsConst'
>;

const buildExtractError = (name: string): ExtractGlobalConstantsError =>
  ({
    message: buildExtractMessage(name),
  } as unknown as ExtractGlobalConstantsError);

const buildRequireAsConstError = (value: number): ExtractGlobalConstantsError =>
  ({
    message: buildRequireAsConstMessage(value),
  } as unknown as ExtractGlobalConstantsError);

// The shared JSX tester supplies the parser and `ecmaFeatures.jsx`; module
// scope analysis is not its default, and this rule resolves references to
// decide whether a declaration is scope-independent, so every snippet declares
// it.
const parserOptions = {
  ecmaVersion: 2018,
  sourceType: 'module',
} as const;

ruleTesterJsx.run('extract-global-constants', extractGlobalConstants, {
  valid: withParserOptions(parserOptions, [
    /**
     * A nested helper that closes over its enclosing scope cannot be hoisted
     * (issue #1755). `declarationIncludesIdentifier` decides this, and every
     * node type it fails to walk falls through to "references nothing" — an
     * inverted answer, not a missed one — so each construct below is pinned.
     */
    {
      code: `
        function outer(dep) {
          function inner() {
            return dep();
          }
          return inner;
        }
      `,
    },
    // Referenced only through JSX: element name, attribute, spread, child.
    {
      code: `
        function outer(Comp) {
          function inner() {
            return <Comp />;
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(value) {
          function inner() {
            return <div x={value} />;
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(props) {
          function inner() {
            return <div {...props} />;
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(value) {
          function inner() {
            return <>{value}</>;
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(Namespaced) {
          function inner() {
            return <Namespaced.Item />;
          }
          return inner;
        }
      `,
    },
    // Referenced only inside a loop or switch body.
    {
      code: `
        function outer(items) {
          function inner() {
            for (const item of items) {
              consume(item);
            }
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(flag) {
          function inner() {
            while (flag) {
              break;
            }
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(dep) {
          function inner() {
            switch (1) {
              case 1:
                return dep();
            }
          }
          return inner;
        }
      `,
    },
    {
      code: `
        function outer(Base) {
          function inner() {
            class Derived extends Base {}
            return Derived;
          }
          return inner;
        }
      `,
    },
    // Already at module scope: nothing to hoist.
    {
      code: `
        function topLevel() {
          return 1;
        }
      `,
    },
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
    // Regression: nested destructuring with local const inside async handler must not crash
    {
      code: `
        import { DocumentChangeHandler } from '../../../v2/handlerTypes';
        import { GitHubIssue } from '../../../types/firestore/GitHubIssue';
        import { GitHubIssuePath } from '../../../types/firestore/GitHubIssue/path';
        import { extractChangedIssueParams } from '../../../util/github/extractIssueParamsChanged';

        export const respondGitHubIssueChange: DocumentChangeHandler<
          GitHubIssue,
          GitHubIssuePath
        > = async ({ data: { after, before } }) => {
          const issueAfter = after.data();
          const issueBefore = before.data();

          if (!issueAfter) return;

          const changedFields = extractChangedIssueParams({
            before: issueBefore,
            after: issueAfter,
          });

          // eslint-disable-next-line no-restricted-properties
          if (Object.keys(changedFields).length === 0) return;
        };
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
    // A BinaryExpression update whose right operand is 1 stays silent, like the
    // AssignmentExpression form
    {
      code: `
        function loopWithBinaryUpdateOfOne() {
          for (let i = 0; i < array.length; i + 1) {
            console.log(i);
          }
        }
      `,
    },
    // "as const" also exempts the right operand of a BinaryExpression update
    {
      code: `
        function loopWithBinaryUpdateAsConst() {
          for (let i = 0; i < array.length; i + (2 as const)) {
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
            const labels = ['datadog', 'bug'];

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
    // Regression for #1103: IIFE capturing local variables should not be flagged
    {
      code: `
        import { useState } from 'react';
        import { isPromiseLike } from 'functions/src/util/isPromiseLike';

        export function useExample(result: any) {
          const [isLoading, setIsLoading] = useState(false);

          if (isPromiseLike(result)) {
            // Should NOT be flagged: It captures 'result' and 'setIsLoading' from the local scope.
            const promise: any = (async () => {
              try {
                return await result;
              } finally {
                setIsLoading(false);
              }
            })();
            return promise;
          }
          
          return result;
        }
      `,
    },
  ]),
  invalid: withParserOptions(parserOptions, [
    /**
     * The "functions" half of this rule (issue #1755). Its guard tested
     * `node.parent.type` against function types, but a FunctionDeclaration is a
     * Statement whose parent is always a statement container, so the branch was
     * unsatisfiable and no nested helper could ever be reported.
     */
    {
      code: `
        function outer() {
          function inner() {
            return 1;
          }
          return inner();
        }
      `,
      errors: [buildExtractError('inner')],
    },
    {
      code: `
        const outer = () => {
          function inner() {
            return 1;
          }
          return inner();
        };
      `,
      errors: [buildExtractError('inner')],
    },
    // An intrinsic element is not a binding, so this closes over nothing.
    {
      code: `
        function outer() {
          function inner() {
            return <div />;
          }
          return inner();
        }
      `,
      errors: [buildExtractError('inner')],
    },
    // Should flag immutable string constants
    {
      code: `
        function Component() {
          const MESSAGE = 'Hello';
          return MESSAGE;
        }
      `,
      errors: [buildExtractError('MESSAGE')],
    },
    // Should flag immutable number constants
    {
      code: `
        function Component() {
          const MAX_COUNT = 100;
          return MAX_COUNT;
        }
      `,
      errors: [buildExtractError('MAX_COUNT')],
    },
    // Should flag immutable boolean constants
    {
      code: `
        function Component() {
          const ENABLED = true;
          return ENABLED;
        }
      `,
      errors: [buildExtractError('ENABLED')],
    },
    // Should flag immutable RegExp constants
    {
      code: `
        function Component() {
          const REGEX = /test/;
          return REGEX;
        }
      `,
      errors: [buildExtractError('REGEX')],
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
      errors: [buildRequireAsConstError(3)],
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
      errors: [buildRequireAsConstError(5)],
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
      errors: [buildRequireAsConstError(2)],
    },
    // Should flag numeric literals > 1 when the update is a BinaryExpression
    // rather than the usual UpdateExpression / AssignmentExpression
    {
      code: `
        function loopWithBinaryUpdate() {
          for (let i = 0; i < array.length; i + 2) {
            console.log(i);
          }
        }
      `,
      errors: [buildRequireAsConstError(2)],
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
      errors: [buildRequireAsConstError(5)],
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
      errors: [buildRequireAsConstError(10)],
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
        buildRequireAsConstError(2),
        buildRequireAsConstError(10),
        buildRequireAsConstError(3),
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
      errors: [buildExtractError('API_URL')],
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
      errors: [buildExtractError('MAX_RETRIES'), buildExtractError('TIMEOUT')],
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
      errors: [buildExtractError('ERROR_MESSAGE')],
    },
    // Should flag identifier constants in arrow functions
    {
      code: `
        const handler = () => {
          const DEFAULT_VALUE = 42;
          return DEFAULT_VALUE;
        };
      `,
      errors: [buildExtractError('DEFAULT_VALUE')],
    },
    // Should flag identifier constants in async functions
    {
      code: `
        async function fetchData() {
          const CACHE_KEY = 'user-data';
          return await cache.get(CACHE_KEY);
        }
      `,
      errors: [buildExtractError('CACHE_KEY')],
    },
  ]),
});

/**
 * The arrow half of issue #1755. A nested helper spelled `const inner = () =>`
 * asks the same hoisting question as `function inner()`, so the two spellings
 * must answer identically: report when the helper reads nothing from its
 * enclosing scope, stay silent when it closes over an enclosing binding,
 * captures lexical `this`/`super`/`new.target`, or names an enclosing type
 * parameter.
 */
ruleTesterTs.run('extract-global-constants', extractGlobalConstants, {
  valid: [
    // Closure over the enclosing function's parameter blocks hoisting.
    `
      function outer(limit: number) {
        const withinLimit = () => limit > 0;
        return withinLimit;
      }
    `,
    // Closure over an enclosing local blocks hoisting.
    `
      function outer() {
        const seed = computeSeed();
        const helper = () => seed + 1;
        return helper();
      }
    `,
    // An arrow nested in an arrow closes over the outer arrow's parameter.
    `
      const outer = (base: number) => {
        const scaled = () => base * 2;
        return scaled();
      };
    `,
    // A function-expression helper closing over a local is just as pinned.
    `
      function outer() {
        const flag = readFlag();
        const check = function () {
          return flag;
        };
        return check();
      }
    `,
    // An arrow captures the lexical `this` of the enclosing method, even when
    // `this` never appears as a member-expression object.
    `
      class Counter {
        snapshot() {
          const grab = () => this;
          return grab();
        }
      }
    `,
    `
      class Counter {
        count = 0;
        increment() {
          const bump = () => this.count + 1;
          return bump();
        }
      }
    `,
    // `super` is bound to the enclosing method, so the arrow cannot move.
    `
      class Derived extends Base {
        render() {
          const call = () => super.render();
          return call();
        }
      }
    `,
    // A parameter default reading `this` captures it just as a body would.
    `
      class Box {
        wrap() {
          const pick = (value = this) => value;
          return pick();
        }
      }
    `,
    // `new.target` belongs to the enclosing constructor-callable function.
    `
      function outer() {
        const madeWithNew = () => new.target;
        return madeWithNew;
      }
    `,
    // A class property arrow is a class member, not a nested `const` helper.
    `
      class Widget {
        onPing = () => 1;
      }
    `,
    // IIFE initializer capturing an enclosing parameter (#1103's shape).
    `
      function outer(input: string) {
        const normalized = (() => input.trim())();
        return normalized;
      }
    `,
    // The return type names the enclosing function's type parameter, so
    // hoisting would not compile even though the body reads nothing.
    `
      function outer<T>() {
        const makeList = (): T[] => [];
        return makeList;
      }
    `,
    // Same blocker, declaration spelling: the two halves stay symmetric.
    `
      function outer<T>() {
        function makeList(): T[] {
          return [];
        }
        return makeList;
      }
    `,
    // The enclosing class's type parameter is just as scope-bound.
    `
      class Repo<T> {
        list() {
          const emptyPage = (): T[] => [];
          return emptyPage();
        }
      }
    `,
    // The declarator's own annotation can carry the scope-bound name too.
    `
      function outer<T>() {
        const makeList: () => T[] = () => [];
        return makeList;
      }
    `,
    // A parameter type annotation naming the enclosing type parameter.
    `
      function outer<T>(seed: T) {
        const wrap = (sample: T) => [];
        return wrap;
      }
    `,
    // `let`-bound helpers may be reassigned; only `const` helpers are stable
    // enough to hoist.
    `
      function outer() {
        let handler = () => 1;
        handler = () => 2;
        return handler();
      }
    `,
    // Recursion through the binding name reads from the enclosing scope; the
    // conservative answer is silence.
    `
      function outer() {
        const loop = (): number => loop();
        return loop;
      }
    `,
    // A dependency-carrying helper exempts its whole declaration list.
    `
      function outer(dep: () => void) {
        const first = 1, second = () => dep();
        return second;
      }
    `,
    // Module scope: nothing to hoist.
    `const topHelper = () => 1;`,
  ],
  invalid: [
    // The repro from #1755: a nested arrow helper that closes over nothing.
    {
      code: `
        function outer() {
          const inner = () => 1;
          return inner();
        }
      `,
      errors: [buildExtractError('inner')],
    },
    {
      code: `
        const outer = () => {
          const inner = () => {
            return 1;
          };
          return inner();
        };
      `,
      errors: [buildExtractError('inner')],
    },
    // Function-expression spelling of the same helper.
    {
      code: `
        function outer() {
          const inner = function () {
            return 1;
          };
          return inner();
        }
      `,
      errors: [buildExtractError('inner')],
    },
    // `async` does not change the hoisting question.
    {
      code: `
        function outer() {
          const delayed = async () => 1;
          return delayed();
        }
      `,
      errors: [buildExtractError('delayed')],
    },
    // A dependency-free helper inside a class method is hoistable.
    {
      code: `
        class Widget {
          compute() {
            const double = () => 2;
            return double();
          }
        }
      `,
      errors: [buildExtractError('double')],
    },
    // Block scope inside a function is still function-nested.
    {
      code: `
        function outer(flag: boolean) {
          if (flag) {
            const noop = () => {};
            noop();
          }
        }
      `,
      errors: [buildExtractError('noop')],
    },
    // A generic helper whose only type parameter is its own is hoistable.
    {
      code: `
        function outer() {
          const makeList = <T>(): T[] => [];
          return makeList;
        }
      `,
      errors: [buildExtractError('makeList')],
    },
    // Annotations alone are not dependencies.
    {
      code: `
        function outer() {
          const toZero = (input: number): number => 0;
          return toZero;
        }
      `,
      errors: [buildExtractError('toZero')],
    },
    // Both declarators are scope-free, so both are reported.
    {
      code: `
        function outer() {
          const LIMIT = 5, makeEmpty = () => [];
          return makeEmpty;
        }
      `,
      errors: [buildExtractError('LIMIT'), buildExtractError('makeEmpty')],
    },
    // A TS assertion between the binding and the arrow does not exempt it.
    {
      code: `
        function outer() {
          const cb = (() => 1) as () => number;
          return cb;
        }
      `,
      errors: [buildExtractError('cb')],
    },
    // Dynamic `this` in a function expression is not a lexical capture.
    {
      code: `
        function outer() {
          const helper = function () {
            return this;
          };
          return helper;
        }
      `,
      errors: [buildExtractError('helper')],
    },
    // Returning a fresh literal each call still reads nothing from scope.
    {
      code: `
        function outer() {
          const buildConfig = () => ({ retries: 3 });
          return buildConfig();
        }
      `,
      errors: [buildExtractError('buildConfig')],
    },
  ],
});

describe('extract-global-constants visitor safety', () => {
  it('ignores missing declarators without crashing', () => {
    const context = {
      report: jest.fn(),
      getScope: () => ({ type: 'function' }),
    } as unknown as TSESLint.RuleContext<
      'extractGlobalConstants' | 'requireAsConst',
      []
    >;

    const listeners = extractGlobalConstants.create(context);
    const visitVariableDeclaration = listeners.VariableDeclaration!;

    expect(() =>
      visitVariableDeclaration({
        type: AST_NODE_TYPES.VariableDeclaration,
        kind: 'const',
        declarations: [undefined as unknown as TSESTree.VariableDeclarator],
        parent: null as unknown as TSESTree.Node,
      } as TSESTree.VariableDeclaration),
    ).not.toThrow();
  });
});
