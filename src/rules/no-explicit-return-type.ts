import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noExplicitReturnType';

type Options = [
  {
    allowRecursiveFunctions?: boolean;
    allowOverloadedFunctions?: boolean;
    allowInterfaceMethodSignatures?: boolean;
    allowAbstractMethodSignatures?: boolean;
    allowDtsFiles?: boolean;
  },
];

const defaultOptions: Options[0] = {
  allowRecursiveFunctions: true,
  allowOverloadedFunctions: true,
  allowInterfaceMethodSignatures: true,
  allowAbstractMethodSignatures: true,
  allowDtsFiles: true,
};

function isRecursiveFunction(node: TSESTree.FunctionLike): boolean {
  const functionName =
    node.type === AST_NODE_TYPES.FunctionDeclaration ? node.id?.name :
    node.type === AST_NODE_TYPES.FunctionExpression && node.id ? node.id.name :
    undefined;

  if (!functionName || !node.body) return false;

  let hasRecursiveCall = false;
  function checkNode(node: TSESTree.Node): void {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === functionName
    ) {
      hasRecursiveCall = true;
      return;
    }

    // Only traverse specific node types to avoid circular references
    if (node.type === AST_NODE_TYPES.BlockStatement) {
      node.body.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.ExpressionStatement) {
      checkNode(node.expression);
    } else if (node.type === AST_NODE_TYPES.CallExpression) {
      checkNode(node.callee);
      node.arguments.forEach(checkNode);
    } else if (node.type === AST_NODE_TYPES.BinaryExpression) {
      checkNode(node.left);
      checkNode(node.right);
    } else if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument) {
      checkNode(node.argument);
    } else if (node.type === AST_NODE_TYPES.IfStatement) {
      checkNode(node.test);
      checkNode(node.consequent);
      if (node.alternate) {
        checkNode(node.alternate);
      }
    }
  }

  checkNode(node.body);
  return hasRecursiveCall;
}

function isOverloadedFunction(node: TSESTree.Node): boolean {
  if (!node.parent) return false;

  if (node.type === AST_NODE_TYPES.TSMethodSignature) {
    const interfaceBody = node.parent;
    if (interfaceBody.type !== AST_NODE_TYPES.TSInterfaceBody) return false;

    const methodName = node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : undefined;
    if (!methodName) return false;

    return interfaceBody.body.filter(
      member =>
        member.type === AST_NODE_TYPES.TSMethodSignature &&
        member.key.type === AST_NODE_TYPES.Identifier &&
        member.key.name === methodName,
    ).length > 1;
  }

  return false;
}

function isInterfaceOrAbstractMethodSignature(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.TSMethodSignature) return true;

  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    let current: TSESTree.Node | undefined = node;
    while (current) {
      if (current.type === AST_NODE_TYPES.ClassDeclaration && current.abstract) {
        return true;
      }
      current = current.parent;
    }
  }

  return false;
}

export const noExplicitReturnType = createRule<Options, MessageIds>({
  name: 'no-explicit-return-type',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow explicit return types on functions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowRecursiveFunctions: { type: 'boolean' },
          allowOverloadedFunctions: { type: 'boolean' },
          allowInterfaceMethodSignatures: { type: 'boolean' },
          allowAbstractMethodSignatures: { type: 'boolean' },
          allowDtsFiles: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noExplicitReturnType: 'Explicit return type is not allowed. Let TypeScript infer it.',
    },
  },
  defaultOptions: [defaultOptions],
  create(context, [options]) {
    const mergedOptions = { ...defaultOptions, ...options };
    const filename = context.getFilename();

    if (mergedOptions.allowDtsFiles && filename.endsWith('.d.ts')) {
      return {};
    }

    function fixReturnType(fixer: any, node: any) {
      const returnType = node.returnType || node.value?.returnType;
      if (!returnType) return null;

      // Create a fix that removes the return type annotation
      return fixer.remove(returnType);
    }

    return {
      FunctionDeclaration(node) {
        if (!node.returnType) return;

        if (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node)) {
          return;
        }

        context.report({
          node: node.returnType,
          messageId: 'noExplicitReturnType',
          fix: fixer => fixReturnType(fixer, node),
        });
      },

      FunctionExpression(node) {
        if (!node.returnType) return;

        if (mergedOptions.allowRecursiveFunctions && isRecursiveFunction(node)) {
          return;
        }

        context.report({
          node: node.returnType,
          messageId: 'noExplicitReturnType',
          fix: fixer => fixReturnType(fixer, node),
        });
      },

      ArrowFunctionExpression(node) {
        if (!node.returnType) return;

        context.report({
          node: node.returnType,
          messageId: 'noExplicitReturnType',
          fix: fixer => fixReturnType(fixer, node),
        });
      },

      TSMethodSignature(node) {
        if (!node.returnType) return;

        if (mergedOptions.allowInterfaceMethodSignatures) {
          return;
        }

        if (mergedOptions.allowOverloadedFunctions && isOverloadedFunction(node)) {
          return;
        }

        context.report({
          node: node.returnType,
          messageId: 'noExplicitReturnType',
          fix: fixer => fixReturnType(fixer, node),
        });
      },

      MethodDefinition(node) {
        if (!node.value.returnType) return;

        if (mergedOptions.allowAbstractMethodSignatures && isInterfaceOrAbstractMethodSignature(node)) {
          return;
        }

        context.report({
          node: node.value.returnType,
          messageId: 'noExplicitReturnType',
          fix: fixer => fixReturnType(fixer, node),
        });
      },
    };
  },
});
