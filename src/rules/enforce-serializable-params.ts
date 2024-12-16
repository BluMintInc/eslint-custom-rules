import { TSESTree } from '@typescript-eslint/utils';
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
      description: 'Enforce serializable parameters in Firebase Callable/HTTPS Cloud Functions',
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
      nonSerializableParam: 'Parameter type "{{ type }}" is not serializable',
      nonSerializableProperty: 'Property "{{ prop }}" has non-serializable type "{{ type }}"',
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

    function isNonSerializableType(typeName: string): boolean {
      return allNonSerializableTypes.has(typeName);
    }

    function checkTypeNode(node: TSESTree.TypeNode | undefined, propName?: string) {
      if (!node) return;

      if (node.type === 'TSTypeReference') {
        const typeName = (node.typeName as TSESTree.Identifier).name;
        if (isNonSerializableType(typeName)) {
          context.report({
            node,
            messageId: propName ? 'nonSerializableProperty' : 'nonSerializableParam',
            data: {
              type: typeName,
              prop: propName,
            },
          });
        }
      } else if (node.type === 'TSArrayType') {
        checkTypeNode(node.elementType, propName);
      } else if (node.type === 'TSTypeAnnotation') {
        checkTypeNode(node.typeAnnotation, propName);
      } else if (node.type === 'TSTypeLiteral') {
        node.members.forEach((member) => {
          if (member.type === 'TSPropertySignature') {
            const propertyName = (member.key as TSESTree.Identifier).name;
            checkTypeNode(member.typeAnnotation, propertyName);
          }
        });
      } else if (node.type === 'TSUnionType') {
        node.types.forEach((type) => checkTypeNode(type, propName));
      }
    }

    return {
      TSTypeReference(node) {
        const typeName = (node.typeName as TSESTree.Identifier).name;
        if (options.functionTypes.includes(typeName)) {
          // Check type parameters (generic arguments)
          if (node.typeParameters?.params[0]) {
            checkTypeNode(node.typeParameters.params[0]);
          }
        }
      },
    };
  },
});
