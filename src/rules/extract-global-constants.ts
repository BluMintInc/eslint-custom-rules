import { ASTHelpers } from '../utils/ASTHelpers';
import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

function isReactComponent(node: TSESTree.Node): boolean {
  if (node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression') {
    // Check if function name starts with uppercase (React component convention)
    const funcName = node.type === 'FunctionDeclaration' 
      ? node.id?.name 
      : node.parent?.type === 'VariableDeclarator' 
        ? (node.parent.id as TSESTree.Identifier)?.name 
        : undefined;
    
    if (funcName && /^[A-Z]/.test(funcName)) {
      return true;
    }

    // Check if function returns JSX
    const body = node.type === 'FunctionDeclaration' ? node.body : node.body;
    if (body.type === 'BlockStatement') {
      const returnStmt = body.body.find(stmt => stmt.type === 'ReturnStatement') as TSESTree.ReturnStatement | undefined;
      if (returnStmt?.argument?.type === 'JSXElement' || returnStmt?.argument?.type === 'JSXFragment') {
        return true;
      }
    } else if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
      return true;
    }
  }
  return false;
}

function isReactHook(node: TSESTree.Node): boolean {
  if (node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression') {
    const funcName = node.type === 'FunctionDeclaration' 
      ? node.id?.name 
      : node.parent?.type === 'VariableDeclarator' 
        ? (node.parent.id as TSESTree.Identifier)?.name 
        : undefined;
    return !!funcName && /^use[A-Z]/.test(funcName);
  }
  return false;
}

function isInsideReactComponentOrHook(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current) {
    if (current.type === 'FunctionDeclaration' || current.type === 'ArrowFunctionExpression') {
      if (isReactComponent(current) || isReactHook(current)) {
        return true;
      }
    }
    current = current.parent as TSESTree.Node;
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

        // Skip if inside a React component or hook
        if (isInsideReactComponentOrHook(node)) {
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
          (scope.type === 'function' || scope.type === 'block')
        ) {
          // Report the issue
          const constName = (node.declarations[0].id as TSESTree.Identifier).name;
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
        // Skip if the function is a React component or hook
        if (isReactComponent(node) || isReactHook(node)) {
          return;
        }

        // Skip if inside a React component or hook
        if (isInsideReactComponentOrHook(node)) {
          return;
        }

        if (
          node.parent &&
          (node.parent.type === 'FunctionDeclaration' ||
            node.parent.type === 'FunctionExpression' ||
            node.parent.type === 'ArrowFunctionExpression')
        ) {
          const scope = context.getScope();
          const hasDependencies = ASTHelpers.blockIncludesIdentifier(node.body);
          if (!hasDependencies && scope.type === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const funcName = (node.id as any).name;
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
        'Extract constants/functions to the global scope when possible',
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
