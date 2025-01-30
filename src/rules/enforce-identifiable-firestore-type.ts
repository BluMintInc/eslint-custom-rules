import { AST_NODE_TYPES } from '@typescript-eslint/utils';
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

          // Find Identifiable in type's dependencies
          const findIdentifiable = (type: any, checkedTypes = new Set<string>()): boolean => {
            if (!type) return false;

            if (type.type === AST_NODE_TYPES.TSTypeReference && type.typeName.type === AST_NODE_TYPES.Identifier) {
              const typeName = type.typeName.name;
              if (typeName === 'Identifiable') {
                return true;
              }
              if (!checkedTypes.has(typeName)) {
                checkedTypes.add(typeName);
                // Look for the type in all scopes
                const scope = context.getScope();
                const variable = scope.variables.find(v => v.name === typeName);
                if (variable) {
                  const def = variable.defs.find(d => d.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration);
                  if (def && 'typeAnnotation' in def.node && def.node.typeAnnotation) {
                    return findIdentifiable(def.node.typeAnnotation, checkedTypes);
                  }
                }
                // Try looking in the parent scope
                if (scope.upper) {
                  const parentVariable = scope.upper.variables.find(v => v.name === typeName);
                  if (parentVariable) {
                    const def = parentVariable.defs.find(d => d.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration);
                    if (def && 'typeAnnotation' in def.node && def.node.typeAnnotation) {
                      return findIdentifiable(def.node.typeAnnotation, checkedTypes);
                    }
                  }
                }
              }
            } else if (type.type === AST_NODE_TYPES.TSIntersectionType) {
              // For intersection types, check each part
              return type.types.some(part => findIdentifiable(part, checkedTypes));
            }

            return false;
          };

          // Check if type extends Identifiable
          const checkIdentifiableExtension = (type: any): boolean => {
            if (!type) return false;
            return findIdentifiable(type);
          };

          // Check if type has id: string field
          const checkIdField = (type: any): boolean => {
            // Check for id: string field in type literal
            if (type.type === AST_NODE_TYPES.TSTypeLiteral) {
              return type.members.some(
                (member: any) =>
                  member.type === AST_NODE_TYPES.TSPropertySignature &&
                  member.key.type === AST_NODE_TYPES.Identifier &&
                  member.key.name === 'id' &&
                  member.typeAnnotation?.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword
              );
            }

            // Check intersection types
            if (type.type === AST_NODE_TYPES.TSIntersectionType) {
              return type.types.some(checkIdField);
            }

            return false;
          };

          // Check if type is wrapped in a utility type
          const isUtilityType = (type: any): boolean => {
            return (
              type.type === AST_NODE_TYPES.TSTypeReference &&
              type.typeName.type === AST_NODE_TYPES.Identifier &&
              type.typeName.name === 'Resolve'
            );
          };

          // Recursively check the type and its parameters
          const checkType = (type: any): boolean => {
            // Check if type extends Identifiable
            if (checkIdentifiableExtension(type)) {
              return true;
            }

            // Check if type has id: string field (only for utility types)
            if (isUtilityType(type) && checkIdField(type.typeParameters.params[0])) {
              return true;
            }

            // Check if type is wrapped in a utility type
            if (
              type.type === AST_NODE_TYPES.TSTypeReference &&
              type.typeParameters?.params?.[0]
            ) {
              return checkType(type.typeParameters.params[0]);
            }

            // For direct type definitions, require extending Identifiable
            return false;
          };

          typeHasIdentifiable = checkType(node.typeAnnotation);
        }
      },
    };
  },
});
