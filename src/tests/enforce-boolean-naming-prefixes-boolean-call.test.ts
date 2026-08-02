import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

/**
 * `Boolean(x)` and `!!x` are the same operation written two ways, so a variable
 * initialized with either one holds a primitive boolean and owes the same
 * prefix. Two look-alikes must stay silent: `new Boolean(x)` builds a wrapper
 * object (always truthy, never a primitive), and a `Boolean` that resolves to a
 * local binding or an import is simply a different function whose return value
 * the rule knows nothing about.
 */
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-boolean-call',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Correctly prefixed names carry the boolean contract already.
      `
      declare const value: unknown;
      const isFlag = Boolean(value);
      `,
      `
      declare const items: unknown[];
      const hasItems = Boolean(items.length);
      `,
      `
      declare const user: { role?: string };
      const canAdminister = Boolean(user.role);
      `,
      // A leading underscore marks a private/internal binding and is exempt.
      `
      declare const value: unknown;
      const _flag = Boolean(value);
      `,
      // `new Boolean(x)` yields a Boolean wrapper OBJECT, not a primitive: it is
      // always truthy, so treating it as a boolean would be wrong.
      `
      declare const value: unknown;
      const flag = new Boolean(value);
      `,
      `
      declare const value: unknown;
      const wrapper = new Boolean(value);
      `,
      // A local binding named `Boolean` shadows the global; its return value is
      // whatever that binding produces.
      `
      const Boolean = () => 1;
      const flag = Boolean();
      `,
      `
      function Boolean() {
        return 1;
      }
      const flag = Boolean();
      `,
      // The shadow only has to cover the call site, not the whole file.
      `
      function scoped() {
        const Boolean = () => 1;
        const flag = Boolean();
        return flag;
      }
      `,
      // A parameter named `Boolean` shadows the global for the function body.
      `
      function wrap(Boolean: () => number) {
        const flag = Boolean();
        return flag;
      }
      `,
      // An imported `Boolean` is a module binding, not the global constructor.
      `
      import { Boolean } from './boolean';
      declare const value: unknown;
      const flag = Boolean(value);
      `,
      // A value-position reference is not a call and produces no boolean.
      `
      declare const xs: unknown[];
      const truthy = xs.filter(Boolean);
      `,
      `
      const coerce = Boolean;
      `,
      // Sibling global coercions are unrelated to booleanness.
      `
      declare const value: unknown;
      const label = String(value);
      `,
      `
      declare const value: unknown;
      const total = Number(value);
      `,
    ],
    invalid: [
      // The reported defect: an explicit boolean coercion left unprefixed.
      {
        code: `
        declare const state: unknown;
        const flag = Boolean(state);
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'flag',
              capitalizedName: 'Flag',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      // The global is still the global inside a nested scope.
      {
        code: `
        function toggle(state: unknown) {
          const flag = Boolean(state);
          return flag;
        }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Member-expression and call arguments make no difference to the result.
      {
        code: `
        declare const changes: unknown[];
        const dirty = Boolean(changes.length);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      {
        code: `
        declare const user: { role?: string };
        let admin = Boolean(user.role);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      // Booleanness propagates: the coerced variable is recognized as boolean
      // where it is later used, so the derived name is checked too.
      {
        code: `
        declare const value: unknown;
        declare const other: unknown;
        const flag = Boolean(value);
        const combined = other && flag;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'flag',
              capitalizedName: 'Flag',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'combined',
              capitalizedName: 'Combined',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      // A shadow that ends before the call site leaves the global in force.
      {
        code: `
        function scoped() {
          const Boolean = () => 1;
          return Boolean();
        }
        declare const value: unknown;
        const flag = Boolean(value);
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
    ],
  },
);
