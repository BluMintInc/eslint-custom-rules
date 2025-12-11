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
                  (def) => def.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration,
                );
                if (
                  definition &&
                  'typeAnnotation' in definition.node &&
                  definition.node.typeAnnotation
                ) {
                  return definition.node.typeAnnotation;
                }
              }
              scope = scope.upper as ScopeType | null;
            }

            return null;
          };

          const unwrapParenthesized = (
            maybeType: TSESTree.Node | null | undefined,
          ): TSESTree.Node | null | undefined => {
            if (
              maybeType &&
              (maybeType as { type: string }).type === 'TSParenthesizedType'
            ) {
              return (maybeType as { typeAnnotation?: TSESTree.Node }).typeAnnotation;
            }

            return maybeType;
          };

          const findIdentifiable = (
            type: TSESTree.Node | null | undefined,
            checkedTypes = new Set<string>(),
          ): boolean => {
            const currentType = unwrapParenthesized(type);

            if (!currentType) {
              return false;
            }

            if (currentType !== type) {
              return findIdentifiable(currentType, checkedTypes);
            }

            if (
              currentType.type === AST_NODE_TYPES.TSTypeReference &&
              currentType.typeName.type === AST_NODE_TYPES.Identifier
            ) {
              const typeName = currentType.typeName.name;

              if (typeName === 'Identifiable') {
                return true;
              }

              if (
                currentType.typeParameters?.params?.some((param) =>
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

            if (currentType.type === AST_NODE_TYPES.TSIntersectionType) {
              return currentType.types.some((part) =>
                findIdentifiable(part, checkedTypes),
              );
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeOperator) {
              return findIdentifiable(currentType.typeAnnotation, checkedTypes);
            }

            return false;
          };

          // Check if type has id: string field
          const checkIdField = (
            type: TSESTree.Node | null | undefined,
          ): boolean => {
            const currentType = unwrapParenthesized(type);

            if (!currentType) {
              return false;
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeLiteral) {
              return currentType.members.some(
                (member) =>
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier &&
                  member.key.name === 'id' &&
                  member.typeAnnotation?.typeAnnotation.type ===
                    AST_NODE_TYPES.TSStringKeyword,
              );
            }

            if (currentType.type === AST_NODE_TYPES.TSIntersectionType) {
              return currentType.types.some(checkIdField);
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeReference) {
              if (
                currentType.typeParameters?.params?.some((param) =>
                  checkIdField(param),
                )
              ) {
                return true;
              }

              if (currentType.typeName.type !== AST_NODE_TYPES.Identifier) {
                return false;
              }

              const referencedType = findTypeAliasAnnotation(
                currentType.typeName.name,
              );

              return checkIdField(referencedType);
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeOperator) {
              return checkIdField(currentType.typeAnnotation);
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
          const checkType = (type: TSESTree.Node | null | undefined): boolean => {
            const currentType = unwrapParenthesized(type);

            if (!currentType) {
              return false;
            }

            if (currentType !== type) {
              return checkType(currentType);
            }

            if (findIdentifiable(currentType)) {
              return true;
            }

            if (
              isUtilityType(currentType) &&
              currentType.typeParameters?.params?.[0] &&
              checkIdField(currentType.typeParameters.params[0])
            ) {
              return true;
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeReference) {
              return currentType.typeParameters?.params?.some(checkType) ?? false;
            }

            if (currentType.type === AST_NODE_TYPES.TSIntersectionType) {
              return currentType.types.some(checkType);
            }

            if (currentType.type === AST_NODE_TYPES.TSTypeOperator) {
              return checkType(currentType.typeAnnotation);
            }

            return false;
          };

          typeHasIdentifiable = checkType(node.typeAnnotation);
        }
      },
    };
  },
});
