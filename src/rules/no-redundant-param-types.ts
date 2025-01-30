import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantParamType';

export const noRedundantParamTypes = createRule<[], MessageIds>({
  name: 'no-redundant-param-types',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow redundant parameter type annotations in arrow functions when assigned to typed variables',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantParamType: 'Redundant parameter type annotation. The type is already inferred from the variable declaration.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Only process variable declarations with type annotations
        if (
          !node.id ||
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !node.id.typeAnnotation ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          return;
        }

        const arrowFunction = node.init;
        const typeAnnotation = node.id.typeAnnotation;

        // Skip if the variable type is not a function type
        if (
          typeAnnotation.typeAnnotation.type !== AST_NODE_TYPES.TSFunctionType &&
          typeAnnotation.typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference
        ) {
          return;
        }

        // Check each parameter for redundant type annotations
        arrowFunction.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                if (!param.typeAnnotation?.range) return null;
                const typeStart = param.typeAnnotation.range[0];
                const typeEnd = param.typeAnnotation.range[1];

                // Remove the type annotation
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          }
        });
      },
    };
  },
});
