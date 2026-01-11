import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'separateLoadingState';
type Options = [
  {
    patterns?: string[];
  }?,
];

const LOADING_PATTERNS = [
  /^is.*Loading$/i, // isXLoading pattern
  /^isLoading.+/i, // isLoadingX pattern
];

export const noSeparateLoadingState = createRule<Options, MessageIds>({
  name: 'no-separate-loading-state',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage separate loading state variables that track the loading status of other state',
      recommended: 'error',
    },
    fixable: undefined, // No autofix as mentioned in the spec
    schema: [
      {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      separateLoadingState:
        'Loading flag "{{stateName}}" might be splitting the source of truth for your data. This rule is a suggestion; complex UIs may legitimately require multiple loading flags. If this separate state is intentional, please use an // eslint-disable-next-line @blumintinc/blumint/no-separate-loading-state comment. Otherwise, consider encoding the loading phase inside the primary state (e.g., using a discriminated union or sentinel value) to prevent state drift.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const effectivePatterns =
      options?.patterns?.map((p) => new RegExp(p, 'i')) ?? LOADING_PATTERNS;

    const setterTrackers: Array<{
      declarator: TSESTree.VariableDeclarator;
      setterVar: TSESLint.Scope.Variable;
      usage: { truthy: boolean; falsy: boolean };
      stateName: string;
    }> = [];

    function isLoadingPattern(name: string): boolean {
      return effectivePatterns.some((pattern) => pattern.test(name));
    }

    function isUseStateCall(node: TSESTree.CallExpression): boolean {
      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useState'
      ) {
        return true;
      }
      if (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === 'useState'
      ) {
        return true;
      }
      return false;
    }

    function isTruthyValue(node: TSESTree.CallExpressionArgument): boolean {
      if (node.type === AST_NODE_TYPES.Literal) {
        return Boolean(node.value);
      }
      return false;
    }

    function isFalsyValue(node: TSESTree.CallExpressionArgument): boolean {
      if (node.type === AST_NODE_TYPES.Literal) {
        return !node.value;
      }
      return false;
    }

    return {
      VariableDeclarator(node) {
        // Check for useState destructuring patterns
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          isUseStateCall(node.init)
        ) {
          const arrayPattern = node.id;

          // Check if we have at least 2 elements (state and setter)
          if (arrayPattern.elements.length >= 2) {
            const stateElement = arrayPattern.elements[0];
            const setterElement = arrayPattern.elements[1];

            if (
              stateElement?.type === AST_NODE_TYPES.Identifier &&
              setterElement?.type === AST_NODE_TYPES.Identifier &&
              isLoadingPattern(stateElement.name)
            ) {
              const declared = context.getDeclaredVariables(node);
              const setterVar =
                declared.find((v) => v.name === setterElement.name) ?? null;
              if (!setterVar) return;
              setterTrackers.push({
                declarator: node,
                setterVar,
                usage: { truthy: false, falsy: false },
                stateName: stateElement.name,
              });
            }
          }
        }
      },

      CallExpression() {
        // Setter usage is resolved via scope references in Program:exit
        return;
      },

      'Program:exit'() {
        // Analyze collected data to determine violations
        for (const tracker of setterTrackers) {
          // Walk references of the exact setter variable to classify usages
          for (const ref of tracker.setterVar.references) {
            const parent = ref.identifier.parent;
            if (
              parent &&
              parent.type === AST_NODE_TYPES.CallExpression &&
              parent.callee === ref.identifier &&
              parent.arguments.length > 0
            ) {
              const argument = parent.arguments[0];
              if (isTruthyValue(argument)) {
                tracker.usage.truthy = true;
              } else if (isFalsyValue(argument)) {
                tracker.usage.falsy = true;
              }
            }
          }

          const { declarator, usage, stateName } = tracker;

          // If we have both truthy and falsy setter calls, it's likely a loading state pattern
          if (usage.truthy && usage.falsy) {
            context.report({
              node: declarator,
              messageId: 'separateLoadingState',
              data: {
                stateName,
              },
            });
          }
        }
      },
    };
  },
});
