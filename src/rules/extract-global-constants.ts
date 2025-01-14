import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

function isInsideFunction(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return true;
    }
    current = current.parent as TSESTree.Node;
  }
  return false;
}

function isFunctionDefinition(node: TSESTree.Expression | null): boolean {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function isMutableValue(node: TSESTree.Expression | null): boolean {
  if (!node) return false;

  // Check for array literals and object expressions
  if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression') {
    return true;
  }

  // Check for new expressions (e.g., new Map(), new Set())
  if (node.type === 'NewExpression') {
    return true;
  }

  // Check for array/object methods that return mutable values
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee.type === 'MemberExpression') {
      const methodName = (callee.property as TSESTree.Identifier).name;
      const mutatingMethods = ['slice', 'map', 'filter', 'concat', 'from'];
      return mutatingMethods.includes(methodName);
    }
  }

  return false;
}

export const extractGlobalConstants: TSESLint.RuleModule<
  'extractGlobalConstants',
  never[]
> = createRule({
  create(context) {
    return {
      VariableDeclaration(node: TSESTree.VariableDeclaration) {
        if (node.kind !== 'const') {
          return;
        }

        // Skip if any of the declarations are function definitions or mutable values
        if (node.declarations.some((d) => isFunctionDefinition(d.init) || isMutableValue(d.init))) {
          return;
        }

        const scope = context.getScope();
        const hasDependencies = node.declarations.some(
          (declaration) =>
            declaration.init &&
            ASTHelpers.declarationIncludesIdentifier(declaration.init),
        );

        // Only check function/block scoped constants without dependencies
        if (
          !hasDependencies &&
          (scope.type === 'function' || scope.type === 'block') &&
          isInsideFunction(node)
        ) {
          const constName = (node.declarations[0].id as TSESTree.Identifier)
            .name;
          context.report({
            node,
            messageId: 'extractGlobalConstants',
            data: {
              declarationName: constName,
            },
          });
        }
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (
          node.parent &&
          (node.parent.type === 'FunctionDeclaration' ||
            node.parent.type === 'FunctionExpression' ||
            node.parent.type === 'ArrowFunctionExpression')
        ) {
          const scope = context.getScope();
          const hasDependencies = ASTHelpers.blockIncludesIdentifier(node.body);
          if (!hasDependencies && scope.type === 'function') {
            const funcName = node.id?.name;
            context.report({
              node,
              messageId: 'extractGlobalConstants',
              data: {
                declarationName: funcName,
              },
            });
          }
        }
      },
    };
  },

  name: 'extract-global-constants',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Extract static constants and functions to the global scope when possible',
      recommended: 'error',
    },
    schema: [],
    messages: {
      extractGlobalConstants:
        'Move this declaration {{ declarationName }} to the global scope and rename it to UPPER_SNAKE_CASE if necessary.',
    },
  },
  defaultOptions: [],
});
