import { ruleTesterTs } from '../utils/ruleTester';
import { preferFieldPathsInTransforms } from '../rules/prefer-field-paths-in-transforms';

ruleTesterTs.run('prefer-field-paths-in-transforms', preferFieldPathsInTransforms, {
  valid: [
    // Not inside transformEach => ignore
    {
      code: `
        const transform = () => {
          return {
            matchesAggregation: {
              matchPreviews: {
                [id]: preview,
              },
            },
          };
        };
      `,
    },
    // Inside transformEach but using flattened keys
    {
      code: `
        const strategy = {
          transformEach(source) {
            return {
              [
                ` + "`matchesAggregation.matchPreviews.${source.id}`" + `
              ]: source.preview,
            };
          },
        };
      `,
    },
    // Inside transformEach but container value is not an object literal (dynamic)
    {
      code: `
        const strategy = {
          transformEach(item) {
            const updates = compute(item);
            return {
              matchesAggregation: updates,
            };
          }
        };
      `,
    },
    // Already flattened with dot key
    {
      code: `
        const strategy = {
          transformEach(x) {
            return {
              'matchesAggregation.something': 1,
            };
          }
        };
      `,
    },
    // transformEachVaripotent should be ignored
    {
      code: `
        const strategy = {
          transformEachVaripotent(doc) {
            return {
              matchesAggregation: {
                matchPreviews: {
                  [doc.id]: doc.preview,
                },
              },
            };
          }
        };
      `,
    },
    // File allowed via allowNestedIn option
    {
      code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                matchPreviews: {
                  [doc.id]: doc.preview,
                },
              },
            };
          }
        };
      `,
      filename: '/app/scripts/migration.ts',
      options: [{ allowNestedIn: ['**/scripts/**'] }],
    },
    // Non-container key should be allowed by default
    {
      code: `
        const strategy = {
          transformEach(doc) {
            return {
              otherField: {
                nested: { a: 1 },
              },
            };
          }
        };
      `,
    },
    // Custom containers option narrows scope
    {
      code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                previewLeaf: doc.preview,
              },
            };
          }
        };
      `,
      options: [{ containers: ['customContainer'] }],
    },
  ],
  invalid: [
    // Basic nested under matchesAggregation.matchPreviews
    {
      code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                matchPreviews: {
                  [doc.id]: doc.preview,
                },
              },
            };
          }
        };
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
    },
    // Nested two levels under previews
    {
      code: `
        const strategy = {
          transformEach(x) {
            return {
              previews: {
                users: {
                  [x.uid]: x.data,
                },
              },
            };
          }
        };
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
    },
    // Class method form
    {
      code: `
        class Strategy {
          transformEach(doc) {
            return {
              groupAggregation: {
                items: {
                  [doc.id]: doc.item,
                },
              },
            };
          }
        }
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      options: [{ containers: ['*Aggregation'] }],
    },
    // Variable named transformEach
    {
      code: `
        const transformEach = (doc) => {
          return {
            matchesAggregation: {
              matchPreviews: { [doc.id]: doc.preview },
            },
          };
        };
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
    },
    // Assignment to obj.transformEach
    {
      code: `
        const obj = {} as any;
        obj.transformEach = function(doc) {
          return {
            matchesAggregation: {
              matchPreviews: {
                [doc.id]: doc.preview,
              },
            },
          };
        };
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
    },
    // Dot-key at top but nested object under container still flagged
    {
      code: `
        const strategy = {
          transformEach(d) {
            return {
              matchesAggregation: {
                nested: { deeper: 1 },
              },
              'matchesAggregation.leaf': 2,
            };
          }
        };
      `,
      errors: [{ messageId: 'preferFieldPathsInTransforms' }],
    },
  ],
});