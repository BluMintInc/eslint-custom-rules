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

      // 21. Flat dot-notation keys with `as const` on the return — the shape
      // enforce-object-literal-as-const's fixer produces; still flat, still fine.
      `
    const strategy = {
      transformEach: ({ source }) => {
        return {
          'worthSummary.countUnpriceable': source.count,
        } as const;
      },
      resolveAll: resolveParent,
    };
    `,

      // 22. Flat keys with an implicit-return `as const`
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'worthSummary.countUnpriceable': source.count,
      } as const),
      resolveAll: resolveParent,
    };
    `,

      // 23. resolveSelf exemption survives an assertion on the resolveAll value
      `
    const STATUS_STRATEGY = {
      transformEach: ({ source }) => ({
        roundsStatus: { current: source.status },
      }),
      resolveAll: resolveSelf as ResolveAllStrategy,
    };
    `,

      // 24. resolveSelf exemption survives a satisfies clause
      `
    const STATUS_STRATEGY = {
      transformEach: ({ source }) => ({
        roundsStatus: { current: source.status },
      }),
      resolveAll: resolveSelf satisfies ResolveAllStrategy,
    };
    `,

      // 25. resolveSelf exemption survives a non-null assertion
      `
    const STATUS_STRATEGY = {
      transformEach: ({ source }) => ({
        roundsStatus: { current: source.status },
      }),
      resolveAll: resolveSelf!,
    };
    `,

      // 26. Dot-notation key whose value carries an assertion — leaf data, exempt
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'members.abc': { name: source.name } as const,
      }),
      resolveAll: resolveParent,
    };
    `,

      // 27. Computed key whose value carries an assertion — dynamic leaf path, exempt
      `
    const strategy = {
      transformEach: ({ sourceRef: { id } }) => ({
        [\`cohortPreviews.\${id}\`]: { name: 'x' } as const,
      }),
      resolveAll: resolveParent,
    };
    `,

      // 28. Unwrapping stops at a non-literal: an asserted member expression is
      // not an object literal, so there is no nested-write shape to flag.
      `
    const strategy = {
      transformEach: ({ source }) => ({
        worthSummary: source.worthSummary as WorthSummary,
        names: source.names as string[],
      }),
      resolveAll: resolveParent,
    };
    `,

      // 29. afterData whose value is an asserted call — still not statically analyzable
      `
    const strategy = {
      transformEach: ({ source }) => ({
        afterData: buildAfterData(source) as AfterData,
        method: 'update',
      }),
      resolveAll: resolveParent,
    };
    `,

      // 30. Factory reference with an assertion — no inline function body to analyze
      `
    const strategy = {
      transformEach: makeTransform(config) as TransformEach,
      resolveAll: resolveParent,
    };
    `,

      // 31. transformEach returning an asserted primitive — no object to check
      `
    const strategy = {
      transformEach: ({ source }) => source.count as number,
      resolveAll: resolveParent,
    };
    `,

      // 32. Binding pattern with an asserted flat initialiser
      `
    const strategy = {
      transformEach: ({ source }) => {
        const result = {
          'worthSummary.countUnpriceable': source.count,
        } as const;
        return result;
      },
      resolveAll: resolveParent,
    };
    `,

      // 33. Strategy object itself asserted, flat keys inside
      `
    const strategy = {
      transformEach: ({ source }) => ({
        'worthSummary.countUnpriceable': source.count,
      }),
      resolveAll: resolveParent,
    } as const;
    `,

      // 34. Non-strategy object with asserted nested return — still not a strategy
      `
    const notAStrategy = {
      transformEach: ({ source }) => ({
        worthSummary: { priceable: source.val },
      } as const),
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

      // 15. The exact shape `enforce-object-literal-as-const --fix` produces on
      // the issue's strategy: `as const` appended to the returned object.
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
          } as const;
        },
        numericFieldPathConfig: {
          'worthSummary.countUnpriceable': 'FieldValue.increment',
        },
        resolveAll: resolveParentSkipRegistry,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 16. satisfies clause on the returned object
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return {
            worthSummary: { count: source.count },
          } satisfies Record<string, unknown>;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 17. Non-null assertion on the returned object
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return {
            worthSummary: { count: source.count },
          }!;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 18. Angle-bracket type assertion on the returned object
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return <const>{
            worthSummary: { count: source.count },
          };
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 19. Wrappers nest: as const + satisfies
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return {
            worthSummary: { count: source.count },
          } as const satisfies Record<string, unknown>;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 20. Wrappers nest: non-null plus a double assertion
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          return {
            worthSummary: { count: source.count },
          }! as unknown as WorthUpdates;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 21. Implicit arrow return wrapped in an assertion
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count },
        } as const),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 22. Assertion on the nested value rather than the whole return
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count } as const,
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 23. Assertion on the afterData container value
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          afterData: {
            worthSummary: { count: source.count },
          } as const,
          method: 'update',
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 24. Assertion on a nested value inside afterData
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          afterData: {
            worthSummary: { count: source.count } as const,
          },
          method: 'update',
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 25. Assertion on the initialiser of a returned binding
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          const result = {
            worthSummary: { count: source.count },
          } as const;
          return result;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 26. Assertion on the returned identifier of a binding
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          const result = {
            worthSummary: { count: source.count },
          };
          return result as WorthUpdates;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 27. Assertions on both the binding initialiser and the return
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => {
          const result = {
            worthSummary: { count: source.count },
          } as const;
          return result!;
        },
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 28. The transform itself is asserted at its binding — an arrow function
      // wrapped in `as` is still the transformEach the strategy runs.
      {
        code: `
      const strategy = {
        transformEach: (({ source }) => ({
          worthSummary: { count: source.count },
        })) as TransformEach,
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 29. A function expression asserted at its binding, with a wrapped return
      {
        code: `
      const strategy = {
        transformEach: (function ({ source }) {
          return {
            worthSummary: { count: source.count },
          } as const;
        }) as TransformEach,
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 30. Method shorthand with a wrapped return
      {
        code: `
      const strategy = {
        transformEach({ source }) {
          return {
            roundsStatus: { current: source.status },
          } as const;
        },
        resolveAll: resolveParentSkipRegistry,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 31. The strategy object itself is asserted, with a wrapped nested return
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count },
        } as const),
        resolveAll: resolveParent,
      } as const;
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 32. Wrappers at every level at once
      {
        code: `
      const strategy = {
        transformEach: (({ source }) => {
          const result = {
            afterData: {
              worthSummary: { count: source.count } as const,
            } as const,
            method: 'update',
          }! as unknown as Updates;
          return result satisfies Updates;
        }) as TransformEach,
        resolveAll: resolveParent,
      } as const;
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 33. Two wrapped nested keys — one error each
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count } as const,
          matchesAggregation: { total: source.total } as const,
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [
          { messageId: 'preferFlatTransformEachKeys' },
          { messageId: 'preferFlatTransformEachKeys' },
        ],
      },

      // 34. An asserted resolveAll that is not resolveSelf stays unexempt
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: { count: source.count },
        } as const),
        resolveAll: resolveParentSkipRegistry as ResolveAllStrategy,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 35. upsert strategy shape with a wrapped nested value
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          settings: { mode: source.mode } as const,
        }),
        upsert: true,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 36. numericFieldPathConfig strategy shape with a wrapped return
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          worthSummary: {
            countUnpriceable: source.isActive ? 1 : 0,
          },
        } satisfies Record<string, unknown>),
        numericFieldPathConfig: {
          'worthSummary.countUnpriceable': 'FieldValue.increment',
        },
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },

      // 37. sourceDeletionOverride strategy shape with a wrapped afterData
      {
        code: `
      const strategy = {
        transformEach: ({ source }) => ({
          afterData: {
            matchesAggregation: { matchPreviews: { id: 'preview' } },
          } as const,
          method: 'update',
          sourceDeletionOverride: DELETE_TARGET,
        }),
        resolveAll: resolveParent,
      };
      `,
        errors: [{ messageId: 'preferFlatTransformEachKeys' }],
      },
    ],
  },
);
