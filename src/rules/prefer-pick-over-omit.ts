import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferPickOverOmit';

export const preferPickOverOmit = createRule<[], MessageIds>({
  name: 'prefer-pick-over-omit',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using Pick<T, K> instead of Omit<T, K> for type definitions',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferPickOverOmit: 'Prefer using Pick<T, K> over Omit<T, K> for better type safety and maintainability',
    },
  },
  defaultOptions: [],
  create(context) {
    function isIdentifierNode(node: TSESTree.Node): node is TSESTree.Identifier {
      return node.type === AST_NODE_TYPES.Identifier;
    }

    function isInGenericUtilityType(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (current.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          const params = current.typeParameters?.params || [];
          return params.length > 0;
        }
        current = current.parent;
      }
      return false;
    }

    function isHardcodedLiteralType(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.TSUnionType) {
        return node.types.every(type => type.type === AST_NODE_TYPES.TSLiteralType);
      }
      return node.type === AST_NODE_TYPES.TSLiteralType;
    }

    function checkOmitUsage(node: TSESTree.Node, typeName: TSESTree.Identifier, typeParameters: TSESTree.TSTypeParameterInstantiation | undefined) {
      if (typeName.name !== 'Omit') {
        return;
      }

      // Skip if used in generic utility type
      if (isInGenericUtilityType(node)) {
        return;
      }

      const typeArgs = typeParameters?.params;
      if (!typeArgs || typeArgs.length !== 2) {
        return;
      }

      // Only flag when the omitted keys are hardcoded literals
      if (!isHardcodedLiteralType(typeArgs[1])) {
        return;
      }

      const sourceCode = context.getSourceCode();
      const typeText = sourceCode.getText(typeArgs[0]);
      const keysText = sourceCode.getText(typeArgs[1]);

      // Parse the keys text to get omitted properties
      const keysMatch = keysText.match(/'([^']+)'|"([^"]+)"/g);
      if (!keysMatch) {
        return;
      }

      context.report({
        node,
        messageId: 'preferPickOverOmit',
        fix(fixer) {
          // Convert Omit to Pick by getting all properties and excluding the omitted ones
          return fixer.replaceText(
            node,
            `Pick<${typeText}, Exclude<keyof ${typeText}, ${keysText}>>`
          );
        },
      });
    }

    return {
      TSTypeReference(node: TSESTree.TSTypeReference) {
        if (isIdentifierNode(node.typeName)) {
          checkOmitUsage(node, node.typeName, node.typeParameters);
        }
      },
      TSInterfaceHeritage(node: TSESTree.Node) {
        const exprNode = node as { expression: TSESTree.Node; typeParameters?: TSESTree.TSTypeParameterInstantiation };
        if (exprNode.expression.type === AST_NODE_TYPES.Identifier) {
          checkOmitUsage(node, exprNode.expression, exprNode.typeParameters);
        }
      },
    };
  },
});
