import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingGeneric' | 'invalidGeneric';

export const enforceFirestoreDocRefGeneric = createRule<[], MessageIds>({
  name: 'enforce-firestore-doc-ref-generic',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce generic argument for Firestore DocumentReference',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingGeneric: 'DocumentReference must specify a generic type argument',
      invalidGeneric: 'DocumentReference must not use "any" or "{}" as generic type argument',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSTypeReference(node: TSESTree.TSTypeReference): void {
        if (
          node.typeName.type === AST_NODE_TYPES.Identifier &&
          node.typeName.name === 'DocumentReference'
        ) {
          // Check if generic type argument is missing
          if (!node.typeParameters || node.typeParameters.params.length === 0) {
            context.report({
              node,
              messageId: 'missingGeneric',
            });
            return;
          }

          // Check for invalid generic type arguments (any or {})
          const typeArg = node.typeParameters.params[0];
          if (
            (typeArg.type === AST_NODE_TYPES.TSAnyKeyword) ||
            (typeArg.type === AST_NODE_TYPES.TSTypeLiteral && (!typeArg.members || typeArg.members.length === 0))
          ) {
            context.report({
              node,
              messageId: 'invalidGeneric',
            });
          }
        }
      },
    };
  },
});
