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
    const typeCache = new Map<string, boolean>();

    function hasInvalidType(node: TSESTree.TypeNode | undefined): boolean {
      if (!node) return false;

      switch (node.type) {
        case AST_NODE_TYPES.TSAnyKeyword:
          return true;
        case AST_NODE_TYPES.TSTypeLiteral:
          if (!node.members || node.members.length === 0) {
            return true;
          }
          return node.members.some(member => {
            if (member.type === AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation) {
              return hasInvalidType(member.typeAnnotation.typeAnnotation);
            }
            return false;
          });
        case AST_NODE_TYPES.TSTypeReference:
          if (node.typeParameters) {
            return node.typeParameters.params.some(hasInvalidType);
          }
          if (node.typeName.type === AST_NODE_TYPES.Identifier) {
            const typeName = node.typeName.name;
            if (typeCache.has(typeName)) {
              return typeCache.get(typeName)!;
            }
            // Prevent infinite recursion
            typeCache.set(typeName, false);
            const program = context.getSourceCode().ast;
            const interfaceDecl = program.body.find(
              (n): n is TSESTree.TSInterfaceDeclaration =>
                n.type === AST_NODE_TYPES.TSInterfaceDeclaration && n.id.name === typeName
            );
            if (interfaceDecl) {
              const result = interfaceDecl.body.body.some(member => {
                if (member.type === AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation) {
                  return hasInvalidType(member.typeAnnotation.typeAnnotation);
                }
                return false;
              });
              typeCache.set(typeName, result);
              return result;
            }
          }
          return false;
        case AST_NODE_TYPES.TSIntersectionType:
        case AST_NODE_TYPES.TSUnionType:
          return node.types.some(hasInvalidType);
        case AST_NODE_TYPES.TSTypeOperator:
          if ('typeAnnotation' in node) {
            return hasInvalidType(node.typeAnnotation);
          }
          return false;
        case AST_NODE_TYPES.TSMappedType:
          if ('typeAnnotation' in node) {
            return hasInvalidType(node.typeAnnotation);
          }
          return false;
        case AST_NODE_TYPES.TSIndexedAccessType:
          return hasInvalidType(node.objectType) || hasInvalidType(node.indexType);
        case AST_NODE_TYPES.TSConditionalType:
          return (
            hasInvalidType(node.checkType) ||
            hasInvalidType(node.extendsType) ||
            hasInvalidType(node.trueType) ||
            hasInvalidType(node.falseType)
          );
        case AST_NODE_TYPES.TSArrayType:
          return hasInvalidType(node.elementType);
        case AST_NODE_TYPES.TSTupleType:
          return node.elementTypes.some(hasInvalidType);
        case AST_NODE_TYPES.TSTypeQuery:
          return false;
        default:
          return false;
      }
    }

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

          // Check for invalid generic type arguments (any or {}) recursively
          const typeArg = node.typeParameters.params[0];
          if (hasInvalidType(typeArg)) {
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
