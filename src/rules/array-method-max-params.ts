import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'tooManyParams';

const ARRAY_METHODS = new Set([
  'reduce',
  'reduceRight',
  'map',
  'filter',
  'forEach',
  'every',
  'some',
  'find',
  'findIndex',
]);

const METHOD_MAX_PARAMS = {
  reduce: 4, // accumulator, currentValue, index, array
  reduceRight: 4,
  map: 3, // currentValue, index, array
  filter: 3,
  forEach: 3,
  every: 3,
  some: 3,
  find: 3,
  findIndex: 3,
};

export const arrayMethodMaxParams = createRule<[{ max?: number }], MessageIds>({
  name: 'array-method-max-params',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce maximum number of parameters while allowing array method callbacks to use their standard parameters',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyParams: 'Function has too many parameters ({{count}}). Maximum allowed is {{max}}.',
    },
  },
  defaultOptions: [{ max: 2 }],
  create(context, [options]) {
    const maxParams = options.max ?? 2;

    function isArrayMethodCallback(node: TSESTree.Node): boolean {
      if (node.parent?.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const call = node.parent;
      if (call.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const method = call.callee.property;
      if (method.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      return ARRAY_METHODS.has(method.name);
    }

    function getMethodMaxParams(node: TSESTree.Node): number {
      if (node.parent?.type !== AST_NODE_TYPES.CallExpression) {
        return maxParams;
      }

      const call = node.parent;
      if (call.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return maxParams;
      }

      const method = call.callee.property;
      if (method.type !== AST_NODE_TYPES.Identifier) {
        return maxParams;
      }

      return METHOD_MAX_PARAMS[method.name as keyof typeof METHOD_MAX_PARAMS] ?? maxParams;
    }

    return {
      FunctionDeclaration(node) {
        const methodMaxParams = isArrayMethodCallback(node) ? getMethodMaxParams(node) : maxParams;
        if (node.params.length > methodMaxParams) {
          context.report({
            node,
            messageId: 'tooManyParams',
            data: {
              count: node.params.length,
              max: methodMaxParams,
            },
          });
        }
      },
      FunctionExpression(node) {
        const methodMaxParams = isArrayMethodCallback(node) ? getMethodMaxParams(node) : maxParams;
        if (node.params.length > methodMaxParams) {
          context.report({
            node,
            messageId: 'tooManyParams',
            data: {
              count: node.params.length,
              max: methodMaxParams,
            },
          });
        }
      },
      ArrowFunctionExpression(node) {
        const methodMaxParams = isArrayMethodCallback(node) ? getMethodMaxParams(node) : maxParams;
        if (node.params.length > methodMaxParams) {
          context.report({
            node,
            messageId: 'tooManyParams',
            data: {
              count: node.params.length,
              max: methodMaxParams,
            },
          });
        }
      },
    };
  },
});
