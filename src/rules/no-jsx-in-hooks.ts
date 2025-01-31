import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noJsxInHooks';

const isJsxElement = (node: TSESTree.Node): boolean => {
  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment ||
    node.type === AST_NODE_TYPES.JSXExpressionContainer
  );
};

const isJsxReturnType = (node: TSESTree.TSTypeAnnotation): boolean => {
  if (node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
    const typeName = node.typeAnnotation.typeName;
    if (typeName.type === AST_NODE_TYPES.Identifier) {
      return ['JSX', 'ReactNode', 'ReactElement'].includes(typeName.name);
    }
  }
  return false;
};

const containsJsxInUseMemo = (node: TSESTree.CallExpression): boolean => {
  if (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useMemo' &&
    node.arguments.length > 0
  ) {
    const callback = node.arguments[0];
    if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression) {
      const body = callback.body;
      if (body.type === AST_NODE_TYPES.JSXElement ||
          body.type === AST_NODE_TYPES.JSXFragment) {
        return true;
      }
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        for (const statement of body.body) {
          if (statement.type === AST_NODE_TYPES.ReturnStatement &&
              statement.argument &&
              isJsxElement(statement.argument)) {
            return true;
          }
        }
      }
    }
  }
  return false;
};

export const noJsxInHooks = createRule<[], MessageIds>({
  name: 'no-jsx-in-hooks',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent hooks from returning JSX',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noJsxInHooks:
        'Hooks should not return JSX. Convert this hook into a component or extract the JSX into a separate component.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.id && node.id.name.startsWith('use')) {
          // Check return type annotation
          if (node.returnType && isJsxReturnType(node.returnType)) {
            context.report({
              node: node.id,
              messageId: 'noJsxInHooks',
            });
            return;
          }

          // Check return statements
          if (node.body.type === AST_NODE_TYPES.BlockStatement) {
            for (const statement of node.body.body) {
              if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
                if (isJsxElement(statement.argument)) {
                  context.report({
                    node: node.id,
                    messageId: 'noJsxInHooks',
                  });
                  break;
                }

                // Check for JSX returned via useMemo
                if (
                  statement.argument.type === AST_NODE_TYPES.CallExpression &&
                  containsJsxInUseMemo(statement.argument)
                ) {
                  context.report({
                    node: node.id,
                    messageId: 'noJsxInHooks',
                  });
                  break;
                }
              }
            }
          }
        }
      },
      ArrowFunctionExpression(node) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          parent.id.name.startsWith('use')
        ) {
          // Check return type annotation
          if (node.returnType && isJsxReturnType(node.returnType)) {
            context.report({
              node: parent.id,
              messageId: 'noJsxInHooks',
            });
            return;
          }

          // Check direct JSX return
          if (isJsxElement(node.body)) {
            context.report({
              node: parent.id,
              messageId: 'noJsxInHooks',
            });
            return;
          }

          // Check block body returns
          if (node.body.type === AST_NODE_TYPES.BlockStatement) {
            for (const statement of node.body.body) {
              if (
                statement.type === AST_NODE_TYPES.ReturnStatement &&
                statement.argument
              ) {
                if (isJsxElement(statement.argument)) {
                  context.report({
                    node: parent.id,
                    messageId: 'noJsxInHooks',
                  });
                  break;
                }

                // Check for JSX returned via useMemo
                if (
                  statement.argument.type === AST_NODE_TYPES.CallExpression &&
                  containsJsxInUseMemo(statement.argument)
                ) {
                  context.report({
                    node: parent.id,
                    messageId: 'noJsxInHooks',
                  });
                  break;
                }
              }
            }
          }
        }
      },
    };
  },
});
