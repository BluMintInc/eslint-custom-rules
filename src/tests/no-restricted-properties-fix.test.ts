import { ruleTesterTs } from '../utils/ruleTester';
import { noRestrictedPropertiesFix } from '../rules/no-restricted-properties-fix';

ruleTesterTs.run('no-restricted-properties-fix', noRestrictedPropertiesFix, {
  valid: [
    // Test cases for Object.keys() and Object.values() with common array methods
    {
      code: `
        const myObject = { a: 1, b: 2, c: 3 };
        const keyCount = Object.keys(myObject).length;
        console.log('Key count:', keyCount);
      `,
      options: [
        [
          {
            property: 'length',
            message: 'Using .length is restricted.',
          },
        ],
      ],
    },
    {
      code: `
        const myObject = { a: 1, b: 2, c: 3 };
        const valueCount = Object.values(myObject).length;
        console.log('Value count:', valueCount);
      `,
      options: [
        [
          {
            property: 'length',
            message: 'Using .length is restricted.',
          },
        ],
      ],
    },
    {
      code: `
        const myObject = { a: 1, b: 2, c: 3 };
        const sortedKeys = Object.keys(myObject).sort();
        console.log('Sorted keys:', sortedKeys);
      `,
      options: [
        [
          {
            property: 'sort',
            message: 'Using .sort is restricted.',
          },
        ],
      ],
    },
    {
      code: `
        const myObject = { a: 1, b: 2, c: 3 };
        const sortedValues = Object.values(myObject).sort((a, b) => a - b);
        console.log('Sorted values:', sortedValues);
      `,
      options: [
        [
          {
            property: 'sort',
            message: 'Using .sort is restricted.',
          },
        ],
      ],
    },
    {
      code: `
        const exampleAggregation = { teams: { teamA: {}, teamB: {} } };
        const teamCount = Object.keys(exampleAggregation.teams ?? {}).length;
        console.log('Team count from example:', teamCount);
      `,
      options: [
        [
          {
            property: 'length',
            message: 'Using .length is restricted.',
          },
        ],
      ],
    },
    // Test cases for allowObjects
    {
      code: `
        const router = { push: () => {} };
        router.push('/home');
      `,
      options: [
        [
          {
            property: 'push',
            allowObjects: ['router', 'history'],
            message: 'Using .push is restricted except for router and history.',
          },
        ],
      ],
    },
    {
      code: `
        const history = { push: () => {} };
        history.push('/about');
      `,
      options: [
        [
          {
            property: 'push',
            allowObjects: ['router', 'history'],
            message: 'Using .push is restricted except for router and history.',
          },
        ],
      ],
    },
    // Issue #2318: `allowObjects` names a BINDING by spelling exactly as
    // `object` does, so it tolerates the same UPPER_SNAKE_CASE rewrite. Were
    // only the restrictive side normalized, `global-const-style`'s rename
    // would turn an access the user explicitly allowed into a reported one --
    // the same defect #2318 fixes, in the direction that manufactures a false
    // positive rather than losing a report.
    {
      code: `
        const ROUTER = { push: () => {} };
        ROUTER.push('/home');
      `,
      options: [
        [
          {
            property: 'push',
            allowObjects: ['router', 'history'],
            message: 'Using .push is restricted except for router and history.',
          },
        ],
      ],
    },
    {
      code: `
        const HISTORY = { push: () => {} };
        HISTORY.push('/about');
      `,
      options: [
        [
          {
            property: 'push',
            allowObjects: ['router', 'history'],
            message: 'Using .push is restricted except for router and history.',
          },
        ],
      ],
    },
    // Issue #2318: the tolerant `object` match is restricted to identifiers
    // that already have the exact UPPER_SNAKE_CASE shape `global-const-style`
    // emits, so a genuinely unrelated PASCAL-cased name (a React component,
    // say) never collides with a lowercase-configured `object` option even
    // though a blanket case-insensitive compare would equate them.
    {
      code: `
        const Foo = { bar: 1 };
        const value = Foo.bar;
      `,
      options: [
        [
          {
            object: 'foo',
            property: 'bar',
            message: 'This property is disallowed.',
          },
        ],
      ],
    },
    // A renamed spelling only matches the configured `object` it is the
    // UPPER_SNAKE_CASE rewrite of -- a different constant that happens to
    // already be UPPER_SNAKE_CASE stays unrelated.
    {
      code: `
        const DISALLOWED_OBJECT = { disallowedProperty: 'value' };
        const value = DISALLOWED_OBJECT.disallowedProperty;
      `,
      options: [
        [
          {
            object: 'allowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
    },
    // The `property` side is never normalized -- only `global-const-style`'s
    // binding rename is compensated for, not a property key spelled the same
    // way. A property access that merely happens to be UPPER_SNAKE_CASE does
    // not satisfy a lowercase-configured `property` option.
    {
      code: `
        const DISALLOWED_OBJECT = { DISALLOWED_PROPERTY: 'value' };
        const value = DISALLOWED_OBJECT.DISALLOWED_PROPERTY;
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
    },
    // The Object.keys()/Object.values() carve-out still holds when an
    // `object` option is also configured: the identifier the carve-out
    // sees (`DISALLOWED_OBJECT`) sits only as an ARGUMENT to `Object.keys`,
    // never as the `.object` of the `.length` access being checked, so the
    // safe-array-property exemption fires before the restricted-object loop
    // ever runs.
    {
      code: `
        const DISALLOWED_OBJECT = { a: 1, b: 2, c: 3 };
        const keyCount = Object.keys(DISALLOWED_OBJECT).length;
        console.log('Key count:', keyCount);
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'length',
            message: 'Using .length is restricted.',
          },
        ],
      ],
    },
    // Computed access with a dynamic (non-literal) key is unaffected by the
    // object-side normalization: the key identifier's own name still has to
    // match the configured `property` exactly.
    {
      code: `
        const DISALLOWED_OBJECT = { disallowedProperty: 'value' };
        const key = 'unrelatedProperty';
        const value = DISALLOWED_OBJECT[key];
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
    },
    // Computed access with a literal key that does not match the configured
    // property stays valid too, on the same terms as the identifier form.
    {
      code: `
        const DISALLOWED_OBJECT = { disallowedProperty: 'value' };
        const value = DISALLOWED_OBJECT['unrelatedProperty'];
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
    },
  ],
  invalid: [
    // An allowlist entry that is not merely a case rewrite of the identifier
    // still fails to exempt it: the tolerance is scoped to the one rename, not
    // to name similarity generally.
    {
      code: `
        const NAVIGATOR = { push: () => {} };
        NAVIGATOR.push('/home');
      `,
      options: [
        [
          {
            property: 'push',
            allowObjects: ['router'],
            message: 'Using .push is restricted except for router.',
          },
        ],
      ],
      errors: [{ messageId: 'restrictedProperty' }],
    },
    // Test cases for restricted properties on regular objects
    {
      code: `
        const disallowedObject = { disallowedProperty: 'value' };
        const value = disallowedObject.disallowedProperty;
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'disallowedObject',
            propertyName: 'disallowedProperty',
            restrictionReason: 'This property is disallowed. ',
          },
        },
      ],
    },
    // Test case for restricted property on any object
    {
      code: `
        const myArray = [1, 2, 3];
        myArray.push(4);
      `,
      options: [
        [
          {
            property: 'push',
            message: 'Use spread operator instead of push.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'myArray',
            propertyName: 'push',
            restrictionReason: 'Use spread operator instead of push. ',
          },
        },
      ],
    },
    // Test case for restricted object (any property)
    {
      code: `
        const require = { resolve: () => {} };
        require.resolve('path');
      `,
      options: [
        [
          {
            object: 'require',
            message: 'Use import instead.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'require',
            propertyName: 'resolve',
            restrictionReason: 'Use import instead. ',
          },
        },
      ],
    },
    // Issue #2318: `global-const-style` renames a module-scope
    // `disallowedObject` const to `DISALLOWED_OBJECT`. The restricted
    // property is still read off the same value, so the rule must still
    // fire on the renamed spelling -- this is the exact fixture the issue
    // reports as going silent.
    {
      code: `
        const DISALLOWED_OBJECT = { disallowedProperty: 'value' };
        const value = DISALLOWED_OBJECT.disallowedProperty;
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'disallowedObject',
            propertyName: 'disallowedProperty',
            restrictionReason: 'This property is disallowed. ',
          },
        },
      ],
    },
    // The object-only restriction (any property) tolerates the same rename.
    {
      code: `
        const REQUIRE = { resolve: () => {} };
        REQUIRE.resolve('path');
      `,
      options: [
        [
          {
            object: 'require',
            message: 'Use import instead.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'require',
            propertyName: 'resolve',
            restrictionReason: 'Use import instead. ',
          },
        },
      ],
    },
    // Word-boundary splitting matches `global-const-style`'s own
    // `toUpperSnakeCase`, so a multi-word camelCase `object` option (with an
    // acronym-shaped segment) still matches its renamed spelling.
    {
      code: `
        const API_KEY = { disallowedProperty: 'secret' };
        const value = API_KEY.disallowedProperty;
      `,
      options: [
        [
          {
            object: 'apiKey',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'apiKey',
            propertyName: 'disallowedProperty',
            restrictionReason: 'This property is disallowed. ',
          },
        },
      ],
    },
    // A single-word configured name is a legitimate match against its own
    // UPPER_SNAKE_CASE rewrite: `global-const-style` would rename a
    // module-scope `foo` to `FOO`, so this is the same rename as the
    // multi-word cases above, not the unrelated `foo`/`Foo` PASCAL-case
    // collision the valid tests above guard against.
    {
      code: `
        const FOO = { bar: 1 };
        const value = FOO.bar;
      `,
      options: [
        [
          {
            object: 'foo',
            property: 'bar',
            message: 'This property is disallowed.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'foo',
            propertyName: 'bar',
            restrictionReason: 'This property is disallowed. ',
          },
        },
      ],
    },
    // Computed literal property access on a renamed object is still caught.
    {
      code: `
        const DISALLOWED_OBJECT = { disallowedProperty: 'value' };
        const value = DISALLOWED_OBJECT['disallowedProperty'];
      `,
      options: [
        [
          {
            object: 'disallowedObject',
            property: 'disallowedProperty',
            message: 'This property is disallowed.',
          },
        ],
      ],
      errors: [
        {
          messageId: 'restrictedProperty',
          data: {
            objectName: 'disallowedObject',
            propertyName: 'disallowedProperty',
            restrictionReason: 'This property is disallowed. ',
          },
        },
      ],
    },
  ],
});
