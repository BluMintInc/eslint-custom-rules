import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noJsxInHooks';

const isJsxElement = (node: TSESTree.Node): boolean => {
  if (!node) return false;

  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return isJsxElement(node.consequent) || isJsxElement(node.alternate);
  }

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
    if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
      return typeName.left.type === AST_NODE_TYPES.Identifier &&
             typeName.left.name === 'JSX' &&
             typeName.right.type === AST_NODE_TYPES.Identifier &&
             typeName.right.name === 'Element';
    }
  }
  return false;
};

const containsJsxInBlockStatement = (node: TSESTree.BlockStatement): boolean => {
  const variablesWithJsx = new Set<string>();

  for (const statement of node.body) {
    // Check variable declarations for JSX assignments
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const declarator of statement.declarations) {
        if (declarator.init) {
          if (declarator.init.type === AST_NODE_TYPES.CallExpression &&
              containsJsxInUseMemo(declarator.init)) {
            if (declarator.id.type === AST_NODE_TYPES.Identifier) {
              variablesWithJsx.add(declarator.id.name);
            }
          }
        }
      }
    }

    // Check return statements
    if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument) {
      if (isJsxElement(statement.argument)) {
        return true;
      }
      if (statement.argument.type === AST_NODE_TYPES.CallExpression) {
        if (containsJsxInUseMemo(statement.argument)) {
          return true;
        }
      }
      if (statement.argument.type === AST_NODE_TYPES.Identifier &&
          variablesWithJsx.has(statement.argument.name)) {
        return true;
      }
    }

    // Check if statements
    if (statement.type === AST_NODE_TYPES.IfStatement) {
      if (statement.consequent.type === AST_NODE_TYPES.ReturnStatement &&
          statement.consequent.argument) {
        if (isJsxElement(statement.consequent.argument)) {
          return true;
        }
        if (statement.consequent.argument.type === AST_NODE_TYPES.Identifier &&
            variablesWithJsx.has(statement.consequent.argument.name)) {
          return true;
        }
      }
      if (statement.consequent.type === AST_NODE_TYPES.BlockStatement &&
          containsJsxInBlockStatement(statement.consequent)) {
        return true;
      }
      if (statement.alternate) {
        if (statement.alternate.type === AST_NODE_TYPES.ReturnStatement &&
            statement.alternate.argument) {
          if (isJsxElement(statement.alternate.argument)) {
            return true;
          }
          if (statement.alternate.argument.type === AST_NODE_TYPES.Identifier &&
              variablesWithJsx.has(statement.alternate.argument.name)) {
            return true;
          }
        }
        if (statement.alternate.type === AST_NODE_TYPES.BlockStatement &&
            containsJsxInBlockStatement(statement.alternate)) {
          return true;
        }
      }
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
      if (isJsxElement(body)) {
        return true;
      }
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        return containsJsxInBlockStatement(body);
      }
      if (body.type === AST_NODE_TYPES.CallExpression &&
          body.callee.type === AST_NODE_TYPES.MemberExpression &&
          body.callee.property.type === AST_NODE_TYPES.Identifier &&
          body.callee.property.name === 'map') {
        const mapCallback = body.arguments[0];
        if ((mapCallback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
             mapCallback.type === AST_NODE_TYPES.FunctionExpression) &&
            isJsxElement(mapCallback.body)) {
          return true;
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
            if (containsJsxInBlockStatement(node.body)) {
              context.report({
                node: node.id,
                messageId: 'noJsxInHooks',
              });
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
            if (containsJsxInBlockStatement(node.body)) {
              context.report({
                node: parent.id,
                messageId: 'noJsxInHooks',
              });
            }
          }
        }
      },
    };
  },
});
