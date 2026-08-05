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

    type PayloadDeclaration =
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration;

    /**
     * Interfaces sit here alongside aliases because a request contract is as
     * often an `interface` as a `type`, and resolving only one of the two makes
     * the rule's coverage depend on which keyword the author reached for.
     */
    const declarations = new Map<string, PayloadDeclaration>();

    /**
     * A node reports at most once. Resolution follows references, so a type
     * reachable by two paths (`{ x: Inner; y: Inner }`) would otherwise produce
     * duplicate reports at one location.
     */
    const reported = new Set<TSESTree.Node>();

    function isNonSerializableType(typeName: string): boolean {
      return allNonSerializableTypes.has(typeName);
    }

    /**
     * The rightmost identifier of a possibly-namespaced name, so
     * `admin.firestore.Timestamp` is matched as `Timestamp`. The whole rule
     * keys off simple names, and a namespaced spelling of a type is the same
     * type — reading only `Identifier.name` leaves it `undefined` and silently
     * exempts every firebase-admin-style reference.
     */
    function simpleTypeNameOf(
      entity: TSESTree.EntityName | undefined,
    ): string | undefined {
      if (!entity) return undefined;
      if (entity.type === AST_NODE_TYPES.Identifier) return entity.name;
      if (entity.type === AST_NODE_TYPES.TSQualifiedName) {
        return simpleTypeNameOf(entity.right);
      }
      return undefined;
    }

    const propertyNameOf = (
      member: TSESTree.TSPropertySignature,
    ): string | undefined => {
      const { key } = member;
      if (key.type === AST_NODE_TYPES.Identifier) return key.name;
      if (key.type === AST_NODE_TYPES.Literal) return String(key.value);
      return undefined;
    };

    function checkMembers(
      members: TSESTree.TypeElement[],
      seen: Set<string>,
      propName?: string,
    ): void {
      for (const member of members) {
        if (member.type !== AST_NODE_TYPES.TSPropertySignature) continue;
        checkTypeNode(
          member.typeAnnotation,
          propertyNameOf(member) ?? propName,
          seen,
        );
      }
    }

    function checkTypeNode(
      node: TSESTree.TypeNode | TSESTree.TSTypeAnnotation | undefined,
      propName?: string,
      seen: Set<string> = new Set(),
    ): void {
      if (!node) return;

      switch (node.type) {
        case AST_NODE_TYPES.TSTypeReference: {
          const typeName = simpleTypeNameOf(node.typeName);
          if (
            typeName &&
            isNonSerializableType(typeName) &&
            !reported.has(node)
          ) {
            reported.add(node);
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
          /**
           * A reference to a locally declared type is followed so a payload
           * assembled from named parts is inspected as a whole. `seen` is
           * path-scoped rather than global: a self-referential type must not
           * loop, but a type legitimately used by two siblings must still be
           * checked under each of them.
           */
          if (typeName && !seen.has(typeName)) {
            const declaration = declarations.get(typeName);
            if (declaration) {
              seen.add(typeName);
              if (declaration.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                checkTypeNode(declaration.typeAnnotation, propName, seen);
              } else {
                checkMembers(declaration.body.body, seen, propName);
              }
              seen.delete(typeName);
            }
          }
          // Check type parameters of generic types (like Array<T>)
          if (node.typeParameters) {
            node.typeParameters.params.forEach((param) =>
              checkTypeNode(param, propName, seen),
            );
          }
          break;
        }
        case AST_NODE_TYPES.TSArrayType:
          checkTypeNode(node.elementType, propName, seen);
          break;
        case AST_NODE_TYPES.TSTypeAnnotation:
          checkTypeNode(node.typeAnnotation, propName, seen);
          break;
        case AST_NODE_TYPES.TSTypeLiteral:
          checkMembers(node.members, seen, propName);
          break;
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
          node.types.forEach((type) => checkTypeNode(type, propName, seen));
          break;
        case AST_NODE_TYPES.TSTupleType:
          node.elementTypes.forEach((type) =>
            checkTypeNode(type, propName, seen),
          );
          break;
        // `readonly T[]` wraps its operand rather than replacing it.
        case AST_NODE_TYPES.TSTypeOperator:
          checkTypeNode(node.typeAnnotation, propName, seen);
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
        declarations.set(node.id.name, node);
      },
      TSInterfaceDeclaration(node) {
        declarations.set(node.id.name, node);
      },
      TSTypeReference(node) {
        const typeName = simpleTypeNameOf(node.typeName);
        if (
          typeName &&
          options.functionTypes.includes(typeName) &&
          node.typeParameters?.params[0]
        ) {
          wrapperReferences.push(node);
        }
      },
      'Program:exit'() {
        for (const node of wrapperReferences) {
          /**
           * The payload is handed to `checkTypeNode` whatever its shape: it
           * resolves a reference to a local declaration itself, and a reference
           * that names none is still a type in its own right —
           * `CallableRequest<Timestamp>` is the plainest form of the violation.
           * An unrecognized name yields no report, so an imported request type
           * stays silent.
           */
          checkTypeNode(node.typeParameters?.params[0]);
        }
      },
    };
  },
});
