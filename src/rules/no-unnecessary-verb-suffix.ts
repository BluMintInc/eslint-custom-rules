import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const COMMON_VERB_SUFFIXES = new Set([
  'From',
  'For',
  'With',
  'To',
  'By',
  'In',
  'On',
  'Through',
  'Via',
  'Against',
  'Under',
  'After',
  'Before',
  'During',
  'Until',
]);

type MessageIds = 'unnecessaryVerbSuffix';

export const noUnnecessaryVerbSuffix = createRule<[], MessageIds>({
  name: 'no-unnecessary-verb-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent unnecessary verb suffixes in function and method names',
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
      node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      name: string | null,
    ): void {
      if (!name) return;

      for (const suffix of COMMON_VERB_SUFFIXES) {
        const suffixPattern = new RegExp(`${suffix}$`);
        const suffixWithVerbPattern = new RegExp(`[A-Z][a-z]+${suffix}$`);

        if (suffixPattern.test(name) && suffixWithVerbPattern.test(name)) {
          const suggestion = name.replace(suffixPattern, '');
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
          checkFunctionName(node.value as TSESTree.FunctionExpression, node.key.name);
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
    };
  },
});
