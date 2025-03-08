import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const enforceObjectLiteralAsConst = createRule({
  name: 'enforce-object-literal-as-const',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that object literals returned from functions should be marked with `as const` to ensure type safety and immutability.',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      enforceAsConst:
        'Object literals returned from functions should be marked with `as const` to ensure type safety and immutability',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if the node is inside a React hook like useMemo
     */
    function isInsideReactHook(ancestors: TSESTree.Node[]): boolean {
      for (let i = 0; i < ancestors.length; i++) {
        const ancestor = ancestors[i];

        // Check for CallExpression (function call)
        if (ancestor.type === 'CallExpression') {
          const callee = ancestor.callee;

          // Check if it's a hook like useMemo, useCallback, etc.
          if (
            callee.type === 'Identifier' &&
            (callee.name === 'useMemo' ||
              callee.name === 'useCallback' ||
              callee.name.startsWith('use'))
          ) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * Checks if an array contains object literals that might be used as component props
     */
    function isArrayWithObjectLiterals(node: TSESTree.Node): boolean {
      if (node.type !== 'ArrayExpression') {
        return false;
      }

      // Check if any element in the array is an object literal
      return node.elements.some(
        (elem) => elem !== null && elem.type === 'ObjectExpression',
      );
    }

    return {
      ReturnStatement(node) {
        // Skip if there's no argument in the return statement
        if (!node.argument) {
          return;
        }

        // Check if the return statement is inside a function
        const sourceCode = context.getSourceCode();
        // Use context.getAncestors() for now, but note it's deprecated
        // We'll need to update this when upgrading to ESLint v9
        const ancestors = context.getAncestors();
        const isInFunction = ancestors.some(
          (ancestor) =>
            ancestor.type === 'FunctionDeclaration' ||
            ancestor.type === 'ArrowFunctionExpression' ||
            ancestor.type === 'FunctionExpression' ||
            ancestor.type === 'MethodDefinition',
        );

        if (!isInFunction) {
          return;
        }

        // Check if the return value is an object or array literal
        const { argument } = node;

        // Skip if the return value already has 'as const' assertion
        if (argument.type === 'TSAsExpression') {
          const tsAsExpression = argument as TSESTree.TSAsExpression;

          // Check if the type annotation is 'const'
          if (
            tsAsExpression.typeAnnotation.type === 'TSTypeReference' &&
            tsAsExpression.typeAnnotation.typeName.type === 'Identifier' &&
            tsAsExpression.typeAnnotation.typeName.name === 'const'
          ) {
            return;
          }

          // If it has another type assertion but not 'as const', we still need to check
          // if the expression is an object/array literal
          if (
            tsAsExpression.expression.type !== 'ObjectExpression' &&
            tsAsExpression.expression.type !== 'ArrayExpression'
          ) {
            return;
          }
        } else if (
          argument.type !== 'ObjectExpression' &&
          argument.type !== 'ArrayExpression'
        ) {
          // Skip if not an object/array literal and not a type assertion
          return;
        }

        // Skip if the return value uses spread operator
        if (
          (argument.type === 'ObjectExpression' &&
            argument.properties.some(
              (prop) => prop.type === 'SpreadElement',
            )) ||
          (argument.type === 'ArrayExpression' &&
            argument.elements.some(
              (elem) => elem !== null && elem.type === 'SpreadElement',
            ))
        ) {
          return;
        }

        // Skip arrays with object literals inside React hooks (likely component props)
        if (
          isInsideReactHook(ancestors) &&
          isArrayWithObjectLiterals(
            argument.type === 'TSAsExpression'
              ? (argument as TSESTree.TSAsExpression).expression
              : argument,
          )
        ) {
          return;
        }

        // Report the issue and provide a fix
        context.report({
          node,
          messageId: 'enforceAsConst',
          fix(fixer) {
            const text = sourceCode.getText(argument);

            // If it's already a type assertion but not 'as const'
            if (argument.type === 'TSAsExpression') {
              // Get the expression part (before the 'as')
              const expressionText = sourceCode.getText(
                (argument as TSESTree.TSAsExpression).expression,
              );
              return fixer.replaceText(argument, `${expressionText} as const`);
            }

            return fixer.replaceText(argument, `${text} as const`);
          },
        });
      },
    };
  },
});
