import { ruleTesterTs } from '../utils/ruleTester';
import { preferFieldPathsInTransforms } from '../rules/prefer-field-paths-in-transforms';

ruleTesterTs.run(
  'prefer-field-paths-in-transforms',
  preferFieldPathsInTransforms,
  {
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
        code:
          `
        const strategy = {
          transformEach(source) {
            return {
              [
                ` +
          '`matchesAggregation.matchPreviews.${source.id}`' +
          `
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
  },
);

// Additional edge cases to ensure robustness
ruleTesterTs.run(
  'prefer-field-paths-in-transforms - edge cases',
  preferFieldPathsInTransforms,
  {
    valid: [
      // Function declaration named differently should not be treated as transformEach
      {
        code: `
        function notTransformEach(doc) {
          return {
            matchesAggregation: {
              matchPreviews: { [doc.id]: doc.preview }
            }
          };
        }
      `,
      },
      // Function declaration named transformEachVaripotent (skip)
      {
        code: `
        function transformEachVaripotent(doc) {
          return {
            matchesAggregation: {
              matchPreviews: { [doc.id]: doc.preview }
            }
          };
        }
      `,
      },
      // Class property arrow for transformEachVaripotent (skip)
      {
        code: `
        class S {
          transformEachVaripotent = (doc) => ({
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } }
          });
        }
      `,
      },
      // Arrow with implicit object return but top-level is already dot key
      {
        code: `
        const strategy = {
          transformEach: (d) => ({ 'matchesAggregation.leaf': d.v })
        };
      `,
      },
      // Object spread at container level with non-object replacement
      {
        code: `
        const strategy = {
          transformEach(doc) {
            const updates = { ['matchesAggregation.matchPreviews.' + doc.id]: doc.preview };
            return {
              ...other,
              ...updates,
            };
          }
        };
      `,
      },
      // Container present, but value is a non-object literal (e.g., number) – shouldn't flag
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              previews: 1,
            };
          }
        };
      `,
      },
      // Nested object under non-matching container pattern should be allowed
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              stats: { user: { [doc.id]: 1 } },
            };
          }
        };
      `,
        options: [{ containers: ['matchesAggregation'] }],
      },
      // Computed top-level key (skip check for name pattern)
      {
        code: `
        const strategy = {
          transformEach(doc) {
            const key = 'matchesAggregation';
            return {
              [key]: { matchPreviews: { [doc.id]: doc.preview } },
            };
          }
        };
      `,
      },
      // Property definition arrow for transformEach should be detected; this is valid because flattened
      {
        code:
          `
        class Strategy {
          transformEach = (doc) => ({ [` +
          '`matchesAggregation.matchPreviews.${doc.id}`' +
          `]: doc.preview });
        }
      `,
      },
      // AllowNestedIn exact filename
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return { matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } } };
          }
        };
      `,
        filename: '/workspace/scripts/do-migration.ts',
        options: [{ allowNestedIn: ['/workspace/scripts/**'] }],
      },
      // Arrow with implicit return, container value is identifier (not object literal)
      {
        code: `
        const strategy = {
          transformEach: (doc) => updates,
        };
      `,
      },
    ],
    invalid: [
      // Function declaration transformEach with nested container
      {
        code: `
        function transformEach(doc) {
          return {
            matchesAggregation: {
              matchPreviews: { [doc.id]: doc.preview },
            },
          };
        }
      `,
        errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      },
      // Class property arrow transformEach with nested container
      {
        code: `
        class Strategy {
          transformEach = (doc) => ({
            previews: { users: { [doc.id]: doc.preview } },
          });
        }
      `,
        errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      },
      // Arrow implicit return with nested container
      {
        code: `
        const strategy = {
          transformEach: (d) => ({
            groupAggregation: { items: { [d.id]: d.item } }
          })
        };
      `,
        options: [{ containers: ['*Aggregation'] }],
        errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      },
      // Nested at depth 2 under container should flag even with sibling dot key
      {
        code: `
        const strategy = {
          transformEach(x) {
            return {
              matchesAggregation: { a: { b: 1 } },
              'matchesAggregation.c': 2,
            };
          }
        };
      `,
        errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      },
      // Container with empty object at top-level nested then nested child
      {
        code: `
        const strategy = {
          transformEach(x) {
            return {
              previews: { },
              previews: { users: { [x.id]: 1 } },
            };
          }
        };
      `,
        errors: [{ messageId: 'preferFieldPathsInTransforms' }],
      },
    ],
  },
);
