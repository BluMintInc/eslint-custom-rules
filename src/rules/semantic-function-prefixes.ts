import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidGenericPrefix';

const DISALLOWED_PREFIXES = new Set(['get', 'update', 'check', 'manage', 'process', 'do']);

const SUGGESTED_ALTERNATIVES = {
  get: ['fetch', 'retrieve', 'compute', 'derive'],
  update: ['modify', 'set', 'apply'],
  check: ['validate', 'assert', 'ensure'],
  manage: ['control', 'coordinate', 'schedule'],
  process: ['transform', 'sanitize', 'compute'],
  do: ['execute', 'perform', 'apply'],
};

export const semanticFunctionPrefixes = createRule<[], MessageIds>({
  name: 'semantic-function-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce semantic function prefixes over generic ones like "get" and "update"',
      recommended: 'error',
    },
    schema: [],
    messages: {
      avoidGenericPrefix:
        'Avoid using generic prefix "{{prefix}}". Consider using one of these alternatives: {{alternatives}}',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkFunctionName(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Get function name from either the function declaration or variable declarator
      let functionName = '';
      if (node.id) {
        functionName = node.id.name;
      } else if (node.parent?.type === AST_NODE_TYPES.VariableDeclarator && node.parent.id.type === AST_NODE_TYPES.Identifier) {
        functionName = node.parent.id.name;
      }

      if (!functionName) return;

      // Skip if function starts with 'is' (boolean check functions are okay)
      if (functionName.startsWith('is')) return;

      // Skip class getters
      if (node.parent?.type === AST_NODE_TYPES.MethodDefinition && node.parent.kind === 'get') {
        return;
      }

      // Check for disallowed prefixes
      for (const prefix of DISALLOWED_PREFIXES) {
        if (functionName.toLowerCase().startsWith(prefix.toLowerCase())) {
          context.report({
            node: node.id || node,
            messageId: 'avoidGenericPrefix',
            data: {
              prefix,
              alternatives: SUGGESTED_ALTERNATIVES[prefix as keyof typeof SUGGESTED_ALTERNATIVES].join(', '),
            },
          });
          break;
        }
      }
    }

    return {
      FunctionDeclaration: checkFunctionName,
      FunctionExpression: checkFunctionName,
      ArrowFunctionExpression: checkFunctionName,
    };
  },
});
