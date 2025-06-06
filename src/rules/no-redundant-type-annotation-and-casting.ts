import { AST_NODE_TYPES, TSESTree, TSESLint } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'redundantTypeAnnotationAndCasting';

function areTypesEqual(
  typeAnnotation: TSESTree.TSTypeAnnotation,
  typeAssertion: TSESTree.TSTypeAssertion | TSESTree.TSAsExpression,
  sourceCode: TSESLint.SourceCode,
): boolean {
  // Get the type annotation text (excluding the colon)
  const annotationText = sourceCode
    .getText(typeAnnotation.typeAnnotation)
    .trim();

  // Get the type assertion text
  let assertionText: string;
  if (typeAssertion.type === AST_NODE_TYPES.TSTypeAssertion) {
    assertionText = sourceCode.getText(typeAssertion.typeAnnotation).trim();
  } else {
    // TSAsExpression
    assertionText = sourceCode.getText(typeAssertion.typeAnnotation).trim();
  }

  // Simple text comparison for now - this could be enhanced to handle
  // more complex type comparisons and alias resolution
  return annotationText === assertionText;
}

function hasTypeAssertion(
  node: TSESTree.Expression,
): node is TSESTree.TSTypeAssertion | TSESTree.TSAsExpression {
  return (
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSAsExpression
  );
}

function findTypeAssertion(
  node: TSESTree.Expression,
): TSESTree.TSTypeAssertion | TSESTree.TSAsExpression | null {
  // Direct type assertion
  if (hasTypeAssertion(node)) {
    return node;
  }

  // Check for type assertion in parentheses
  if (node.type === AST_NODE_TYPES.SequenceExpression && node.expressions.length === 1) {
    return findTypeAssertion(node.expressions[0]);
  }

  // Check for type assertion in call expressions (like method calls)
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return findTypeAssertion(node.callee);
  }

  // Check for type assertion in member expressions
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return findTypeAssertion(node.object);
  }

  return null;
}

function removeTypeAnnotation(
  fixer: TSESLint.RuleFixer,
  typeAnnotation: TSESTree.TSTypeAnnotation,
  sourceCode: TSESLint.SourceCode,
): TSESLint.RuleFix {
  const typeStart = typeAnnotation.range[0];
  const typeEnd = typeAnnotation.range[1];

  // Check if there's a question mark before the type annotation (optional property)
  const hasQuestionMark =
    typeStart > 0 && sourceCode.getText().charAt(typeStart - 1) === '?';
  const startPos = hasQuestionMark ? typeStart - 1 : typeStart;

  return fixer.removeRange([startPos, typeEnd]);
}

export const noRedundantTypeAnnotationAndCasting = createRule<[], MessageIds>({
  name: 'no-redundant-type-annotation-and-casting',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow redundant type annotation and casting to the same type',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      redundantTypeAnnotationAndCasting:
        'Redundant type annotation and casting to the same type. Remove the type annotation.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      VariableDeclarator(node) {
        // Check if the variable has a type annotation
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.id.typeAnnotation &&
          node.init
        ) {
          const typeAssertion = findTypeAssertion(node.init);
          if (
            typeAssertion &&
            areTypesEqual(node.id.typeAnnotation, typeAssertion, sourceCode)
          ) {
            context.report({
              node: node.id,
              messageId: 'redundantTypeAnnotationAndCasting',
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  node.id.typeAnnotation!,
                  sourceCode,
                );
              },
            });
          }
        }
      },

      PropertyDefinition(node) {
        // Check class property definitions
        if (
          node.key.type === AST_NODE_TYPES.Identifier &&
          node.typeAnnotation &&
          node.value
        ) {
          const typeAssertion = findTypeAssertion(node.value);
          if (
            typeAssertion &&
            areTypesEqual(node.typeAnnotation, typeAssertion, sourceCode)
          ) {
            context.report({
              node: node.key,
              messageId: 'redundantTypeAnnotationAndCasting',
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  node.typeAnnotation!,
                  sourceCode,
                );
              },
            });
          }
        }
      },

      AssignmentExpression(node) {
        // Check assignment expressions
        if (
          node.left.type === AST_NODE_TYPES.Identifier &&
          node.left.typeAnnotation
        ) {
          const typeAssertion = findTypeAssertion(node.right);
          if (
            typeAssertion &&
            areTypesEqual(node.left.typeAnnotation, typeAssertion, sourceCode)
          ) {
            context.report({
              node: node.left,
              messageId: 'redundantTypeAnnotationAndCasting',
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  (node.left as TSESTree.Identifier).typeAnnotation!,
                  sourceCode,
                );
              },
            });
          }
        }
      },

      ArrowFunctionExpression(node) {
        // Check arrow function return types - only for simple expression bodies
        if (node.returnType && node.body.type !== AST_NODE_TYPES.BlockStatement) {
          // Expression body
          const typeAssertion = findTypeAssertion(node.body);
          if (
            typeAssertion &&
            areTypesEqual(node.returnType, typeAssertion, sourceCode)
          ) {
            context.report({
              node,
              messageId: 'redundantTypeAnnotationAndCasting',
              fix(fixer) {
                return removeTypeAnnotation(
                  fixer,
                  node.returnType!,
                  sourceCode,
                );
              },
            });
          }
        }
      },
    };
  },
});
