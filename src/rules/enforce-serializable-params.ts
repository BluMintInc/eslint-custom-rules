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
        'Enforce serializable parameters for Firebase callable/HTTPS functions.',
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
        'What\'s wrong: parameter type "{{ type }}" is not JSON-safe for Firebase Callable/HTTPS functions → Why it matters: Firebase transports request payloads as JSON, so {{ type }} values may be coerced, dropped, or lose semantic type in transit → How to fix: convert {{ type }} to a JSON-safe primitive, array, or plain object (e.g., ISO date string, document path string, Map/Set as arrays/objects) before adding it to the request type.',
      nonSerializableProperty:
        'What\'s wrong: property "{{ prop }}" uses a non-JSON-safe type "{{ type }}" → Why it matters: Firebase may coerce, drop, or strip semantic type when serializing callable/HTTPS request payloads → How to fix: accept only JSON-safe primitives, arrays, or plain objects, and convert {{ type }} to a safe representation (e.g., Date/Timestamp -> ISO string, DocumentReference -> document path string, Map/Set -> an array or object).',
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

    /**
     * TypeScript hoists type aliases, so a request type may be declared below
     * the function that consumes it. Collecting the wrapper references and
     * resolving them once traversal is finished decouples the check from
     * declaration order, which `typeAliasMap` alone cannot do.
     */
    const wrapperReferences: TSESTree.TSTypeReference[] = [];

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
          wrapperReferences.push(node);
        }
      },
      'Program:exit'() {
        for (const node of wrapperReferences) {
          const typeParam = node.typeParameters?.params[0];
          if (!typeParam) continue;

          if (typeParam.type === AST_NODE_TYPES.TSTypeReference) {
            const referencedTypeName = (
              typeParam.typeName as TSESTree.Identifier
            ).name;
            const typeAlias = typeAliasMap.get(referencedTypeName);
            /**
             * A reference that names no local alias is still a type in its own
             * right — `CallableRequest<Timestamp>` is the plainest form of the
             * violation. Checking the node itself lets the non-serializable
             * lookup and the generic descent apply; an unrecognized name simply
             * yields no report, so an imported request type stays silent.
             */
            checkTypeNode(typeAlias ? typeAlias.typeAnnotation : typeParam);
          } else {
            checkTypeNode(typeParam);
          }
        }
      },
    };
  },
});
