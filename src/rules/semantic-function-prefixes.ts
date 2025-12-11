import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'avoidGenericPrefix';

const DISALLOWED_PREFIXES = new Set([
  'get',
  'update',
  'check',
  'manage',
  'process',
  'do',
]);

const NEXTJS_DATA_FUNCTIONS = new Set([
  'getServerSideProps',
  'getStaticProps',
  'getStaticPaths',
]);

const SUGGESTED_ALTERNATIVES = {
  get: ['fetch', 'retrieve', 'compute', 'derive'],
  update: ['modify', 'set', 'apply'],
  check: ['validate', 'assert', 'ensure'],
  manage: ['control', 'coordinate', 'schedule'],
  process: ['transform', 'sanitize', 'compute'],
  do: ['execute', 'perform', 'apply'],
};

function extractFirstWord(name: string): string {
  let firstWord = name;
  for (let i = 1; i < name.length; i++) {
    const currentChar = name[i];
    const prevChar = name[i - 1];
    // lowercase -> Uppercase (camel/Pascal boundary)
    if (
      prevChar >= 'a' &&
      prevChar <= 'z' &&
      currentChar >= 'A' &&
      currentChar <= 'Z'
    ) {
      firstWord = name.substring(0, i);
      break;
    }
    // UPPERCASE acronym -> lowercase word start (e.g., XML|Http)
    if (
      prevChar >= 'A' &&
      prevChar <= 'Z' &&
      currentChar >= 'a' &&
      currentChar <= 'z'
    ) {
      if (i > 1) {
        firstWord = name.substring(0, i - 1);
        break;
      }
    }
  }
  return firstWord;
}

export const semanticFunctionPrefixes = createRule<[], MessageIds>({
  name: 'semantic-function-prefixes',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require semantic function prefixes instead of generic verbs so callers know whether a function fetches data, transforms input, or mutates state',
      recommended: 'error',
    },
    schema: [],
    messages: {
      avoidGenericPrefix:
        'Function "{{functionName}}" starts with the generic prefix "{{prefix}}", which hides whether it fetches remote data, transforms input, or mutates state. Use a semantic verb such as {{alternatives}} to describe the operation and set caller expectations.',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkMethodName(node: TSESTree.MethodDefinition) {
      // Skip getters and setters
      if (node.kind === 'get' || node.kind === 'set') {
        return;
      }

      const methodName =
        node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : '';
      if (!methodName) return;

      // Skip if method starts with 'is' (boolean check methods are okay)
      if (methodName.startsWith('is')) return;

      // Skip Next.js data-fetching functions
      if (NEXTJS_DATA_FUNCTIONS.has(methodName)) return;

      // Extract first word from PascalCase/camelCase
      const firstWord = extractFirstWord(methodName);

      // Check for disallowed prefixes
      // Only flag if the disallowed word is used as a prefix (not the entire name)
      for (const prefix of DISALLOWED_PREFIXES) {
        if (
          firstWord.toLowerCase() === prefix.toLowerCase() &&
          firstWord.length < methodName.length
        ) {
          context.report({
            node: node.key,
            messageId: 'avoidGenericPrefix',
            data: {
              functionName: methodName,
              prefix,
              alternatives:
                SUGGESTED_ALTERNATIVES[
                  prefix as keyof typeof SUGGESTED_ALTERNATIVES
                ].join(', '),
            },
          });
          break;
        }
      }
    }

    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ) {
      // Skip anonymous functions
      if (!node.id && node.parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
        return;
      }

      // Get function name from either the function declaration or variable declarator
      let functionName = '';
      if (node.id) {
        functionName = node.id.name;
      } else if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        functionName = node.parent.id.name;
      }

      if (!functionName) return;

      // Skip if function starts with 'is' (boolean check functions are okay)
      if (functionName.startsWith('is')) return;

      // Skip Next.js data-fetching functions
      if (NEXTJS_DATA_FUNCTIONS.has(functionName)) return;

      // Extract first word from PascalCase/camelCase
      const firstWord = extractFirstWord(functionName);

      // Check for disallowed prefixes
      // Only flag if the disallowed word is used as a prefix (not the entire name)
      for (const prefix of DISALLOWED_PREFIXES) {
        if (
          firstWord.toLowerCase() === prefix.toLowerCase() &&
          firstWord.length < functionName.length
        ) {
          context.report({
            node: node.id || node,
            messageId: 'avoidGenericPrefix',
            data: {
              functionName,
              prefix,
              alternatives:
                SUGGESTED_ALTERNATIVES[
                  prefix as keyof typeof SUGGESTED_ALTERNATIVES
                ].join(', '),
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
