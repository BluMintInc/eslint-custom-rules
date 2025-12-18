import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
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

function removeTypeAnnotation(
  fixer: TSESLint.RuleFixer,
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: { getText(): string },
): TSESLint.RuleFix {
  const typeStart = typeAnnotation.range[0];
  const typeEnd = typeAnnotation.range[1];

  // Check if there's a question mark before the type annotation
  const hasQuestionMark =
    typeStart > 0 && sourceCode.getText().charAt(typeStart - 1) === '?';
  const startPos = hasQuestionMark ? typeStart - 1 : typeStart;

  return fixer.removeRange([startPos, typeEnd]);
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
      redundantParamType:
        'Parameter "{{paramText}}" repeats a type that the contextual function type already provides. Duplicate annotations drift out of sync and obscure the single source of truth for the signature. Remove the inline parameter annotation and rely on the variable or property type so the function stays aligned.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        if (!hasRedundantTypeAnnotation(node)) return;

        const params = node.params as ParamNode[];
        const sourceCode = context.getSourceCode();

        params.forEach((param) => {
          const paramText = sourceCode
            .getText(param)
            .replace(/\s+/g, ' ')
            .trim();
          if (isIdentifierWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              data: { paramText },
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  param.typeAnnotation,
                  sourceCode,
                );
              },
            });
          } else if (isRestElementWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              data: { paramText },
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  param.typeAnnotation,
                  sourceCode,
                );
              },
            });
          } else if (isObjectPatternWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              data: { paramText },
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  param.typeAnnotation,
                  sourceCode,
                );
              },
            });
          } else if (isArrayPatternWithTypeAnnotation(param)) {
            context.report({
              node: param,
              messageId: 'redundantParamType',
              data: { paramText },
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  param.typeAnnotation,
                  sourceCode,
                );
              },
            });
          } else if (isAssignmentPatternWithTypeAnnotation(param)) {
            const { left } = param;
            context.report({
              node: param,
              messageId: 'redundantParamType',
              data: { paramText },
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  left.typeAnnotation,
                  sourceCode,
                );
              },
            });
          }
        });
      },
    };
  },
});
