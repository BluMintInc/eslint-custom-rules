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
        'Disallow arrays of objects in Firestore type definitions. Arrays of objects are not queryable in Firestore, require destructive updates (rewriting entire arrays), and cause concurrency issues with race conditions. Instead, use Record<string, T & { index: number }> map structures where the object id becomes the key and an index field preserves ordering. This enables efficient querying, individual item updates, safe concurrent access, and seamless conversion between arrays and maps using toMap()/toArr() utilities.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      noObjectArrays:
        'Arrays of objects should not be used in Firestore types. Problem: Arrays of objects are not queryable, updates require rewriting the entire array (destructive), and concurrent updates cause race conditions and data loss. Solution: Use Record<string, T & { index: number }> instead, where the object\'s id becomes the key and an index field preserves order. This enables efficient querying, individual item updates, and safe concurrent access. Use toMap() to convert arrays to indexed maps and toArr() to convert back to ordered arrays. Example: Instead of "items: Item[]", use "items: Record<string, Item & { index: number }>". See Array-Map Conversion system documentation.',
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
