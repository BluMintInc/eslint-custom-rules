import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const NON_SERIALIZABLE_TYPES = new Set([
  'Date',
  'DocumentReference',
  'Timestamp',
  'Map',
  'Set',
  'Symbol',
  'Function',
  'undefined',
]);

export default createRule({
  name: 'enforce-serializable-params',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce serializable parameters in Firebase Callable/HTTPS Cloud Functions to prevent runtime errors. Firebase Functions can only pass JSON-serializable data, so using non-serializable types like Date, DocumentReference, or Map will cause failures. Use primitive types, plain objects, and arrays instead, converting complex types to their serializable representations (e.g., Date to ISO string).',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          additionalNonSerializableTypes: {
            type: 'array',
            items: { type: 'string' },
          },
          functionTypes: {
            type: 'array',
            items: { type: 'string' },
            default: ['CallableRequest'],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      nonSerializableParam: 'Parameter type "{{ type }}" is not serializable in Firebase Cloud Functions. Use JSON-serializable types like string, number, boolean, arrays, or plain objects. Instead of `Date`, use ISO strings: `new Date().toISOString()`.',
      nonSerializableProperty:
        'Property "{{ prop }}" has non-serializable type "{{ type }}". Use JSON-serializable types. For example, instead of `{ timestamp: Date }`, use `{ timestamp: string }` with ISO format.',
    },
  },
  defaultOptions: [
    {
      additionalNonSerializableTypes: [],
      functionTypes: ['CallableRequest'],
    },
  ],
  create(context, [options]) {
    const allNonSerializableTypes = new Set([
      ...NON_SERIALIZABLE_TYPES,
      ...(options.additionalNonSerializableTypes || []),
    ]);

    const typeAliasMap = new Map<string, TSESTree.TSTypeAliasDeclaration>();

    function isNonSerializableType(typeName: string): boolean {
      return allNonSerializableTypes.has(typeName);
    }

    function checkTypeNode(
      node: TSESTree.TypeNode | TSESTree.TSTypeAnnotation | undefined,
      propName?: string,
    ): void {
      if (!node) return;

      switch (node.type) {
        case AST_NODE_TYPES.TSTypeReference: {
          const typeName = (node.typeName as TSESTree.Identifier).name;
          if (isNonSerializableType(typeName)) {
            context.report({
              node,
              messageId: propName
                ? 'nonSerializableProperty'
                : 'nonSerializableParam',
              data: {
                type: typeName,
                prop: propName,
              },
            });
          }
          // Check type parameters of generic types (like Array<T>)
          if (node.typeParameters) {
            node.typeParameters.params.forEach((param) =>
              checkTypeNode(param, propName),
            );
          }
          break;
        }
        case AST_NODE_TYPES.TSArrayType:
          checkTypeNode(node.elementType, propName);
          break;
        case AST_NODE_TYPES.TSTypeAnnotation:
          checkTypeNode(node.typeAnnotation, propName);
          break;
        case AST_NODE_TYPES.TSTypeLiteral:
          node.members.forEach((member) => {
            if (member.type === AST_NODE_TYPES.TSPropertySignature) {
              const propertyName = (member.key as TSESTree.Identifier).name;
              checkTypeNode(member.typeAnnotation, propertyName);
            }
          });
          break;
        case AST_NODE_TYPES.TSUnionType:
          node.types.forEach((type) => checkTypeNode(type, propName));
          break;
      }
    }

    return {
      TSTypeAliasDeclaration(node) {
        typeAliasMap.set(node.id.name, node);
      },
      TSTypeReference(node) {
        const typeName = (node.typeName as TSESTree.Identifier).name;
        if (
          options.functionTypes.includes(typeName) &&
          node.typeParameters?.params[0]
        ) {
          const typeParam = node.typeParameters.params[0];

          if (typeParam.type === AST_NODE_TYPES.TSTypeReference) {
            const referencedTypeName = (
              typeParam.typeName as TSESTree.Identifier
            ).name;
            const typeAlias = typeAliasMap.get(referencedTypeName);
            if (typeAlias) {
              checkTypeNode(typeAlias.typeAnnotation);
            }
          } else {
            checkTypeNode(typeParam);
          }
        }
      },
    };
  },
});
