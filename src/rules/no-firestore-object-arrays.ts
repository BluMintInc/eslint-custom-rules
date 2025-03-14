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

// Type aliases that we know are string/number/boolean unions or enums
// This helps with custom types like ChannelGroupPermanence that are just string unions
const STRING_UNION_TYPES = new Set([
  'ChannelGroupPermanence',
  'Status',
]);

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  return filename.includes('functions/src/types/firestore');
};

// Check if a type is a primitive or a union of primitives
const isObjectType = (node: TSESTree.TypeNode): boolean => {
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      return true;
    case AST_NODE_TYPES.TSTypeReference:
      if (node.typeName.type === AST_NODE_TYPES.Identifier) {
        const typeName = node.typeName.name;
        // Check if it's a known primitive type or a known string union type
        return !PRIMITIVE_TYPES.has(typeName) && !STRING_UNION_TYPES.has(typeName);
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
    case AST_NODE_TYPES.TSLiteralType:
      // String, number, boolean literals are not objects
      return false;
    case AST_NODE_TYPES.TSStringKeyword:
    case AST_NODE_TYPES.TSNumberKeyword:
    case AST_NODE_TYPES.TSBooleanKeyword:
    case AST_NODE_TYPES.TSNullKeyword:
    case AST_NODE_TYPES.TSUndefinedKeyword:
      // Primitive types are not objects
      return false;
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
        'Disallow arrays of objects in Firestore type definitions to optimize performance and avoid unnecessary fetches',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      noObjectArrays:
        'Arrays of objects are not recommended in Firestore. Use subcollections, arrays of IDs, or structured maps (Record<string, T>) instead.',
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
