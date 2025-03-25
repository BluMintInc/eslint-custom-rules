import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noObjectArrays';

const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'Date',
  'Timestamp',
  'null',
  'undefined',
  'GeoPoint',
]);

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  return filename.includes('functions/src/types/firestore');
};

const isObjectType = (node: TSESTree.TypeNode): boolean => {
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      return true;
    case AST_NODE_TYPES.TSTypeReference:
      if (node.typeName.type === AST_NODE_TYPES.Identifier) {
        const typeName = node.typeName.name;
        return !PRIMITIVE_TYPES.has(typeName);
      } else if (node.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        // Handle namespace.Type cases
        return true;
      }
      return true;
    case AST_NODE_TYPES.TSIntersectionType:
    case AST_NODE_TYPES.TSUnionType:
      return node.types.some(isObjectType);
    case AST_NODE_TYPES.TSMappedType:
    case AST_NODE_TYPES.TSIndexedAccessType:
      return true;
    default:
      return false;
  }
};

export const noFirestoreObjectArrays = createRule<[], MessageIds>({
  name: 'no-firestore-object-arrays',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arrays of objects in Firestore type definitions to optimize performance, enable querying, prevent destructive updates, and avoid concurrency issues. Use map structures with index fields instead.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      noObjectArrays:
        'Arrays of objects are not recommended in Firestore because they are not queryable, updates are destructive, and they can cause concurrency issues. Instead, use a map structure (Record<string, T>) with an index field to preserve ordering. This pattern enables individual item updates, efficient querying, and maintains order when converting back to arrays. See documentation for the Array-Map Conversion system.',
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
      TSTypeReference(node) {
        // Handle Array<T> and ReadonlyArray<T> syntax
        const typeName = (node.typeName as TSESTree.Identifier).name;
        if (
          (typeName === 'Array' || typeName === 'ReadonlyArray') &&
          node.typeParameters
        ) {
          const elementType = node.typeParameters.params[0];
          if (isObjectType(elementType)) {
            context.report({
              node,
              messageId: 'noObjectArrays',
            });
          }
        }
      },
    };
  },
});
