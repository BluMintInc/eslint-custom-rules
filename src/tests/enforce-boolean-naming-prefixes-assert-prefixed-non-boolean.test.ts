import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-assert-prefixed-non-boolean',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Direct call to assert-prefixed function returning input value
      `
      function assertSafe<T extends PropertyKey>(key: T) { return key; }
      const userId = assertSafe(this.uid);
      `,

      // Member call to assert-prefixed function returning non-boolean
      `
      const utils = { assertSafe<T extends PropertyKey>(key: T) { return key; } };
      const key = utils.assertSafe('abc');
      `,

      // Generic passthrough with more complex type
      `
      function assertSafe<T>(value: T): T { return value; }
      type User = { id: string };
      const user = assertSafe<User>({ id: 'u1' });
      `,

      // Logical AND with assert-prefixed function on the right should not imply boolean
      `
      function assertSafe<T>(value: T): T { return value; }
      const val = foo && assertSafe(getValue());
      `,

      // Logical OR fallback with object should not be treated as boolean
      `
      function assertSafe<T>(value: T): T { return value; }
      const out = assertSafe(config) || { a: 1 };
      `,

      // Negation of assert-prefixed call is boolean, but variable not assigned from it
      `
      function assertSafe<T>(value: T): T { return value; }
      const value = assertSafe(getVal());
      if (!assertSafe(value)) {
        console.log('not truthy but value itself is non-boolean');
      }
      `,

      // Within object literal assignment
      `
      function assertSafe<T>(value: T): T { return value; }
      const obj = { userId: assertSafe(uid) };
      `,

      // As a parameter default
      `
      function assertSafe<T>(value: T): T { return value; }
      function f(id = assertSafe('x')) { return id; }
      `,

      // With type annotation non-boolean
      `
      function assertSafe<T>(value: T): T { return value; }
      const id: string = assertSafe('abc');
      `,

      // Assignment from await assert-prefixed async that returns value
      `
      async function assertSafe<T>(value: T): Promise<T> { return value; }
      async function main() {
        const id = await assertSafe('x');
      }
      `,
    ],
    invalid: [
      // True boolean from assert-prefixed that returns boolean should still be flagged
      {
        code: `
        function assertIsValid(x: unknown): boolean { return typeof x === 'string'; }
        const isValid = assertIsValid(value);
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'assertIsValid',
              capitalizedName: 'AssertIsValid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Boolean-returning assert used within logical AND should still be treated as boolean
      {
        code: `
        function assertsValid(x: unknown): boolean { return typeof x === 'string'; }
        const isFlag = Math.random() > 0.5;
        const value = isFlag && assertsValid(bar);
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'value',
              capitalizedName: 'Value',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Logical OR that is boolean on the right
      {
        code: `
        function assertIsEnabled(): boolean { return true; }
        const enabled = something || assertIsEnabled();
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'assertIsEnabled',
              capitalizedName: 'AssertIsEnabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Negation creates boolean
      {
        code: `
        function assertSafe<T>(value: T): T { return value; }
        const notOk = !someFlag;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'notOk',
              capitalizedName: 'NotOk',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);

// Separate JSX-capable tests
ruleTesterJsx.run(
  'enforce-boolean-naming-prefixes-assert-prefixed-non-boolean (jsx)',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      `
      function assertSafe<T>(value: T): T { return value; }
      const props = { id: assertSafe(uid) };
      <div data-id={props.id} />;
      `,
    ],
    invalid: [],
  },
);
