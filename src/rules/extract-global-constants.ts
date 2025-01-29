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

function isImmutableValue(node: TSESTree.Expression | null): boolean {
  if (!node) return false;

  switch (node.type) {
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return isImmutableValue(node.argument);
    case 'BinaryExpression':
      if (node.left.type === 'PrivateIdentifier') return false;
      return isImmutableValue(node.left) && isImmutableValue(node.right);
    default:
      return false;
  }
}

function isMutableValue(node: TSESTree.Expression | null): boolean {
  if (!node) return false;

  // Check for object expressions (always mutable)
  if (node.type === 'ObjectExpression') {
    return true;
  }

  // Check array literals - mutable if empty or if they contain mutable values
  if (node.type === 'ArrayExpression') {
    // Empty arrays are mutable since they can be modified later
    if (node.elements.length === 0) return true;
    // Arrays with spread elements are mutable
    if (node.elements.some(element => !element || element.type === 'SpreadElement')) return true;
    // Arrays with non-immutable values are mutable
    return node.elements.some(element => !isImmutableValue(element as TSESTree.Expression));
  }

  // Check for new expressions (e.g., new Map(), new Set())
  if (node.type === 'NewExpression') {
    return true;
  }

  // Check for array/object methods that return mutable values
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee.type === 'MemberExpression') {
      // Handle both Identifier and non-Identifier property nodes
      if (callee.property.type !== 'Identifier') {
        return false;
      }
      const methodName = callee.property.name;
      const mutatingMethods = [
        'slice',
        'map',
        'filter',
        'concat',
        'from',
        'reduce',
        'flatMap',
        'splice',
        'reverse',
        'sort',
        'fill'
      ];
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
