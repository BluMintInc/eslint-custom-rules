import { ruleTesterTs } from '../utils/ruleTester';
import { preferFlatTransformEachKeys } from '../rules/prefer-flat-transform-each-keys';

ruleTesterTs.run(
  'prefer-flat-transform-each-keys',
  preferFlatTransformEachKeys,
  {
    valid: [
      // 1. transformEach returns flat dot-notation string-literal keys (canonical good pattern)
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'worthSummary.countUnpriceable': source.count,
        'worthSummary.countUnassured': source.assured,
      }),
      resolveAll: resolveParent,
    };
    `,

      // 2. transformEach returns flat dot-notation keys in block body
      `
    const strategy = {
      transformEach({ source }) {
        return {
          'worthSummary.countUnpriceable': source.count,
        };
      },
      resolveAll: resolveParent,
    };
    `,

      // 3. resolveSelf strategy with nested return — exempt because deletion short-circuits
      `
    const STATUS_STRATEGY = {
      transformEach: ({ source }) => ({
        roundsStatus: { current: source.status },
      }),
      resolveAll: resolveSelf,
    };
    `,

      // 4. Object not shaped like a strategy (no resolveAll / numericFieldPathConfig)
      // — the rule ignores it entirely.
      `
    const notAStrategy = {
      transformEach: ({ source }) => ({
        worthSummary: { priceable: source.val },
      }),
    };
    `,

      // 5. Computed (bracket-notation) key — represents a dynamic leaf path, value may be any shape
      `
    const strategy = {
      transformEach: ({ sourceRef: { id } }) => ({
        [\`cohortPreviews.\${id}\`]: { name: 'x', avatarUrl: 'y' },
      }),
      resolveAll: resolveParent,
    };
    `,

      // 6. Computed bracket-notation string containing a dot — leaf path
      `
    const strategy = {
      transformEach: ({ source, sourceRef: { id } }) => ({
        [\`resultsAggregation.teams.\${id}\`]: { name: source.name },
      }),
      resolveAll: resolveParent,
    };
    `,

      // 7. afterData wrapper with flat dot-notation keys inside afterData
      `
    const strategy = {
      transformEach: ({ sourceRef: { id } }) => ({
        afterData: {
          'matchesAggregation.matchPreviews': 'preview',
          'matchesAggregation.matchIds': ['id1'],
        },
        method: 'update',
      }),
      resolveAll: resolveParent,
    };
    `,

      // 8. afterData wrapper where afterData value is a variable (not a literal) — skip gracefully
      `
    const strategy = {
      transformEach: ({ source }) => {
        const afterData = buildAfterData(source);
        return { afterData, method: 'update' };
      },
      resolveAll: resolveParent,
    };
    `,

      // 9. transformEach returns primitives and arrays only — no nested objects
      `
    const strategy = {
      transformEach: ({ source }) => ({
        count: source.count,
        names: source.names,
        isActive: source.active,
      }),
      resolveAll: resolveParent,
    };
    `,

      // 10. Factory pattern where transformEach is a reference to an external variable
      // rather than an inline function — the function body is not in scope for analysis.
      `
    function makeTransform(config) {
      return ({ source }) => ({ 'worthSummary.count': source.count });
    }
    const strategy = {
      transformEach: makeTransform(config),
      resolveAll: resolveParent,
    };
    `,

      // 11. Dot-notation key with computed identifier key (computed: true) — leaf path exempt
      `
    const strategy = {
      transformEach: ({ source }) => {
        const key = 'aggregation.sub.' + source.id;
        return {
          [key]: source.value,
        };
      },
      resolveAll: resolveParent,
    };
    `,

      // 12. Programmatic result built via const assignment — all flat dot-notation keys
      `
    const strategy = {
      transformEach: ({ source }) => {
        const result = {
          'worthSummary.countUnpriceable': source.count,
          'worthSummary.countUnassured': source.assured,
        };
        return result;
      },
      resolveAll: resolveParent,
    };
    `,

      // 13. Strategy with numericFieldPathConfig but flat keys — no violation
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'worthSummary.countUnpriceable': source.count,
      }),
      numericFieldPathConfig: {
        'worthSummary.countUnpriceable': 'FieldValue.increment',
      },
      resolveAll: resolveParent,
    };
    `,

      // 14. Conditional branches both returning flat keys
      `
    const strategy = {
      transformEach: ({ source }) => {
        if (source.isSimple) {
          return { 'stats.count': source.count };
        }
        return { 'stats.total': source.total };
      },
      resolveAll: resolveParent,
    };
    `,

      // 15. afterData with computed bracket-notation key inside — leaf path, exempt
      `
    const strategy = {
      transformEach: ({ sourceRef: { id } }) => ({
        afterData: {
          [\`resultsAggregation.teams.\${id}\`]: { name: 'foo' },
        },
        method: 'update',
      }),
      resolveAll: resolveParent,
    };
    `,

      // 16. resolveSelf strategies with queryResolveAll also exempt
      `
    const strategy = {
      transformEach: ({ source }) => ({
        nested: { field: source.val },
      }),
      resolveAll: resolveSelf,
      numericFieldPathConfig: {},
    };
    `,

      // 17. Top-level key is a dot-notation string literal — value object is the leaf data, exempt
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'members.abc': { name: source.name, avatarUrl: source.url },
      }),
      resolveAll: resolveParent,
    };
    `,

      // 18. Non-strategy object with resolveAll but no transformEach — not a strategy, skip
      `
    const notStrategy = {
      resolveAll: resolveParent,
      someOtherProp: 42,
    };
    `,

      // 19. transformEach with arrow function returning a primitive directly — no object to check
      `
    const strategy = {
      transformEach: ({ source }) => source.count,
      resolveAll: resolveParent,
    };
    `,

      // 20. queryResolveAll as the strategy shape key — still a valid strategy shape but resolveSelf exempt
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'stats.count': source.count,
      }),
      queryResolveAll: resolveAll,
    };
    `,
    ],
    invalid: [
      // 1. Classic bad pattern: nested object under a non-dot key (the issue's primary example)
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          const { priceable, countUnpriceable, countUnassured } = source.worthSummary;
          return {
            worthSummary: {
              priceable,
              countUnpriceable,
              countUnassured,
            },
          };
        },
        numericFieldPathConfig: {
          'worthSummary.countUnpriceable': 'FieldValue.increment',
        },
        resolveAll: resolveParentSkipRegistry,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 2. Arrow function with implicit return containing nested object
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: {
            priceable: source.priceable,
            countUnpriceable: 3,
          },
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 3. Nested via const result = {...}; return result pattern
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          const result = {
            worthSummary: {
              priceable: source.priceable,
            },
          };
          return result;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 4. Multiple nested keys in the same return — one error per nested key
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count },
          matchesAggregation: { total: source.total },
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [
          { messageId: 'preferFlatTransformEachKeys' },
          { messageId: 'preferFlatTransformEachKeys' },
        ],
      },

      // 5. afterData wrapper with nested object inside afterData
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          afterData: {
            matchesAggregation: {
              matchPreviews: { id: 'preview' },
            },
          },
          method: 'update',
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 6. String literal key without dot but with object value — violation
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          'worthSummary': {
            countUnpriceable: source.count,
          },
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 7. Strategy with numericFieldPathConfig and nested object — the most dangerous pattern
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: {
            countUnpriceable: source.isActive ? 1 : 0,
            countUnassured: 0,
          },
        }),
        numericFieldPathConfig: {
          'worthSummary.countUnpriceable': 'FieldValue.increment',
          'worthSummary.countUnassured': 'FieldValue.increment',
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 8. Function body with block statement returning nested object
      {
        code: `
      const strategy = {
        transformEach({ source }) {
          return {
            roundsStatus: {
              current: source.status,
            },
          };
        },
        resolveAll: resolveParentSkipRegistry,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 9. afterData pattern with nested object inside (afterData is block body return)
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return {
            afterData: {
              worthSummary: {
                count: source.count,
              },
            },
            method: 'update',
          };
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 10. Mixed: one flat branch, one nested branch — only the nested one flagged
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          if (source.isSimple) {
            return { 'stats.count': source.count };
          }
          return { stats: { count: source.count, extra: 1 } };
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 11. Strategy with upsert as the shape key + nested return
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          settings: { mode: source.mode },
        }),
        upsert: true,
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 12. Strategy with sourceDeletionOverride + nested object (still warn — creation/update risk remains)
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          afterData: {
            matchesAggregation: {
              matchPreviews: { id: 'preview' },
            },
          },
          method: 'update',
          sourceDeletionOverride: DELETE_TARGET,
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 13. Deeply nested (3 levels) — still a single violation on the outermost nested prop
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          a: { b: { c: source.val } },
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 14. resolveSelf is referenced from another identifier (not named 'resolveSelf') — not exempt
      {
        code: `
      const myResolveAll = resolveParent;
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count },
        }),
        resolveAll: myResolveAll,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },
    ],
  },
);
