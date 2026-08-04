import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import path from 'path';
import { createRule } from '../utils/createRule';

type MessageIds = 'missingType' | 'notExtendingIdentifiable';

const TRANSPARENT_TYPE_NAMES = new Set(['Readonly', 'Resolve']);

// A binding introduced by any of these declares a type whose shape lives in
// another module. This rule is purely syntactic and reads a single file, so
// such a type is opaque to it.
const IMPORT_BINDING_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ImportSpecifier,
  AST_NODE_TYPES.ImportDefaultSpecifier,
  AST_NODE_TYPES.ImportNamespaceSpecifier,
]);

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
    // Normalize Windows backslash separators so the forward-slash pattern below
    // matches on every platform. Without this, `getFilename()` returns
    // `C:\repo\functions\src\types\firestore\...\index.ts` on Windows, the
    // pattern never matches, the guard bails, and the rule silently enforces
    // nothing (issue #1271). Forward slashes are valid separators for the
    // path.basename/path.dirname calls below on all platforms.
    const filename = context.getFilename().replace(/\\/g, '/');
    const firestoreTypesPattern =
      /functions\/src\/types\/firestore\/.*\/index\.ts$/;

    // Only apply rule to index.ts files in the firestore types directory
    if (!firestoreTypesPattern.test(filename)) {
      return {};
    }

    // Get the expected type name from the parent folder
    const folderName = path.basename(path.dirname(filename));
    // The folder-matching alias only satisfies the rule if it is reachable by
    // consumers. An alias can be exported inline (`export type X = ...`) or
    // separately (`export { X }` / `export type { X }`), and the separate form
    // can appear either before or after the declaration, so exportedness can't
    // be decided inside the TSTypeAliasDeclaration visitor alone — it's
    // resolved once the whole module has been scanned, in Program:exit.
    let matchingAliasNode: TSESTree.TSTypeAliasDeclaration | null = null;
    let matchingAliasInlineExported = false;
    let matchingAliasHasIdentifiable = false;
    // Set when resolving the matching alias runs into a type that is declared
    // in another module. Such a type is opaque to this single-file walk, so the
    // absence of `Identifiable` is unproven rather than disproven.
    let matchingAliasLeavesModule = false;
    const locallyExportedNames = new Set<string>();

    return {
      Program() {
        // Reset flags for each file
        matchingAliasNode = null;
        matchingAliasInlineExported = false;
        matchingAliasHasIdentifiable = false;
        matchingAliasLeavesModule = false;
        locallyExportedNames.clear();
      },
      'Program:exit'(node) {
        const hasExpectedType =
          matchingAliasNode !== null &&
          (matchingAliasInlineExported || locallyExportedNames.has(folderName));

        if (!hasExpectedType) {
          context.report({
            node,
            messageId: 'missingType',
            data: {
              typeName: folderName,
              folderName,
            },
          });
        } else if (
          !matchingAliasHasIdentifiable &&
          !matchingAliasLeavesModule
        ) {
          // A chain that leaves the module is unknowable here: the imported
          // type may well intersect `Identifiable`, and reporting would demand
          // a type-theoretically redundant `Identifiable &` to silence a claim
          // the rule cannot substantiate. Staying silent trades a false
          // positive for a false negative, which this repo prefers.
          context.report({
            node,
            messageId: 'notExtendingIdentifiable',
            data: {
              typeName: folderName,
            },
          });
        }
      },
      ExportNamedDeclaration(node) {
        // A re-export (`export { X } from './elsewhere'`) exports a binding
        // from another module, not the local alias declared in this file, so
        // it must never satisfy the gate.
        if (node.source != null) {
          return;
        }

        for (const specifier of node.specifiers) {
          locallyExportedNames.add(specifier.local.name);
        }
      },
      TSTypeAliasDeclaration(node) {
        if (node.id.name === folderName) {
          matchingAliasNode = node;
          matchingAliasInlineExported =
            node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration;

          // Raised by the resolution walk below whenever a referenced type name
          // resolves to an imported binding, i.e. the alias chain ran out of
          // this file. Scoped to this alias so an import that no chain ever
          // reaches — an unrelated `Timestamp`, or a type argument the walk
          // never descends into — grants no amnesty.
          let leavesModule = false;

          const isImportedBinding = (name: string): boolean => {
            type ScopeType = ReturnType<typeof context.getScope>;
            let scope: ScopeType | null = context.getScope();

            while (scope) {
              const variable = scope.variables.find(
                (variableNode) => variableNode.name === name,
              );
              if (variable) {
                return variable.defs.some((definition) =>
                  IMPORT_BINDING_NODE_TYPES.has(definition.node.type),
                );
              }
              scope = scope.upper as ScopeType | null;
            }

            return false;
          };

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

                // The name is bound, but only to something this file cannot
                // see through: an import. Record that the chain crossed the
                // module boundary so the caller distinguishes "proved no
                // Identifiable" from "could not look". A name with no binding
                // at all (a lib global such as `Readonly` or `Map`) is left
                // alone: those are known not to be Identifiable-bearing
                // aliases, and treating them as unknown would silence the
                // rule almost everywhere.
                if (
                  variable.defs.some((definition) =>
                    IMPORT_BINDING_NODE_TYPES.has(definition.node.type),
                  )
                ) {
                  leavesModule = true;
                }
              }
              scope = scope.upper as ScopeType | null;
            }

            return null;
          };

          // `Types.Team` from `import * as Types from '../Team'` names a type
          // in another module just as `Team` from a named import does, but it
          // carries a TSQualifiedName that the walks below never resolve. The
          // leftmost identifier is the namespace binding, so it answers the
          // same question: did the chain leave this file?
          const noteQualifiedNamespaceImport = (
            qualifiedName: TSESTree.TSQualifiedName,
          ): void => {
            let left: TSESTree.EntityName = qualifiedName.left;

            while (left.type === AST_NODE_TYPES.TSQualifiedName) {
              left = left.left;
            }

            if (
              left.type === AST_NODE_TYPES.Identifier &&
              isImportedBinding(left.name)
            ) {
              leavesModule = true;
            }
          };

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
                const parenthesized =
                  current as unknown as ParenthesizedTypeNode;
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
                TRANSPARENT_TYPE_NAMES.has(typeName) &&
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
                TRANSPARENT_TYPE_NAMES.has(typeName) &&
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

            if (
              resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
              resolvedType.typeName.type === AST_NODE_TYPES.TSQualifiedName
            ) {
              noteQualifiedNamespaceImport(resolvedType.typeName);

              return false;
            }

            if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
              return resolvedType.types.some((part) =>
                checkType(part, new Set(visitedTypes)),
              );
            }

            return false;
          };

          matchingAliasHasIdentifiable = checkType(node.typeAnnotation);
          matchingAliasLeavesModule = leavesModule;
        }
      },
    };
  },
});
