import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { RuleContext } from '@typescript-eslint/utils/dist/ts-eslint';
import { ASTHelpers } from '../utils/ASTHelpers';

export type NodeWithParent = TSESTree.Node & { parent: NodeWithParent };

const isComponentExplicitlyUnmemoized = (componentName: string) =>
  componentName.toLowerCase().includes('unmemoized');

function isMemoCallExpression(node: TSESTree.Node) {
  if (node.type !== 'CallExpression') return false;
  if (node.callee.type === 'MemberExpression') {
    const {
      callee: { object, property },
    } = node;
    if (
      object.type === 'Identifier' &&
      property.type === 'Identifier' &&
      object.name === 'React' &&
      property.name === 'memo'
    ) {
      return true;
    }
  } else if (node.callee.type === 'Identifier' && node.callee.name === 'memo') {
    return true;
  }

  return false;
}

function isHigherOrderFunctionReturningJSX(node: TSESTree.Node): boolean {
  if (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) {
    if (
      node.body.type === 'ArrowFunctionExpression' ||
      node.body.type === 'FunctionExpression'
    ) {
      return ASTHelpers.returnsJSX(node.body.body);
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
    return;
  }
  let currentNode = node.parent;

  while (currentNode.type === 'CallExpression') {
    if (isMemoCallExpression(currentNode)) {
      return;
    }

    currentNode = currentNode.parent;
  }
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
