import { ruleTesterTs } from '../utils/ruleTester';

// This test demonstrates the issue with the core ESLint rule 'no-restricted-properties'
// when used with Object.keys() and Object.values() results
ruleTesterTs.run(
  'no-restricted-properties-object-keys-values',
  {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Test rule for Object.keys() and Object.values() with no-restricted-properties',
        recommended: false,
      },
      schema: [],
      messages: {
        dummy: 'Dummy message'
      }
    },
    defaultOptions: [],
    create: () => ({})
  }, // Dummy rule
  {
    valid: [
      // These should be valid but are incorrectly flagged by no-restricted-properties
      {
        code: `
          const myObject = { a: 1, b: 2, c: 3 };
          const keyCount = Object.keys(myObject).length;
          console.log('Key count:', keyCount);
        `,
      },
      {
        code: `
          const myObject = { a: 1, b: 2, c: 3 };
          const valueCount = Object.values(myObject).length;
          console.log('Value count:', valueCount);
        `,
      },
      {
        code: `
          const myObject = { a: 1, b: 2, c: 3 };
          const sortedKeys = Object.keys(myObject).sort();
          console.log('Sorted keys:', sortedKeys);
        `,
      },
      {
        code: `
          const myObject = { a: 1, b: 2, c: 3 };
          const sortedValues = Object.values(myObject).sort((a, b) => a - b);
          console.log('Sorted values:', sortedValues);
        `,
      },
      {
        code: `
          const exampleAggregation = { teams: { teamA: {}, teamB: {} } };
          const teamCount = Object.keys(exampleAggregation.teams ?? {}).length;
          console.log('Team count from example:', teamCount);
        `,
      },
    ],
    invalid: [],
  }
);
