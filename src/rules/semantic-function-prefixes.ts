import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidGenericPrefix';

const DISALLOWED_PREFIXES = new Set(['get', 'update', 'check', 'manage', 'process', 'do']);

const NEXTJS_DATA_FUNCTIONS = new Set(['getServerSideProps', 'getStaticProps', 'getStaticPaths']);

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
    function checkMethodName(node: TSESTree.MethodDefinition) {
      // Skip getters and setters
      if (node.kind === 'get' || node.kind === 'set') {
        return;
      }

      const methodName = node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : '';
      if (!methodName) return;

      // Skip if method starts with 'is' (boolean check methods are okay)
      if (methodName.startsWith('is')) return;

      // Skip Next.js data-fetching functions
      if (NEXTJS_DATA_FUNCTIONS.has(methodName)) return;

      // Extract first word from PascalCase/camelCase
      let firstWord = methodName;
      for (let i = 1; i < methodName.length; i++) {
        if (methodName[i] >= 'A' && methodName[i] <= 'Z') {
          firstWord = methodName.substring(0, i);
          break;
        }
      }

      // Check for disallowed prefixes
      for (const prefix of DISALLOWED_PREFIXES) {
        if (firstWord.toLowerCase() === prefix.toLowerCase()) {
          context.report({
            node: node.key,
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

      // Skip Next.js data-fetching functions
      if (NEXTJS_DATA_FUNCTIONS.has(functionName)) return;

      // Extract first word from PascalCase/camelCase
      let firstWord = functionName;
      for (let i = 1; i < functionName.length; i++) {
        if (functionName[i] >= 'A' && functionName[i] <= 'Z') {
          firstWord = functionName.substring(0, i);
          break;
        }
      }

      // Check for disallowed prefixes
      for (const prefix of DISALLOWED_PREFIXES) {
        if (firstWord.toLowerCase() === prefix.toLowerCase()) {
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
      MethodDefinition: checkMethodName,
    };
  },
});
