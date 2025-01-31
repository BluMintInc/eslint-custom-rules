import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noObjectArrays';

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  return filename.includes('functions/src/types/firestore');
};

const isObjectType = (node: TSESTree.TypeNode): boolean => {
  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TSTypeReference) {
    // Check if it's not a primitive type
    const typeName = (node.typeName as TSESTree.Identifier).name;
    return !['string', 'number', 'boolean', 'Date', 'null', 'undefined'].includes(typeName);
  }
  return false;
};

export const noFirestoreObjectArrays = createRule<[], MessageIds>({
  name: 'no-firestore-object-arrays',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow arrays of objects in Firestore type definitions',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noObjectArrays: 'Arrays of objects are not recommended in Firestore. Use subcollections, primitive arrays, or maps instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isInFirestoreTypesDirectory(context.getFilename())) {
      return {};
    }

    return {
      TSArrayType(node) {
        if (isObjectType(node.elementType)) {
          context.report({
            node,
            messageId: 'noObjectArrays',
          });
        }
      },
    };
  },
});
