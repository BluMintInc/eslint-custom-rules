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
  ],
  invalid: [
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
  ],
});
