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
  const normalized = filename.replace(/\\/g, '/');
  return normalized.includes('functions/src/types/firestore');
};

const getRightmostIdentifierName = (
  name: TSESTree.TSQualifiedName | TSESTree.Identifier,
): string => {
  if (name.type === AST_NODE_TYPES.Identifier) {
    return name.name;
  }
  // Walk to the rightmost identifier in a qualified name: a.b.c -> c
  return getRightmostIdentifierName(name.right);
};

const isArrayGenericReference = (node: TSESTree.TSTypeReference): boolean => {
  return (
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    (node.typeName.name === 'Array' || node.typeName.name === 'ReadonlyArray')
  );
};

const isParenthesizedType = (
  node: TSESTree.TypeNode,
): node is TSESTree.TypeNode & {
  type: 'TSParenthesizedType';
  typeAnnotation: TSESTree.TypeNode;
} => {
  return (node as unknown as { type?: string }).type === 'TSParenthesizedType';
};

const unwrapArrayElementType = (node: TSESTree.TypeNode): TSESTree.TypeNode => {
  let current: TSESTree.TypeNode = node;
  // Unwrap TS[] syntax
  while (current.type === AST_NODE_TYPES.TSArrayType) {
    current = (current as TSESTree.TSArrayType).elementType;
  }
  // Unwrap readonly T[] (TSTypeOperator with operator 'readonly')
  while (
    current.type === AST_NODE_TYPES.TSTypeOperator &&
    (current as TSESTree.TSTypeOperator).operator === 'readonly'
  ) {
    current = (current as TSESTree.TSTypeOperator)
      .typeAnnotation as TSESTree.TypeNode;
  }
  // Unwrap parenthesized types: (T)
  while (isParenthesizedType(current)) {
    current = (current as unknown as { typeAnnotation: TSESTree.TypeNode })
      .typeAnnotation;
  }
  // Unwrap Array<T>/ReadonlyArray<T> syntax recursively
  while (
    current.type === AST_NODE_TYPES.TSTypeReference &&
    isArrayGenericReference(current as TSESTree.TSTypeReference) &&
    (current as TSESTree.TSTypeReference).typeParameters &&
    (current as TSESTree.TSTypeReference).typeParameters!.params.length > 0
  ) {
    current = (current as TSESTree.TSTypeReference).typeParameters!.params[0];
    while (current.type === AST_NODE_TYPES.TSArrayType) {
      current = (current as TSESTree.TSArrayType).elementType;
    }
    while (
      current.type === AST_NODE_TYPES.TSTypeOperator &&
      (current as TSESTree.TSTypeOperator).operator === 'readonly'
    ) {
      current = (current as TSESTree.TSTypeOperator)
        .typeAnnotation as TSESTree.TypeNode;
    }
    while (isParenthesizedType(current)) {
      current = (current as unknown as { typeAnnotation: TSESTree.TypeNode })
        .typeAnnotation;
    }
  }
  return current;
};

const isObjectType = (node: TSESTree.TypeNode): boolean => {
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      return true;
    default:
      if (isParenthesizedType(node)) {
        return isObjectType(
          (node as unknown as { typeAnnotation: TSESTree.TypeNode })
            .typeAnnotation,
        );
      }
      break;
  }
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeReference:
      if (node.typeName.type === AST_NODE_TYPES.Identifier) {
        const typeName = node.typeName.name;
        return !PRIMITIVE_TYPES.has(typeName);
      } else if (node.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        // Handle namespace.Type cases by checking the rightmost identifier
        const rightMost = getRightmostIdentifierName(node.typeName);
        return !PRIMITIVE_TYPES.has(rightMost);
      }
      return true;
    case AST_NODE_TYPES.TSIntersectionType:
    case AST_NODE_TYPES.TSUnionType:
      return node.types.some(isObjectType);
    case AST_NODE_TYPES.TSMappedType:
    case AST_NODE_TYPES.TSIndexedAccessType:
      return true;
    case AST_NODE_TYPES.TSAnyKeyword:
    case AST_NODE_TYPES.TSUnknownKeyword:
      // Be conservative: not enough information to assert object-ness
      return false;
    default:
      return false;
  }
};

const isImmediatelyWrappedByArraySyntax = (node: TSESTree.Node): boolean => {
  const parent = (node as unknown as TSESTree.Node).parent as
    | TSESTree.Node
    | undefined;
  if (!parent) return false;
  if (parent.type === AST_NODE_TYPES.TSArrayType) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.TSTypeOperator &&
    (parent as TSESTree.TSTypeOperator).operator === 'readonly'
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.TSTypeReference &&
    isArrayGenericReference(parent as TSESTree.TSTypeReference)
  ) {
    return true;
  }
  return false;
};

export const noFirestoreObjectArrays = createRule<[], MessageIds>({
  name: 'no-firestore-object-arrays',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arrays of objects in Firestore type definitions. Arrays of objects are not queryable, require full rewrites for single-item updates, and create concurrency risks. Prefer maps keyed by id (Record<string, T>) and persist order with an index field; convert with Array-Map utilities.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      noObjectArrays:
        'Arrays of objects are problematic in Firestore: not queryable, destructive updates, and concurrency risks. Prefer Record<string, T> keyed by id and include an index field for order (use toMap/toArr), or use subcollections/arrays of IDs where appropriate.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (!isInFirestoreTypesDirectory(context.getFilename())) {
      return {};
    }

    return {
      TSArrayType(node) {
        // Avoid duplicate reports only for direct array-of-array wrappers
        if (isImmediatelyWrappedByArraySyntax(node)) {
          return;
        }
        const base = unwrapArrayElementType(node.elementType);
        if (isObjectType(base)) {
          context.report({
            node,
            messageId: 'noObjectArrays',
          });
        }
      },
      TSTypeReference(node) {
        // Handle Array<T> and ReadonlyArray<T> syntax (and nested arrays through unwrap)
        if (
          node.typeName.type === AST_NODE_TYPES.Identifier &&
          (node.typeName.name === 'Array' ||
            node.typeName.name === 'ReadonlyArray') &&
          node.typeParameters
        ) {
          // Avoid duplicate reports only for direct array-of-array wrappers
          if (isImmediatelyWrappedByArraySyntax(node)) {
            return;
          }
          const elementType = node.typeParameters.params[0] ?? null;
          if (!elementType) return;
          const base = unwrapArrayElementType(elementType);
          if (isObjectType(base)) {
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
