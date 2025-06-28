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

// TypeScript utility types that typically operate on object types
const UTILITY_TYPES = new Set([
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'ReturnType',
  'InstanceType',
]);

// Type aliases that we know are string/number/boolean unions or enums
// This helps with custom types like ChannelGroupPermanence that are just string unions
const STRING_UNION_TYPES = new Set(['ChannelGroupPermanence', 'Status']);

const isInFirestoreTypesDirectory = (filename: string): boolean => {
  return filename.includes('functions/src/types/firestore');
};

// Enhanced version that can resolve local type definitions
const isObjectTypeWithContext = (
  node: TSESTree.TypeNode,
  localTypeDefinitions: Map<string, TSESTree.TypeNode>,
): boolean => {
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      // Object literal types like { id: string; name: string }
      return true;
    case AST_NODE_TYPES.TSTypeReference:
      if (node.typeName.type === AST_NODE_TYPES.Identifier) {
        const typeName = node.typeName.name;

        // Check known primitive and string union types first
        if (PRIMITIVE_TYPES.has(typeName) || STRING_UNION_TYPES.has(typeName)) {
          return false;
        }

        // Check if this is a utility type that typically operates on objects
        if (UTILITY_TYPES.has(typeName)) {
          return true;
        }

        // Check if this type is defined locally in the file
        const localDefinition = localTypeDefinitions.get(typeName);
        if (localDefinition) {
          return isObjectTypeWithContext(localDefinition, localTypeDefinitions);
        }

        // For unknown imported types, be permissive to avoid false positives
        return false;
      } else if (node.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        // Handle namespace.Type cases - these are likely object types
        return true;
      }
      return false;
    case AST_NODE_TYPES.TSIntersectionType:
      // Intersection types are typically object types
      return true;
    case AST_NODE_TYPES.TSUnionType:
      // Union types are objects if ANY member is an object
      // This is more conservative but catches mixed unions like { id: string } | string
      return node.types.some((type) =>
        isObjectTypeWithContext(type, localTypeDefinitions),
      );
    case AST_NODE_TYPES.TSMappedType:
    case AST_NODE_TYPES.TSIndexedAccessType:
      // These are typically object types
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
      // For unknown types, be permissive to avoid false positives
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

    // Collect type definitions in the current file to help identify object types
    const localTypeDefinitions = new Map<string, TSESTree.TypeNode>();

    return {
      // Collect type alias definitions
      TSTypeAliasDeclaration(node) {
        localTypeDefinitions.set(node.id.name, node.typeAnnotation);
      },

      // Collect interface definitions
      TSInterfaceDeclaration(node) {
        // Create a synthetic type literal node for interfaces
        const typeLiteral: TSESTree.TSTypeLiteral = {
          type: AST_NODE_TYPES.TSTypeLiteral,
          members: node.body.body,
          range: node.range,
          loc: node.loc,
          parent: node.parent,
        };
        localTypeDefinitions.set(node.id.name, typeLiteral);
      },

      TSArrayType(node) {
        if (isObjectTypeWithContext(node.elementType, localTypeDefinitions)) {
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
          if (isObjectTypeWithContext(elementType, localTypeDefinitions)) {
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
