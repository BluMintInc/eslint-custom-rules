import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferSetAll' | 'preferOverwriteAll';

const SETTER_METHODS = new Set(['set', 'overwrite']);

function isSetterMethodCall(node: TSESTree.CallExpression): { isValid: boolean; methodName?: string } {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return { isValid: false };
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return { isValid: false };
  const methodName = node.callee.property.name;
  return { isValid: SETTER_METHODS.has(methodName), methodName };
}

function isInLoop(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    switch (current.type) {
      case AST_NODE_TYPES.ForStatement:
      case AST_NODE_TYPES.ForInStatement:
      case AST_NODE_TYPES.ForOfStatement:
      case AST_NODE_TYPES.WhileStatement:
      case AST_NODE_TYPES.DoWhileStatement:
        return true;
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
        if (current.parent?.type === AST_NODE_TYPES.CallExpression) {
          const callee = current.parent.callee;
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            ['map', 'forEach', 'filter', 'reduce', 'every', 'some'].includes(callee.property.name)
          ) {
            return true;
          }
        }
        return false;
      case AST_NODE_TYPES.Program:
        return false;
    }
    current = current.parent as TSESTree.Node;
  }
  return false;
}

export const preferBatchOperations = createRule<[], MessageIds>({
  name: 'prefer-batch-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using setAll() and overwriteAll() instead of multiple set() or overwrite() calls',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferSetAll: 'Use setAll() instead of multiple set() calls for better performance',
      preferOverwriteAll: 'Use overwriteAll() instead of multiple overwrite() calls for better performance',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const { isValid, methodName } = isSetterMethodCall(node);
        if (!isValid || !methodName) return;

        if (!isInLoop(node)) return;

        const messageId = methodName === 'set' ? 'preferSetAll' : 'preferOverwriteAll';

        context.report({
          node,
          messageId,
        });
      },
    };
  },
});
