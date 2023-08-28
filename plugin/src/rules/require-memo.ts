import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint';
import { ASTHelpers } from '../utils/ASTHelpers';

export type NodeWithParent = TSESTree.Node & { parent: NodeWithParent };

const isComponentExplicitlyUnmemoized = (componentName: string) =>
  componentName.toLowerCase().includes('unmemoized');

function isFunction(
  node: TSESTree.Node,
): node is TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function isHigherOrderFunctionReturningJSX(node: TSESTree.Node): boolean {
  if (isFunction(node)) {
    // Check if function takes another function as an argument
    const hasFunctionParam = 'params' in node && node.params.some(isFunction);

    if (node.body && node.body.type === 'BlockStatement') {
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement' && statement.argument) {
          const returnsJSX = ASTHelpers.returnsJSX(statement.argument);
          const returnsFunction = isFunction(statement.argument);

          return (hasFunctionParam || returnsFunction) && returnsJSX;
        }
      }
    }
  }
  return false;
}

function checkFunction(
  context: Readonly<RuleContext<'requireMemo', []>>,
  node: (
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression
    | TSESTree.FunctionDeclaration
  ) &
    NodeWithParent,
) {
  const fileName = context.getFilename();
  if (!fileName.endsWith('.tsx')) {
    return;
  }
  if (isHigherOrderFunctionReturningJSX(node)) {
    console.log('Found HOF');
    return;
  }
  const currentNode = node.parent;
  if (node.parent.type === 'CallExpression') {
    return;
  }

  // while (currentNode.type === 'CallExpression') {
  //   if (isMemoCallExpression(currentNode) || true) {
  //     return;
  //   }

  //   currentNode = currentNode.parent;
  // }
  if (ASTHelpers.returnsJSX(node.body) && ASTHelpers.hasParameters(node)) {
    if (
      currentNode.type === 'VariableDeclarator' &&
      currentNode.id.type === 'Identifier' &&
      !isComponentExplicitlyUnmemoized(currentNode.id.name)
    ) {
      context.report({ node, messageId: 'requireMemo' });
    } else if (
      node.type === 'FunctionDeclaration' &&
      currentNode.type === 'Program' &&
      node.id &&
      !isComponentExplicitlyUnmemoized(node.id.name)
    ) {
      context.report({ node, messageId: 'requireMemo' });
    }
  }
}

export const requireMemo: TSESLint.RuleModule<'requireMemo', []> = {
  create: (context) => ({
    ArrowFunctionExpression(node) {
      checkFunction(context, node as any);
    },
    FunctionDeclaration(node) {
      checkFunction(context, node as any);
    },
    FunctionExpression(node) {
      checkFunction(context, node as any);
    },
  }),
  meta: {
    type: 'problem',
    docs: {
      description: 'React components must be memoized',
      recommended: 'error',
    },
    messages: {
      requireMemo: 'Component definition not wrapped in React.memo()',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
};
