import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useExplicitType' | 'defineTypeFirst';

export const enforceConstantTypeDeclarations = createRule<[], MessageIds>({
  name: 'enforce-constant-type-declarations',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce proper type declarations for global constants instead of using typeof on constants directly',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useExplicitType:
        'Use explicit type declarations instead of typeof on constants. Define the type first, then use it for the constant.',
      defineTypeFirst:
        'Define explicit types for constants instead of using typeof. Consider creating a type alias first.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track constants defined in the current file
    const localConstants = new Set<string>();

    // Helper function to check if a node is a typeof query on a local constant
    function isTypeofLocalConstant(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.TSTypeQuery) {
        return false;
      }

      if (node.exprName.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }

      return localConstants.has(node.exprName.name);
    }

    // Helper function to recursively check if a type contains typeof queries on local constants
    function containsTypeofLocalConstant(
      node: TSESTree.TSTypeAnnotation | TSESTree.Node,
    ): boolean {
      const typeNode =
        node.type === AST_NODE_TYPES.TSTypeAnnotation
          ? node.typeAnnotation
          : node;

      if (isTypeofLocalConstant(typeNode)) {
        return true;
      }

      if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
        return typeNode.types.some((type) => containsTypeofLocalConstant(type));
      }

      if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
        return typeNode.types.some((type) => containsTypeofLocalConstant(type));
      }

      // Check object type properties
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.some((member) => {
          if (
            member.type === AST_NODE_TYPES.TSPropertySignature &&
            member.typeAnnotation
          ) {
            return containsTypeofLocalConstant(member.typeAnnotation);
          }
          return false;
        });
      }

      // Check conditional types
      if (typeNode.type === AST_NODE_TYPES.TSConditionalType) {
        return (
          containsTypeofLocalConstant(typeNode.checkType) ||
          containsTypeofLocalConstant(typeNode.extendsType) ||
          containsTypeofLocalConstant(typeNode.trueType) ||
          containsTypeofLocalConstant(typeNode.falseType)
        );
      }

      return false;
    }

    return {
      // Track variable declarations to identify local constants and check type annotations
      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.init &&
          // Check if it's a const declaration
          node.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
          node.parent.kind === 'const'
        ) {
          // Check if it has 'as const' assertion or is a literal
          let hasAsConst = false;
          const currentNode = node.init;

          if (currentNode.type === AST_NODE_TYPES.TSAsExpression) {
            hasAsConst =
              currentNode.typeAnnotation.type ===
                AST_NODE_TYPES.TSTypeReference &&
              currentNode.typeAnnotation.typeName.type ===
                AST_NODE_TYPES.Identifier &&
              currentNode.typeAnnotation.typeName.name === 'const';
          }

          // Only consider it a constant if it has 'as const' assertion
          // This ensures we only flag constants that are explicitly marked as const
          // and have specific literal types that developers want to reuse
          if (hasAsConst) {
            localConstants.add(node.id.name);
          }
        }

        // Check variable declarations with type annotations
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.id.typeAnnotation &&
          containsTypeofLocalConstant(node.id.typeAnnotation)
        ) {
          context.report({
            node: node.id,
            messageId: 'useExplicitType',
          });
        }
      },

      // Check type alias declarations
      TSTypeAliasDeclaration(node) {
        if (containsTypeofLocalConstant(node.typeAnnotation)) {
          context.report({
            node,
            messageId: 'defineTypeFirst',
          });
        }
      },

      // Check function parameters
      FunctionDeclaration(node) {
        node.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            if (containsTypeofLocalConstant(param.typeAnnotation)) {
              context.report({
                node: param,
                messageId: 'useExplicitType',
              });
            }
          }
        });
      },

      // Check arrow function parameters
      ArrowFunctionExpression(node) {
        node.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            if (containsTypeofLocalConstant(param.typeAnnotation)) {
              context.report({
                node: param,
                messageId: 'useExplicitType',
              });
            }
          }
        });
      },

      // Check function expression parameters
      FunctionExpression(node) {
        node.params.forEach((param) => {
          if (
            param.type === AST_NODE_TYPES.Identifier &&
            param.typeAnnotation
          ) {
            if (containsTypeofLocalConstant(param.typeAnnotation)) {
              context.report({
                node: param,
                messageId: 'useExplicitType',
              });
            }
          }
        });
      },
    };
  },
});
