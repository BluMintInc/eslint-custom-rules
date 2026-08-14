import { ruleTesterJsx, withParserOptions } from '../utils/ruleTester';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';

// The shared JSX tester supplies the parser and `ecmaFeatures.jsx`; module
// scope analysis is not its default, so every snippet here declares it.
const parserOptions = {
  ecmaVersion: 2018,
  sourceType: 'module',
} as const;

ruleTesterJsx.run(
  'enforce-object-literal-as-const',
  enforceObjectLiteralAsConst,
  {
    valid: withParserOptions(parserOptions, [
      // Valid case: already using 'as const' with array literal
      {
        code: `
        function fetchData() {
          return [data, ref] as const;
        }
      `,
      },
      // Valid case: already using 'as const' with object literal
      {
        code: `
        function getConfig() {
          return { foo: 'bar', baz: 42 } as const;
        }
      `,
      },
      // Valid case: returning a variable, not a literal
      {
        code: `
        function getData() {
          const result = { foo: 'bar' };
          return result;
        }
      `,
      },
      // Valid case: returning a function call
      {
        code: `
        function getData() {
          return getResult();
        }
      `,
      },
      // Valid case: returning a primitive
      {
        code: `
        function getValue() {
          return 42;
        }
      `,
      },
      // Valid case: using spread operator (should be skipped)
      {
        code: `
        function mergeData() {
          return { ...data, newProp: 'value' };
        }
      `,
      },
      // Valid case: using spread in array (should be skipped)
      {
        code: `
        function combineArrays() {
          return [...array1, ...array2];
        }
      `,
      },
      // Valid case: not in a function
      {
        code: `
        const result = { foo: 'bar' };
      `,
      },
      // Valid case: returning null
      {
        code: `
        function maybeGetData() {
          if (condition) {
            return null;
          }
          return { data: 'value' } as const;
        }
      `,
      },
      // Valid case: returning undefined
      {
        code: `
        function maybeGetData() {
          if (condition) {
            return undefined;
          }
          return { data: 'value' } as const;
        }
      `,
      },
      // Valid case: returning a template literal
      {
        code: `
        function getMessage() {
          return \`Hello \${name}\`;
        }
      `,
      },
      // Valid case: returning a JSX element
      {
        code: `
        function renderComponent() {
          return <div>Hello</div>;
        }
      `,
      },
      // Valid case: array with object literals in useMemo (React component props)
      {
        code: `
        const avatarUsers = useMemo(() => {
          return [{ userId: id, imgUrl }];
        }, [id, imgUrl]);
      `,
      },
      // Valid case: array with object literals in useCallback
      {
        code: `
        const getUsers = useCallback(() => {
          return [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }];
        }, []);
      `,
      },
      // Valid case: array with object literals in custom hook
      {
        code: `
        const items = useCustomHook(() => {
          return [{ value: 'item1' }, { value: 'item2' }];
        }, [deps]);
      `,
      },
      // Valid case: array holding an identifier referencing a const object,
      // returned from a hook — same category as the inline-object-literal
      // exemption; must not be forced into a readonly tuple (#1324)
      {
        code: `
        const ANY_GAME_HIT = { id: 'any', name: 'Any Game' } as const;
        const useHits = (hits: readonly { id: string }[], hasQuery: boolean) => {
          return useDeepCompareMemo(() => {
            if (hasQuery && hits.length === 0) {
              return [ANY_GAME_HIT];
            }
            return hits;
          }, [hits, hasQuery]);
        };
      `,
      },
      // Valid case: array holding a member-expression element, returned from a
      // hook — same category as above (#1324)
      {
        code: `
        const useHits = (hits: readonly { id: string }[], hasQuery: boolean) => {
          return useMemo(() => {
            if (hasQuery && hits.length === 0) {
              return [constants.ANY_GAME_HIT];
            }
            return hits;
          }, [hits, hasQuery]);
        };
      `,
      },
      // Valid case: array of identifier elements returned from a hook (#1324)
      {
        code: `
        const items = useMemo(() => {
          return [firstItem, secondItem];
        }, [firstItem, secondItem]);
      `,
      },
      // Valid case: array of primitives returned from a hook — a memoized list
      // that must not be frozen into a readonly tuple downstream (#1324)
      {
        code: `
        const tabs = useMemo(() => {
          return ['overview', 'details'];
        }, []);
      `,
      },
      // Valid case: returning a conditional expression
      {
        code: `
        function getData() {
          return condition ? valueA : valueB;
        }
      `,
      },
      // Valid case: returning a logical expression
      {
        code: `
        function getData() {
          return value || defaultValue;
        }
      `,
      },
      // Valid case: returning a binary expression
      {
        code: `
        function calculate() {
          return a + b;
        }
      `,
      },
      // Valid case: returning a new expression
      {
        code: `
        function createInstance() {
          return new MyClass();
        }
      `,
      },
      // Valid case: returning a tagged template expression
      {
        code: `
        function getStyledComponent() {
          return styled.div\`
            color: red;
          \`;
        }
      `,
      },
      // Valid case: returning a class expression
      {
        code: `
        function createClass() {
          return class MyClass {};
        }
      `,
      },
      // Valid case: returning an await expression
      {
        code: `
        async function fetchData() {
          return await api.getData();
        }
      `,
      },
      // Valid case: returning a type assertion with non-object/array
      {
        code: `
        function getValue() {
          return (someValue as number);
        }
      `,
      },
      // Valid case: `as const` on an object literal needs no change — pinned
      // alongside the #1503 decline so the two assertion paths stay distinct
      {
        code: `
        function getData() {
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Valid case: the angle-bracket assertion form is not detected. Only
      // `TSAsExpression` is inspected, so `<SomeType>{...}` (a `TSTypeAssertion`,
      // and illegal in TSX) goes unreported. Pinned as-is: extending detection
      // here is a separate change, and whoever makes it must decide the fix
      // behaviour deliberately rather than inherit the #1503 loss.
      {
        code: `
        function getData() {
          return <SomeType>{ foo: 'bar' };
        }
      `,
        parserOptions: {
          ecmaVersion: 2018,
          sourceType: 'module',
          ecmaFeatures: { jsx: false },
        },
      },
      // Valid case: returning a complex expression with non-literal
      {
        code: `
        function processData() {
          return processValue(data.map(item => item.value));
        }
      `,
      },
      // Valid case: object with method definition
      {
        code: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          } as const;
        }
      `,
      },
      // Valid case: object with computed property
      {
        code: `
        function getObject() {
          return {
            [computedKey]: 'value'
          } as const;
        }
      `,
      },
      // Valid case: empty array
      {
        code: `
        function getEmptyArray() {
          return [] as const;
        }
      `,
      },
      // Valid case: empty object
      {
        code: `
        function getEmptyObject() {
          return {} as const;
        }
      `,
      },
      // Valid case: the declared return type is a mutable array, so `as const`
      // would emit a readonly tuple that TS4104 rejects. Nothing the developer
      // can do at the literal satisfies the rule, so it stays silent (#1526).
      {
        code: `
        export function getNames(): string[] {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: a mutable tuple annotation rejects a readonly tuple the same
      // way (#1526)
      {
        code: `
        function getPair(): [string, number] {
          return ['a', 1];
        }
      `,
      },
      // Valid case: `Array<T>` spells the same mutable array (#1526)
      {
        code: `
        function getNames(): Array<string> {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: no member of the union accepts a readonly tuple (#1526)
      {
        code: `
        function getNames(): string[] | undefined {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: an async function's literal is typed by the awaited type, so
      // `Promise<string[]>` is a mutable array position (#1526)
      {
        code: `
        async function getNames(): Promise<string[]> {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: a generator's declared return type is its second type
      // argument (#1526)
      {
        code: `
        function* generateNames(): Generator<number, string[], void> {
          yield 1;
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: the annotation sits on the declared variable rather than on
      // the arrow function itself (#1526)
      {
        code: `
        const getNames: () => string[] = () => {
          return ['a', 'b'];
        };
      `,
      },
      // Valid case: an assertion on the function expression carries the same
      // declared return type (#1526)
      {
        code: `
        const getNames = (() => {
          return ['a', 'b'];
        }) as () => string[];
      `,
      },
      // Valid case: a class property's function-type annotation (#1526)
      {
        code: `
        class NameService {
          getNames: () => string[] = () => {
            return ['a', 'b'];
          };
        }
      `,
      },
      // Valid case: a method's own mutable array annotation (#1526)
      {
        code: `
        class NameService {
          getNames(): string[] {
            return ['a', 'b'];
          }
        }
      `,
      },
      // Valid case: an array literal in a mutable-annotated variable declaration
      // is outside the rule entirely — only `return` arguments are inspected
      {
        code: `
        const names: string[] = ['a', 'b'];
      `,
      },
      // valid — no return annotation, so the array's arity must not be frozen
      `function diff(a, b) {
  return [{ a, b }];
}
function isSame(a, b) {
  return diff(a, b).length === 0;
}`,
      // Valid case (#2015, second reported shape): freezing the empty array makes
      // the union's tuple branch `readonly []`, whose element type is `never`, so
      // the consumer's `.includes` argument stops type-checking (TS2345)
      {
        code: `
        function pickNames(flag: boolean, names: string[]) {
          if (flag) {
            return [];
          }
          return names;
        }
        function hasName(flag: boolean, names: string[], name: string) {
          return pickNames(flag, names).includes(name);
        }
      `,
      },
      // Valid case: an unannotated function returning a bare array literal. The
      // inferred return type carries the frozen arity to every caller, and the
      // rule cannot see them (#2015).
      {
        code: `
        function getNames() {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: an unannotated function returning an array of object
      // literals — the array is the returned literal, so the arity decline
      // applies whatever the elements are (#2015)
      {
        code: `
        function getRows() {
          return [{ id: 1 }, { id: 2 }];
        }
      `,
      },
      // Valid case: an unannotated empty array. `[] as const` is `readonly []`,
      // the narrowest arity of all (#2015).
      {
        code: `
        function getEmptyArray() {
          return [];
        }
      `,
      },
      // Valid case: an unannotated arrow function body (#2015)
      {
        code: `
        const getItems = () => {
          return [a, b, c];
        };
      `,
      },
      // Valid case: an unannotated function expression (#2015)
      {
        code: `
        const getItems = function() {
          return ['a', 'b'];
        };
      `,
      },
      // Valid case: an unannotated method — a class body declares no return type
      // for it either (#2015)
      {
        code: `
        class NameService {
          getNames() {
            return ['a', 'b'];
          }
        }
      `,
      },
      // Valid case: an unannotated async function. The caller awaits the same
      // frozen tuple (#2015).
      {
        code: `
        async function getNames() {
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: an unannotated generator's `return` value reaches callers
      // through `IteratorResult`, arity included (#2015)
      {
        code: `
        function* generateNames() {
          yield 1;
          return ['a', 'b'];
        }
      `,
      },
      // Valid case: a concise arrow body returning an array literal. The rule
      // inspects `return` arguments only, so this spelling is not detected at
      // all — pinned to keep the #2015 decline from being read as the reason
      // (the detection gap is #1795).
      {
        code: `
        const getItems = () => [{ id: 1 }, { id: 2 }];
      `,
      },
      // Valid case: a concise arrow body returning a parenthesised object
      // literal is likewise undetected (#1795) — the #2015 decline is scoped to
      // arrays and changes nothing here
      {
        code: `
        const getConfig = () => ({ a: 1 });
      `,
      },
      // Valid case: an object literal in a variable declaration is not a return,
      // so no `as const` is demanded and the array decline is irrelevant
      {
        code: `
        const config = { foo: 'bar', items: ['a', 'b'] };
      `,
      },
      // Valid case: an array returned from a hook callback stays exempt through
      // the hook path, which the #2015 decline neither needs nor disturbs
      {
        code: `
        const rows = useMemo(() => {
          return [{ id: 1 }];
        }, []);
      `,
      },
      // Valid case: a class property arrow declared without a function type
      // annotation infers its return type the same way a function does (#2015)
      {
        code: `
        class NameService {
          getNames = () => {
            return ['a', 'b'];
          };
        }
      `,
      },
      // Valid case: an object literal's shorthand method carries no annotation
      // either (#2015)
      {
        code: `
        const service = {
          getNames() {
            return ['a', 'b'];
          }
        };
      `,
      },
      // Valid case: the `return` belongs to the unannotated callback, not to the
      // annotated function around it — the decline follows the nearest enclosing
      // signature, as the #1526 guard already does (#2015)
      {
        code: `
        function getGroups(): readonly string[][] {
          return sources.map((source) => {
            return [source.id, source.name];
          });
        }
      `,
      },
    ]),
    invalid: withParserOptions(parserOptions, [
      // Invalid case: array literal without 'as const'
      {
        code: `
        function fetchAssertGroup(groupId: string): Promise<[GroupInfo, DocumentReference<GroupInfo>]> {
          return [group, groupRef];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function fetchAssertGroup(groupId: string): Promise<[GroupInfo, DocumentReference<GroupInfo>]> {
          return [group, groupRef] as const;
        }
      `,
      },
      // Invalid case: object literal without 'as const'
      {
        code: `
        function getConfig() {
          return { foo: 'bar', baz: 42 };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return { foo: 'bar', baz: 42 } as const;
        }
      `,
      },
      // Invalid case: nested object literal without 'as const'
      {
        code: `
        function getNestedConfig() {
          return {
            foo: 'bar',
            nested: {
              baz: 'qux'
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getNestedConfig() {
          return {
            foo: 'bar',
            nested: {
              baz: 'qux'
            }
          } as const;
        }
      `,
      },
      // Invalid case: array with multiple elements, in a signature that accepts
      // the readonly tuple
      {
        code: `
        function getItems(): readonly unknown[] {
          return [a, b, c];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getItems(): readonly unknown[] {
          return [a, b, c] as const;
        }
      `,
      },
      // Invalid case: identifier-element array outside a hook is still flagged —
      // the exemption is scoped to hook callbacks (#1324). The readonly
      // annotation keeps the arity inside the declared contract, so the #2015
      // decline does not apply and the #1324 boundary is what is under test.
      {
        code: `
        function getHits(): readonly Hit[] {
          return [ANY_GAME_HIT];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getHits(): readonly Hit[] {
          return [ANY_GAME_HIT] as const;
        }
      `,
      },
      // Invalid case: with another type assertion — reported, but deliberately
      // not auto-fixed. Rewriting `as SomeType` into `as const` would drop the
      // declared type (#1503), so the diagnostic stands and the rewrite is left
      // to a human.
      {
        code: `
        function getData() {
          return { foo: 'bar' } as SomeType;
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: null,
      },
      // Invalid case: the declared type is in scope, making the loss concrete —
      // `as const` infers `{ readonly foo: 'bar' }`, not `SomeType` (#1503)
      {
        code: `
        type SomeType = { foo: string };
        function getData() {
          return { foo: 'bar' } as SomeType;
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: null,
      },
      // Invalid case: array literal with another type assertion is declined too.
      // The readonly annotation keeps the array out of the #2015 decline, so the
      // reported-but-unfixed assertion path is what is exercised here.
      {
        code: `
        function getPair(): readonly [Group, GroupRef] {
          return [group, groupRef] as SomePair;
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: null,
      },
      // Invalid case: a generic assertion is declined the same way
      {
        code: `
        function getRecords() {
          return { a: 1 } as Record<string, number>;
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: null,
      },
      // Invalid case: an assertion in an arrow function body is declined too —
      // the decline follows the assertion, not the enclosing function shape
      {
        code: `
        const getData = () => {
          return { foo: 'bar' } as SomeType;
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: null,
      },
      // Invalid case: an assertion on an array *element* leaves the outer literal
      // fixable — the decline is scoped to an assertion on the returned literal
      // itself, not one nested inside it
      {
        code: `
        function getItems(): readonly unknown[] {
          return [{ foo: 'bar' } as SomeType, other];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getItems(): readonly unknown[] {
          return [{ foo: 'bar' } as SomeType, other] as const;
        }
      `,
      },
      // Invalid case: an assertion on a *property value* likewise leaves the outer
      // object literal fixable
      {
        code: `
        function getConfig() {
          return { nested: { foo: 'bar' } as SomeType };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return { nested: { foo: 'bar' } as SomeType } as const;
        }
      `,
      },
      // Invalid case (control for #1503): a plain literal carrying no assertion
      // still auto-fixes. Declining must be scoped to the assertion case — if this
      // stops fixing, fixing was disabled generally.
      {
        code: `
        function getData() {
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getData() {
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in arrow function
      {
        code: `
        const getConfig = () => {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getConfig = () => {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in method
      {
        code: `
        class ConfigService {
          getConfig() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          getConfig() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: empty array in a signature that accepts a readonly tuple.
      // Unannotated, `[] as const` is `readonly []`, whose element type is
      // `never` — the #2015 shape that breaks a caller's `.includes` (TS2345).
      {
        code: `
        function getEmptyArray(): readonly string[] {
          return [];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getEmptyArray(): readonly string[] {
          return [] as const;
        }
      `,
      },
      // Invalid case: empty object
      {
        code: `
        function getEmptyObject() {
          return {};
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getEmptyObject() {
          return {} as const;
        }
      `,
      },
      // Invalid case: object with method definition
      {
        code: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          } as const;
        }
      `,
      },
      // Invalid case: object with computed property
      {
        code: `
        function getObject() {
          return {
            [computedKey]: 'value'
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObject() {
          return {
            [computedKey]: 'value'
          } as const;
        }
      `,
      },
      // Invalid case: array with null elements
      {
        code: `
        function getArrayWithNull(): readonly unknown[] {
          return [a, null, c];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getArrayWithNull(): readonly unknown[] {
          return [a, null, c] as const;
        }
      `,
      },
      // Invalid case: object with shorthand properties
      {
        code: `
        function getObjectWithShorthand() {
          return { a, b, c };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObjectWithShorthand() {
          return { a, b, c } as const;
        }
      `,
      },
      // Invalid case: in function expression
      {
        code: `
        const getConfig = function() {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getConfig = function() {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in async function
      {
        code: `
        async function getAsyncData() {
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        async function getAsyncData() {
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in async arrow function
      {
        code: `
        const getAsyncData = async () => {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getAsyncData = async () => {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in generator function
      {
        code: `
        function* generateData() {
          yield 1;
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function* generateData() {
          yield 1;
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in async generator function
      {
        code: `
        async function* generateAsyncData() {
          yield 1;
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        async function* generateAsyncData() {
          yield 1;
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in class static method
      {
        code: `
        class ConfigService {
          static getConfig() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          static getConfig() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: in class getter
      {
        code: `
        class ConfigService {
          get config() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          get config() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: in object method
      {
        code: `
        const service = {
          getConfig() {
            return { foo: 'bar' };
          }
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const service = {
          getConfig() {
            return { foo: 'bar' } as const;
          }
        };
      `,
      },
      // Invalid case: in object getter
      {
        code: `
        const service = {
          get config() {
            return { foo: 'bar' };
          }
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const service = {
          get config() {
            return { foo: 'bar' } as const;
          }
        };
      `,
      },
      // Invalid case: object literal in useMemo (not in an array)
      {
        code: `
        const config = useMemo(() => {
          return { theme: 'dark', fontSize: 16 };
        }, []);
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const config = useMemo(() => {
          return { theme: 'dark', fontSize: 16 } as const;
        }, []);
      `,
      },
      // Invalid case: with JSX in object
      {
        code: `
        function getComponentConfig() {
          return {
            element: <div>Hello</div>,
            options: { animated: true }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getComponentConfig() {
          return {
            element: <div>Hello</div>,
            options: { animated: true }
          } as const;
        }
      `,
      },
      // Invalid case: with complex nested structure
      {
        code: `
        function getComplexData() {
          return {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ],
            settings: {
              theme: 'dark',
              notifications: {
                email: true,
                push: false
              }
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getComplexData() {
          return {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ],
            settings: {
              theme: 'dark',
              notifications: {
                email: true,
                push: false
              }
            }
          } as const;
        }
      `,
      },
      // Invalid case: with multiline array
      {
        code: `
        function getItems(): readonly string[] {
          return [
            'item1',
            'item2',
            'item3'
          ];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getItems(): readonly string[] {
          return [
            'item1',
            'item2',
            'item3'
          ] as const;
        }
      `,
      },
      // Invalid case: with trailing comma
      {
        code: `
        function getConfig() {
          return {
            foo: 'bar',
            baz: 42,
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return {
            foo: 'bar',
            baz: 42,
          } as const;
        }
      `,
      },
      // Invalid case: a `readonly string[]` annotation accepts the readonly tuple
      // `as const` produces, so the fix still applies (#1526)
      {
        code: `
        function getNames(): readonly string[] {
          return ['a', 'b'];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getNames(): readonly string[] {
          return ['a', 'b'] as const;
        }
      `,
      },
      // Invalid case: `ReadonlyArray<T>` is the same type spelled differently
      // (#1526)
      {
        code: `
        function getNames(): ReadonlyArray<string> {
          return ['a', 'b'];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getNames(): ReadonlyArray<string> {
          return ['a', 'b'] as const;
        }
      `,
      },
      // Invalid case: a readonly tuple annotation accepts a readonly tuple
      // (#1526)
      {
        code: `
        function getPair(): readonly [string, number] {
          return ['a', 1];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getPair(): readonly [string, number] {
          return ['a', 1] as const;
        }
      `,
      },
      // Invalid case: an awaited readonly array accepts it too (#1526)
      {
        code: `
        async function getNames(): Promise<readonly string[]> {
          return ['a', 'b'];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        async function getNames(): Promise<readonly string[]> {
          return ['a', 'b'] as const;
        }
      `,
      },
      // Invalid case: a union with a readonly member accepts a readonly tuple, so
      // the fix applies (#1526)
      {
        code: `
        function getNames(): readonly string[] | undefined {
          return ['a', 'b'];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getNames(): readonly string[] | undefined {
          return ['a', 'b'] as const;
        }
      `,
      },
      // Invalid case: a variable annotated with a readonly-returning function
      // type still fixes — the decline follows the declared type, not the
      // declaration site (#1526)
      {
        code: `
        const getNames: () => readonly string[] = () => {
          return ['a', 'b'];
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getNames: () => readonly string[] = () => {
          return ['a', 'b'] as const;
        };
      `,
      },
      // Invalid case (control for #1526): an array literal the signature spells
      // `readonly` still fixes. If this stops fixing, a decline was scoped too
      // widely — #1526 covers only the mutable spellings and #2015 only the
      // signatures that declare nothing.
      {
        code: `
        function getFlags(): readonly boolean[] {
          return [true, false];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getFlags(): readonly boolean[] {
          return [true, false] as const;
        }
      `,
      },
      // Invalid case (control for #2015): an unannotated function returning an
      // OBJECT literal is the rule's main purpose and must keep reporting and
      // fixing — the arity decline is scoped to array literals
      {
        code: `
        function getSettings() {
          return { theme: 'dark', fontSize: 16 };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getSettings() {
          return { theme: 'dark', fontSize: 16 } as const;
        }
      `,
      },
      // Invalid case (control for #2015): the returned literal is an object whose
      // property value is an array. The subject is the outer object, so the
      // array decline does not reach it.
      {
        code: `
        function getMenu() {
          return { items: ['a', 'b'], label: 'Menu' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getMenu() {
          return { items: ['a', 'b'], label: 'Menu' } as const;
        }
      `,
      },
      // Invalid case (control for #2015): a nested object literal inside an
      // unannotated returned object still takes the fix on the outer literal
      {
        code: `
        function getProfile() {
          return { user: { name: 'John' } };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getProfile() {
          return { user: { name: 'John' } } as const;
        }
      `,
      },
      // Invalid case (control for #2015): a function whose branches return both
      // shapes. The object branch is reported and fixed; the array branch is
      // declined, so exactly one error lands.
      {
        code: `
        function getPayload(flag) {
          if (flag) {
            return ['a', 'b'];
          }
          return { name: 'a' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getPayload(flag) {
          if (flag) {
            return ['a', 'b'];
          }
          return { name: 'a' } as const;
        }
      `,
      },
      // Invalid case: the nearest enclosing signature is the callback's own
      // readonly annotation, so the array is fixed even though the function
      // around it declares nothing (#2015)
      {
        code: `
        function getGroups() {
          return sources.map((source): readonly string[] => {
            return [source.id, source.name];
          });
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getGroups() {
          return sources.map((source): readonly string[] => {
            return [source.id, source.name] as const;
          });
        }
      `,
      },
      // Invalid case (composition with #1526): an annotation the rule cannot
      // resolve counts as accepting, and the #2015 decline does not swallow it —
      // the declared name, not the literal's arity, is what callers read
      {
        code: `
        type Names = readonly string[];
        function getNames(): Names {
          return ['a', 'b'];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        type Names = readonly string[];
        function getNames(): Names {
          return ['a', 'b'] as const;
        }
      `,
      },
      // Invalid case: an object literal in a mutable-annotated position still
      // fixes. `readonly` property modifiers do not affect assignability, so
      // `as const` on an object literal stays assignable to a mutable target —
      // the TS4104 conflict is specific to array literals (#1526).
      {
        code: `
        type Config = { name: string; count: number };
        function getConfig(): Config {
          return { name: 'a', count: 1 };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        type Config = { name: string; count: number };
        function getConfig(): Config {
          return { name: 'a', count: 1 } as const;
        }
      `,
      },
      // Invalid case: with comments in object
      {
        code: `
        function getConfig() {
          return {
            // User settings
            user: {
              name: 'John',
              // User role
              role: 'admin'
            },
            /* System settings */
            system: {
              version: '1.0.0'
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return {
            // User settings
            user: {
              name: 'John',
              // User role
              role: 'admin'
            },
            /* System settings */
            system: {
              version: '1.0.0'
            }
          } as const;
        }
      `,
      },
    ]),
  },
);
