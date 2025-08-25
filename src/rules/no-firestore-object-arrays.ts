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
  // Match typical monorepo layouts
  return normalized.includes('/types/firestore');
};

const getRightmostIdentifierName = (
  name: TSESTree.TSQualifiedName | TSESTree.Identifier,
): string => {
  if (name.type === AST_NODE_TYPES.Identifier) {
    return name.name;
  }
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
): node is TSESTree.TypeNode & { typeAnnotation: TSESTree.TypeNode } => {
  // Use enum if available; fall back to string check for compatibility
  return (
    (AST_NODE_TYPES as any).TSParenthesizedType
      ? node.type === (AST_NODE_TYPES as any).TSParenthesizedType
      : (node as unknown as { type?: string }).type === 'TSParenthesizedType'
  );
};

const unwrapArrayElementType = (node: TSESTree.TypeNode): TSESTree.TypeNode => {
  let current: TSESTree.TypeNode = node;
  // Fixpoint loop: peel wrappers in any order until none remain
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (
      current.type === AST_NODE_TYPES.TSTypeOperator &&
      (current as TSESTree.TSTypeOperator).operator === 'readonly'
    ) {
      current = (current as TSESTree.TSTypeOperator).typeAnnotation as TSESTree.TypeNode;
      continue;
    }
    if (isParenthesizedType(current)) {
      current = (current as unknown as { typeAnnotation: TSESTree.TypeNode }).typeAnnotation;
      continue;
    }
    if (current.type === AST_NODE_TYPES.TSArrayType) {
      current = (current as TSESTree.TSArrayType).elementType;
      continue;
    }
    if (
      current.type === AST_NODE_TYPES.TSTypeReference &&
      isArrayGenericReference(current as TSESTree.TSTypeReference) &&
      (current as TSESTree.TSTypeReference).typeParameters &&
      (current as TSESTree.TSTypeReference).typeParameters!.params.length > 0
    ) {
      current = (current as TSESTree.TSTypeReference).typeParameters!.params[0];
      continue;
    }
    break;
  }
  return current;
};

const isObjectType = (node: TSESTree.TypeNode): boolean => {
  if (isParenthesizedType(node)) {
    return isObjectType((node as unknown as { typeAnnotation: TSESTree.TypeNode }).typeAnnotation);
  }
  switch (node.type) {
    case AST_NODE_TYPES.TSTypeLiteral:
      return true;
    case AST_NODE_TYPES.TSTypeReference:
      if (node.typeName.type === AST_NODE_TYPES.Identifier) {
        const typeName = node.typeName.name;
        return !PRIMITIVE_TYPES.has(typeName);
      }
      if (node.typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        const rightMost = getRightmostIdentifierName(node.typeName);
        return !PRIMITIVE_TYPES.has(rightMost);
      }
      return true;
    case AST_NODE_TYPES.TSIntersectionType:
    case AST_NODE_TYPES.TSUnionType:
      return node.types.some(isObjectType);
    case AST_NODE_TYPES.TSMappedType:
      return true;
    case AST_NODE_TYPES.TSIndexedAccessType:
      // Treat indexed access as object-like to align with existing tests
      return true;
    case AST_NODE_TYPES.TSTypeOperator:
      if ((node as TSESTree.TSTypeOperator).operator === 'readonly') {
        return isObjectType((node as TSESTree.TSTypeOperator).typeAnnotation as TSESTree.TypeNode);
      }
      return false;
    case AST_NODE_TYPES.TSAnyKeyword:
    case AST_NODE_TYPES.TSUnknownKeyword:
      return false;
    default:
      return false;
  }
};

const isImmediatelyWrappedByArraySyntax = (node: TSESTree.Node): boolean => {
  let parent = (node as TSESTree.Node).parent as TSESTree.Node | undefined;
  // Skip non-semantic wrappers (readonly/parens)
  while (parent) {
    if (
      parent.type === AST_NODE_TYPES.TSTypeOperator &&
      (parent as TSESTree.TSTypeOperator).operator === 'readonly'
    ) {
      parent = (parent as unknown as { parent?: TSESTree.Node }).parent as TSESTree.Node | undefined;
      continue;
    }
    if ((AST_NODE_TYPES as any).TSParenthesizedType && parent.type === (AST_NODE_TYPES as any).TSParenthesizedType) {
      parent = (parent as unknown as { parent?: TSESTree.Node }).parent as TSESTree.Node | undefined;
      continue;
    }
    break;
  }
  if (!parent) return false;
  if (parent.type === AST_NODE_TYPES.TSArrayType) return true;
  if (
    parent.type === AST_NODE_TYPES.TSTypeReference &&
    isArrayGenericReference(parent as TSESTree.TSTypeReference)
  )
    return true;
  return false;
};

export const noFirestoreObjectArrays = createRule<[], MessageIds>({
  name: 'no-firestore-object-arrays',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arrays of object types in Firestore models. Prefer Record maps keyed by id with an index field, or subcollections/arrays of IDs.',
      recommended: 'warn',
      requiresTypeChecking: false,
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
        if (
          node.typeName.type === AST_NODE_TYPES.Identifier &&
          (node.typeName.name === 'Array' ||
            node.typeName.name === 'ReadonlyArray') &&
          node.typeParameters
        ) {
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
