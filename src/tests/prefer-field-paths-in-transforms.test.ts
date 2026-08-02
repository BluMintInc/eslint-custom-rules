import type { TestCaseError } from '@typescript-eslint/utils/dist/ts-eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { preferFieldPathsInTransforms } from '../rules/prefer-field-paths-in-transforms';

const message = (container: string, nestedPath: string) =>
  `Transform returns nested object under "${container}" (e.g., "${nestedPath}"). ` +
  'Nested writes in shared aggregation containers cause diff reconciliation to delete the whole subtree, wiping sibling fields. ' +
  `Flatten the update into field-path keys such as "${container}.${nestedPath}" so only the intended leaf changes and other aggregation data stays intact.`;

// Cast required because ESLint RuleTester rejects combining message and messageId in expectations.
const error = (
  container: string,
  nestedPath: string,
): TestCaseError<'preferFieldPathsInTransforms'> =>
  ({
    message: message(container, nestedPath),
  } as unknown as TestCaseError<'preferFieldPathsInTransforms'>);

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
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Nested object is not the first property under container
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                leaf: 123,
                matchPreviews: { [doc.id]: doc.preview },
              },
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Computed-only nested objects: prefer first object key for fallback
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                first: { [doc.id]: doc.preview },
                second: { [doc.otherId]: doc.preview },
              },
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'first')],
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
        errors: [error('previews', 'users')],
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
        errors: [error('groupAggregation', 'items')],
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
        errors: [error('matchesAggregation', 'matchPreviews')],
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
        errors: [error('matchesAggregation', 'matchPreviews')],
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
        errors: [error('matchesAggregation', 'nested.deeper')],
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
        errors: [error('matchesAggregation', 'matchPreviews')],
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
        errors: [error('previews', 'users')],
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
        errors: [error('groupAggregation', 'items')],
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
        errors: [error('matchesAggregation', 'a.b')],
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
        errors: [error('previews', 'users')],
      },
    ],
  },
);

// Assertion wrappers (`as const`, `as T`, `satisfies T`, `!`, `<T>x`) change no
// runtime value, so the nested write shape underneath one is exactly as
// dangerous. `enforce-object-literal-as-const` is fixable and enabled in the
// same recommended config, so `eslint --fix` appends `as const` to precisely
// these literals and used to silence this rule on its own output (#1607).
ruleTesterTs.run(
  'prefer-field-paths-in-transforms - assertion wrappers',
  preferFieldPathsInTransforms,
  {
    valid: [
      // Wrapped return of an already flattened key stays valid
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              'matchesAggregation.matchPreviews': doc.preview,
            } as const;
          }
        };
      `,
      },
      // Wrapped implicit arrow return of an already flattened key stays valid
      {
        code: `
        const strategy = {
          transformEach: (d) => ({ 'matchesAggregation.leaf': d.v } as const),
        };
      `,
      },
      // Depth-1 container under a wrapper is still only one level deep
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { leaf: doc.value },
            } as const;
          }
        };
      `,
      },
      // A wrapped container value that is only one level deep stays valid
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { leaf: doc.value } as const,
            };
          }
        };
      `,
      },
      // Unwrapping must not turn a non-object container value into an object
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: updates as Record<string, unknown>,
            };
          }
        };
      `,
      },
      // Wrapped call expression under the container is not an object literal
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: buildUpdates(doc)! as Updates,
            };
          }
        };
      `,
      },
      // Wrapped array literal under the container is not an object literal
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              previews: [doc.preview] as const,
            };
          }
        };
      `,
      },
      // Wrapped return that is not an object literal at all
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return buildUpdates(doc) as Updates;
          }
        };
      `,
      },
      // transformEachVaripotent stays exempt when its return is wrapped
      {
        code: `
        const strategy = {
          transformEachVaripotent(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } as const;
          }
        };
      `,
      },
      // A wrapped transformEachVaripotent function is still exempt
      {
        code: `
        const strategy = {
          transformEachVaripotent: ((doc) => ({
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          })) as Transform,
        };
      `,
      },
      // Outside any transformEach the wrapper changes nothing
      {
        code: `
        const buildUpdates = (doc) => {
          return {
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          } as const;
        };
      `,
      },
      // Non-container key under a wrapper stays valid
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              otherField: { nested: { a: 1 } },
            } as const;
          }
        };
      `,
      },
      // Custom containers option still narrows scope through a wrapper
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } as const;
          }
        };
      `,
        options: [{ containers: ['customContainer'] }],
      },
      // allowNestedIn still exempts the file when the return is wrapped
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } as const;
          }
        };
      `,
        filename: '/app/scripts/migration.ts',
        options: [{ allowNestedIn: ['**/scripts/**'] }],
      },
    ],
    invalid: [
      // The exact shape `enforce-object-literal-as-const --fix` produces
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
            } as const;
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // satisfies clause on the returned object
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } satisfies Record<string, unknown>;
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Non-null assertion on the returned object
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            }!;
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Angle-bracket type assertion on the returned object
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return <const>{
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrappers nest: as const + satisfies
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } as const satisfies Record<string, unknown>;
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrappers nest: as unknown as T, plus a non-null assertion
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            }! as unknown as Updates;
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrapper on the container value rather than the whole return
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                matchPreviews: { [doc.id]: doc.preview },
              } as const,
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrapper on the nested value one level below the container
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: {
                matchPreviews: { [doc.id]: doc.preview } as const,
              },
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrapper on a spread source under the container
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { ...({ matchPreviews: doc.preview } as const) },
            };
          }
        };
      `,
        errors: [error('matchesAggregation', 'nestedField')],
      },
      // Wrappers at every level at once
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              previews: {
                users: { [doc.id]: doc.preview } as const,
              } as const,
            } as const;
          }
        };
      `,
        errors: [error('previews', 'users')],
      },
      // Object method with a named nested key so the path is fully described
      {
        code: `
        const strategy = {
          transformEach(doc) {
            return {
              matchesAggregation: { nested: { deeper: doc.value } },
            } as const;
          }
        };
      `,
        errors: [error('matchesAggregation', 'nested.deeper')],
      },
      // Arrow property with an implicit wrapped return
      {
        code: `
        const strategy = {
          transformEach: (d) => ({
            groupAggregation: { items: { [d.id]: d.item } },
          } as const),
        };
      `,
        options: [{ containers: ['*Aggregation'] }],
        errors: [error('groupAggregation', 'items')],
      },
      // Class method with a wrapped return
      {
        code: `
        class Strategy {
          transformEach(doc) {
            return {
              previews: { users: { [doc.id]: doc.preview } },
            } as const;
          }
        }
      `,
        errors: [error('previews', 'users')],
      },
      // Class property arrow with an implicit wrapped return
      {
        code: `
        class Strategy {
          transformEach = (doc) => ({
            previews: { users: { [doc.id]: doc.preview } },
          } as const);
        }
      `,
        errors: [error('previews', 'users')],
      },
      // Function expression assigned to a member, wrapped return
      {
        code: `
        const obj = {} as any;
        obj.transformEach = function(doc) {
          return {
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          } as const;
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Function declaration named transformEach, wrapped return
      {
        code: `
        function transformEach(doc) {
          return {
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          } as const;
        }
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Variable named transformEach, wrapped return
      {
        code: `
        const transformEach = (doc) => {
          return {
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          } as const;
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // The function itself carries the wrapper: the binding is still transformEach
      {
        code: `
        const strategy = {
          transformEach: ((doc) => ({
            matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
          })) as Transform,
        };
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
      // Wrapper on the enclosing strategy object leaves the method binding intact
      {
        code: `
        const STRATEGY = {
          transformEach(doc) {
            return {
              matchesAggregation: { matchPreviews: { [doc.id]: doc.preview } },
            } as const;
          }
        } as const;
      `,
        errors: [error('matchesAggregation', 'matchPreviews')],
      },
    ],
  },
);
