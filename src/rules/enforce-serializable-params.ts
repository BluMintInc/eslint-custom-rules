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
        'Keep Firebase Callable/HTTPS request parameters JSON-safe. Values such as Date, Timestamp, DocumentReference, Map, Set, Symbol, Function, or undefined may be coerced, dropped, or lose semantic type when serialized by Firebase. Convert complex values to JSON-safe primitives, arrays, or plain objects before including them in request types.',
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
      nonSerializableParam:
        'Parameter type "{{ type }}" is not JSON-safe for Firebase Callable/HTTPS functions. Firebase transports payloads as JSON, so {{ type }} values may be coerced, dropped, or lose their semantic type in transit. Convert {{ type }} to a JSON-safe primitive, array, or plain object (for example, use an ISO date string, a document path string, or flatten Map/Set into arrays/objects) before adding it to the request type.',
      nonSerializableProperty:
        'Property "{{ prop }}" uses a not JSON-safe type "{{ type }}", which Firebase may coerce, drop, or strip of its semantic type when serializing callable/HTTPS payloads. Accept only JSON-safe primitives, arrays, or plain objects, and convert {{ type }} to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
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
