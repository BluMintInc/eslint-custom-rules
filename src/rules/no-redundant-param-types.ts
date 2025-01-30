import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantParamType';

type ParamNode =
  | TSESTree.Identifier
  | TSESTree.RestElement
  | TSESTree.ObjectPattern
  | TSESTree.ArrayPattern
  | TSESTree.AssignmentPattern;

function isIdentifierWithTypeAnnotation(
  node: ParamNode,
): node is TSESTree.Identifier & { typeAnnotation: TSESTree.TSTypeAnnotation } {
  return (
    node.type === AST_NODE_TYPES.Identifier && node.typeAnnotation !== undefined
  );
}

function isRestElementWithTypeAnnotation(
  node: ParamNode,
): node is TSESTree.RestElement & {
  typeAnnotation: TSESTree.TSTypeAnnotation;
} {
  return (
    node.type === AST_NODE_TYPES.RestElement &&
    node.typeAnnotation !== undefined
  );
}

function isObjectPatternWithTypeAnnotation(
  node: ParamNode,
): node is TSESTree.ObjectPattern & {
  typeAnnotation: TSESTree.TSTypeAnnotation;
} {
  return (
    node.type === AST_NODE_TYPES.ObjectPattern &&
    node.typeAnnotation !== undefined
  );
}

function isArrayPatternWithTypeAnnotation(
  node: ParamNode,
): node is TSESTree.ArrayPattern & {
  typeAnnotation: TSESTree.TSTypeAnnotation;
} {
  return (
    node.type === AST_NODE_TYPES.ArrayPattern &&
    node.typeAnnotation !== undefined
  );
}

function isAssignmentPatternWithTypeAnnotation(
  node: ParamNode,
): node is TSESTree.AssignmentPattern & {
  left: TSESTree.Identifier & { typeAnnotation: TSESTree.TSTypeAnnotation };
} {
  return (
    node.type === AST_NODE_TYPES.AssignmentPattern &&
    node.left.type === AST_NODE_TYPES.Identifier &&
    node.left.typeAnnotation !== undefined
  );
}

function hasRedundantTypeAnnotation(
  node: TSESTree.ArrowFunctionExpression,
): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Check variable declarations
  if (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  // Check class property assignments
  if (
    parent.type === AST_NODE_TYPES.PropertyDefinition &&
    parent.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  // Check assignments
  if (
    parent.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier &&
    parent.left.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation
  ) {
    return true;
  }

  return false;
}

export const noRedundantParamTypes = createRule<[], MessageIds>({
  name: 'no-redundant-param-types',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow redundant parameter type annotations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantParamType: 'Parameter type annotation is redundant',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        if (!hasRedundantTypeAnnotation(node)) return;

        const params = node.params as ParamNode[];

        params.forEach((param) => {
          if (isIdentifierWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                const typeStart = param.typeAnnotation.range[0];
                const typeEnd = param.typeAnnotation.range[1];
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          } else if (isRestElementWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                const typeStart = param.typeAnnotation.range[0];
                const typeEnd = param.typeAnnotation.range[1];
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          } else if (isObjectPatternWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                const typeStart = param.typeAnnotation.range[0];
                const typeEnd = param.typeAnnotation.range[1];
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          } else if (isArrayPatternWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                const typeStart = param.typeAnnotation.range[0];
                const typeEnd = param.typeAnnotation.range[1];
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          } else if (isAssignmentPatternWithTypeAnnotation(param)) {
            const { left } = param;
            context.report({
              node: param,
              messageId: 'redundantParamType',
              fix(fixer) {
                const typeStart = left.typeAnnotation.range[0];
                const typeEnd = left.typeAnnotation.range[1];
                return fixer.removeRange([typeStart, typeEnd]);
              },
            });
          }
        });
      },
    };
  },
});
