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

// Common words that can be part of valid compound words when used with specific prefixes
const VALID_COMPOUND_WORDS: { [prefix: string]: Set<string> } = {
  'do': new Set(['wnload']), // Only 'download' is valid with 'do'
  'check': new Set(['out']), // Only 'checkout' is valid with 'check'
  'set': new Set(['up']), // Only 'setup' is valid with 'set'
  'manage': new Set(['download']), // Allow 'manageDownload' for download management
  'process': new Set(['download']), // Allow 'processDownload' for download processing
  // Other prefixes don't have valid compound words
  'get': new Set([]),
  'update': new Set([]),
};

// Common semantic verbs that might contain disallowed prefixes
const VALID_SEMANTIC_VERBS = new Set([
  'download',
  'checkout',
  'setup',
]);

function hasDisallowedPrefix(name: string): { hasPrefix: boolean; prefix?: string } {
  // Split camelCase/PascalCase into words
  const words = name.split(/(?=[A-Z])/);

  // Get the first word without case transformations
  const firstWord = words[0];
  const firstWordLower = firstWord.toLowerCase();

  // Skip if the first word is a valid semantic verb
  if (VALID_SEMANTIC_VERBS.has(firstWordLower)) {
    return { hasPrefix: false };
  }

  // Check for disallowed prefixes
  for (const prefix of DISALLOWED_PREFIXES) {
    if (firstWordLower === prefix.toLowerCase()) {
      // If this is a standalone prefix (not part of a compound word)
      if (words.length > 1) {
        const nextWord = words[1].toLowerCase();
        // Check if this prefix has any valid compound words
        const validCompoundWords = VALID_COMPOUND_WORDS[prefix.toLowerCase()];
        if (validCompoundWords?.has(nextWord)) {
          return { hasPrefix: false };
        }
        // Special case: Allow 'Download' as a valid word after any prefix
        if (nextWord === 'download') {
          return { hasPrefix: false };
        }
      }
      return { hasPrefix: true, prefix };
    }
  }
  return { hasPrefix: false };
}

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

      const result = hasDisallowedPrefix(methodName);
      if (result.hasPrefix) {
        context.report({
          node: node.key,
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: result.prefix!,
            alternatives: SUGGESTED_ALTERNATIVES[result.prefix! as keyof typeof SUGGESTED_ALTERNATIVES].join(', '),
          },
        });
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

      const result = hasDisallowedPrefix(functionName);
      if (result.hasPrefix) {
        context.report({
          node: node.id || node,
          messageId: 'avoidGenericPrefix',
          data: {
            prefix: result.prefix!,
            alternatives: SUGGESTED_ALTERNATIVES[result.prefix! as keyof typeof SUGGESTED_ALTERNATIVES].join(', '),
          },
        });
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
