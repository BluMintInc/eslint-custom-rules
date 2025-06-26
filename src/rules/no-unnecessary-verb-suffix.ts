import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const COMMON_PREPOSITION_SUFFIXES = new Set([
  // Basic prepositions
  'From',
  'For',
  'With',
  'To',
  'By',
  'In',
  'On',
  'At',
  'Of',

  // Temporal prepositions
  'During',
  'Until',
  'Till',
  'Since',
  'Within',

  // Logical/causal prepositions
  'Because',
  'Despite',
  'Instead',
  'Via',
  'Without',
  'Versus',
  'Vs',

  // Comparative prepositions
  'Than',
  'As',

  // Phrasal prepositions (common endings)
  'Against',
  'Among',
  'Amongst',
  'Beside',
  'Besides',
  'Between',
  'Beyond',
  'Concerning',
  'Considering',
  'Regarding',
  'Respecting',
  'Towards',
  'Toward',
  'Upon',

  // Preposition-like adverbs
  'Again',
  'Already',
  'Always',
  'Ever',
  'Never',
  'Now',
  'Soon',
  'Then',
  'There',
  'Where',
  'When',
  'While',

  // Programming-specific suffixes
  'Async',
  'Sync',
]);

type MessageIds = 'unnecessaryVerbSuffix';

export const noUnnecessaryVerbSuffix = createRule<[], MessageIds>({
  name: 'no-unnecessary-verb-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prevent unnecessary verb suffixes in function and method names',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryVerbSuffix:
        'Unnecessary verb suffix "{{suffix}}" in function name. Consider using "{{suggestion}}" instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    function checkFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
      name: string | null,
    ): void {
      if (!name) return;

      for (const suffix of COMMON_PREPOSITION_SUFFIXES) {
        // Check if the name ends with the suffix
        if (name.endsWith(suffix)) {
          // Make sure there's a verb before the suffix (camelCase format)
          // This regex checks for a verb pattern before the suffix
          // It looks for a word character followed by lowercase letters before the suffix
          const verbBeforeSuffixPattern = new RegExp(`\\w[a-z]+${suffix}$`);

          if (verbBeforeSuffixPattern.test(name)) {
            const suggestion = name.substring(0, name.length - suffix.length);

            // Skip if the suggestion would be empty or just a single character
            if (suggestion.length <= 1) continue;

            context.report({
              node,
              messageId: 'unnecessaryVerbSuffix',
              data: {
                suffix,
                suggestion,
              },
              fix(fixer) {
                if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
                  return fixer.replaceText(node.id!, suggestion);
                } else if (
                  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  node.type === AST_NODE_TYPES.FunctionExpression
                ) {
                  const parent = node.parent;
                  if (
                    parent &&
                    (parent.type === AST_NODE_TYPES.VariableDeclarator ||
                      parent.type === AST_NODE_TYPES.Property ||
                      parent.type === AST_NODE_TYPES.MethodDefinition)
                  ) {
                    if ('key' in parent) {
                      return fixer.replaceText(parent.key, suggestion);
                    } else if ('id' in parent && parent.id) {
                      return fixer.replaceText(parent.id, suggestion);
                    }
                  }
                }
                return null;
              },
            });
          }
        }
      }
    }

    return {
      FunctionDeclaration(node): void {
        if (node.id) {
          checkFunctionName(node, node.id.name);
        }
      },
      VariableDeclarator(node): void {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init?.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(node.init, node.id.name);
        }
      },
      MethodDefinition(node): void {
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node.value as TSESTree.FunctionExpression,
            node.key.name,
          );
        }
      },
      TSMethodSignature(node): void {
        // Handle interface method signatures
        if (node.key.type === AST_NODE_TYPES.Identifier) {
          checkFunctionName(
            node as unknown as TSESTree.FunctionExpression,
            node.key.name,
          );
        }
      },
      Property(node): void {
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          (node.value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.value.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          checkFunctionName(node.value, node.key.name);
        }
      },
      FunctionExpression(node): void {
        // Handle named function expressions
        if (node.id) {
          checkFunctionName(node, node.id.name);
        }
      },
    };
  },
});
