import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import path from 'path';

type MessageIds = 'missingType' | 'notExtendingIdentifiable';

export const enforceIdentifiableFirestoreType = createRule<[], MessageIds>({
  name: 'enforce-identifiable-firestore-type',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that Firestore type definitions extend Identifiable and match their folder name',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingType:
        'Expected exported type "{{ typeName }}" in index.ts under folder "{{ folderName }}". Create a type that matches the folder name: `export type {{ typeName }} = { /* fields */ }`.',
      notExtendingIdentifiable:
        'Type "{{ typeName }}" must extend "Identifiable" to ensure all Firestore documents have an ID field. Add `extends Identifiable` or include `id: string`: `export type {{ typeName }} = { id: string; /* other fields */ }`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();
    const firestoreTypesPattern =
      /functions\/src\/types\/firestore\/.*\/index\.ts$/;

    // Only apply rule to index.ts files in the firestore types directory
    if (!firestoreTypesPattern.test(filename)) {
      return {};
    }

    // Get the expected type name from the parent folder
    const folderName = path.basename(path.dirname(filename));
    let hasExpectedType = false;
    let typeHasIdentifiable = false;

    return {
      Program() {
        // Reset flags for each file
        hasExpectedType = false;
        typeHasIdentifiable = false;
      },
      'Program:exit'(node) {
        if (!hasExpectedType) {
          context.report({
            node,
            messageId: 'missingType',
            data: {
              typeName: folderName,
              folderName,
            },
          });
        } else if (!typeHasIdentifiable) {
          context.report({
            node,
            messageId: 'notExtendingIdentifiable',
            data: {
              typeName: folderName,
            },
          });
        }
      },
      TSTypeAliasDeclaration(node) {
        if (node.id.name === folderName) {
          hasExpectedType = true;

          const findTypeAliasAnnotation = (
            typeName: string,
          ): TSESTree.Node | null => {
            type ScopeType = ReturnType<typeof context.getScope>;
            let scope: ScopeType | null = context.getScope();

            while (scope) {
              const variable = scope.variables.find(
                (variableNode) => variableNode.name === typeName,
              );
              if (variable) {
                const definition = variable.defs.find(
                  (definition) =>
                    definition.node.type ===
                    AST_NODE_TYPES.TSTypeAliasDeclaration,
                );
                if (
                  definition &&
                  definition.node.type ===
                    AST_NODE_TYPES.TSTypeAliasDeclaration &&
                  definition.node.typeAnnotation
                ) {
                  return definition.node.typeAnnotation as TSESTree.TypeNode;
                }
              }
              scope = scope.upper as ScopeType | null;
            }

            return null;
          };

          const transparentTypeNames = new Set(['Readonly', 'Resolve']);

          type ParenthesizedTypeNode = {
            type: 'TSParenthesizedType';
            typeAnnotation?: TSESTree.Node | null;
          };

          const isParenthesizedType = (
            node: TSESTree.Node | null | undefined,
          ): boolean =>
            (node as { type?: string })?.type === 'TSParenthesizedType';

          const isReadonlyTypeOperator = (
            node: TSESTree.Node | null | undefined,
          ): node is TSESTree.TSTypeOperator & { operator: 'readonly' } =>
            node?.type === AST_NODE_TYPES.TSTypeOperator &&
            (node as TSESTree.TSTypeOperator).operator === 'readonly';

          const unwrapTransparentType = (
            typeNode: TSESTree.Node | null | undefined,
          ): TSESTree.Node | null => {
            let current = typeNode;

            while (current) {
              if (isParenthesizedType(current)) {
                const parenthesized = current as unknown as ParenthesizedTypeNode;
                current = parenthesized.typeAnnotation ?? null;
                continue;
              }

              if (isReadonlyTypeOperator(current)) {
                current = current.typeAnnotation ?? null;
                continue;
              }

              break;
            }

            return current ?? null;
          };

          const findIdentifiable = (
            type: TSESTree.Node | null | undefined,
            checkedTypes = new Set<string>(),
          ): boolean => {
            const resolvedType = unwrapTransparentType(type);

            if (!resolvedType) {
              return false;
            }

            if (
              resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
              resolvedType.typeName.type === AST_NODE_TYPES.Identifier
            ) {
              const typeName = resolvedType.typeName.name;

              if (typeName === 'Identifiable') {
                return true;
              }

              if (
                transparentTypeNames.has(typeName) &&
                resolvedType.typeParameters?.params?.some((param) =>
                  findIdentifiable(param, checkedTypes),
                )
              ) {
                return true;
              }

              if (checkedTypes.has(typeName)) {
                return false;
              }

              checkedTypes.add(typeName);
              const aliasAnnotation = findTypeAliasAnnotation(typeName);

              return findIdentifiable(aliasAnnotation, checkedTypes);
            }

            if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
              return resolvedType.types.some((part) =>
                findIdentifiable(part, new Set(checkedTypes)),
              );
            }

            return false;
          };

          // Check if type has id: string field
          const checkIdField = (
            type: TSESTree.Node | null | undefined,
            visitedTypes = new Set<string>(),
          ): boolean => {
            const resolvedType = unwrapTransparentType(type);

            if (!resolvedType) {
              return false;
            }

            if (resolvedType.type === AST_NODE_TYPES.TSTypeLiteral) {
              return resolvedType.members.some(
                (member) =>
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier &&
                  member.key.name === 'id' &&
                  member.typeAnnotation?.typeAnnotation.type ===
                    AST_NODE_TYPES.TSStringKeyword,
              );
            }

            if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
              return resolvedType.types.some((part) =>
                checkIdField(part, new Set(visitedTypes)),
              );
            }

            if (resolvedType.type === AST_NODE_TYPES.TSTypeReference) {
              if (resolvedType.typeName.type !== AST_NODE_TYPES.Identifier) {
                return false;
              }

              const typeName = resolvedType.typeName.name;

              if (typeName === 'Identifiable') {
                return true;
              }

              if (
                transparentTypeNames.has(typeName) &&
                resolvedType.typeParameters?.params?.some((param) =>
                  checkIdField(param, visitedTypes),
                )
              ) {
                return true;
              }

              if (visitedTypes.has(typeName)) {
                return false;
              }

              visitedTypes.add(typeName);
              const referencedType = findTypeAliasAnnotation(typeName);

              return checkIdField(referencedType, visitedTypes);
            }

            return false;
          };

          // Check if type is wrapped in a utility type
          const isUtilityType = (
            type: TSESTree.Node | null | undefined,
          ): type is TSESTree.TSTypeReference & {
            typeName: TSESTree.Identifier;
          } => {
            if (!type) {
              return false;
            }

            return (
              type.type === AST_NODE_TYPES.TSTypeReference &&
              type.typeName.type === AST_NODE_TYPES.Identifier &&
              type.typeName.name === 'Resolve'
            );
          };

          // Recursively check the type and its parameters
          const checkType = (
            type: TSESTree.Node | null | undefined,
            visitedTypes = new Set<string>(),
          ): boolean => {
            const resolvedType = unwrapTransparentType(type);

            if (!resolvedType) {
              return false;
            }

            if (findIdentifiable(resolvedType)) {
              return true;
            }

            if (
              isUtilityType(resolvedType) &&
              resolvedType.typeParameters?.params?.[0] &&
              checkIdField(resolvedType.typeParameters.params[0])
            ) {
              return true;
            }

            if (
              resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
              resolvedType.typeName.type === AST_NODE_TYPES.Identifier
            ) {
              const typeName = resolvedType.typeName.name;

              if (visitedTypes.has(typeName)) {
                return false;
              }

              visitedTypes.add(typeName);
              const aliasAnnotation = findTypeAliasAnnotation(typeName);

              return checkType(aliasAnnotation, visitedTypes);
            }

            if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
              return resolvedType.types.some((part) =>
                checkType(part, new Set(visitedTypes)),
              );
            }

            return false;
          };

          typeHasIdentifiable = checkType(node.typeAnnotation);
        }
      },
    };
  },
});
