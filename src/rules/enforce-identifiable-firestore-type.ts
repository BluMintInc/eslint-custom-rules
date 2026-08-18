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

// The folder-matching declaration may be spelled either way: `type X =
// Identifiable & {...}` and `interface X extends Identifiable {...}` publish the
// same document shape, and `extends Identifiable` is precisely what the
// notExtendingIdentifiable message prescribes, so both have to satisfy the rule.
type IdentityDeclaration =
  | TSESTree.TSTypeAliasDeclaration
  | TSESTree.TSInterfaceDeclaration;

const membersDeclareIdString = (
  members: readonly TSESTree.TypeElement[],
): boolean =>
  members.some(
    (member) =>
      member.type === AST_NODE_TYPES.TSPropertySignature &&
      member.key.type === AST_NODE_TYPES.Identifier &&
      member.key.name === 'id' &&
      member.typeAnnotation?.typeAnnotation.type ===
        AST_NODE_TYPES.TSStringKeyword,
  );

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
      // Every spelling named here must clear the rule; a message that
      // prescribes a remedy the rule then reports on is unfollowable (#2035).
      missingType:
        'Expected exported type "{{ typeName }}" in index.ts under folder "{{ folderName }}". Create a type that matches the folder name: `export type {{ typeName }} = { id: string; /* other fields */ }`.',
      notExtendingIdentifiable:
        'Type "{{ typeName }}" must carry an `id` field so every Firestore document is identifiable. Intersect Identifiable (`export type {{ typeName }} = Identifiable & { /* other fields */ }`), extend it (`export interface {{ typeName }} extends Identifiable { /* other fields */ }`), or declare the field inline (`export type {{ typeName }} = { id: string; /* other fields */ }`).',
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
    // The folder-matching declaration only satisfies the rule if it is
    // reachable by consumers. It can be exported inline (`export type X = ...`)
    // or separately (`export { X }` / `export type { X }`), and the separate
    // form can appear either before or after the declaration, so exportedness
    // can't be decided inside the declaration visitor alone — it's resolved once
    // the whole module has been scanned, in Program:exit.
    let matchingDeclarationNode: IdentityDeclaration | null = null;
    let matchingDeclarationInlineExported = false;
    let matchingDeclarationProvidesId = false;
    // Set when resolving the matching declaration runs into a type that is
    // declared in another module. Such a type is opaque to this single-file
    // walk, so the absence of an id is unproven rather than disproven.
    let matchingDeclarationLeavesModule = false;
    const locallyExportedNames = new Set<string>();

    // Interfaces merge, so a second declaration of the same name adds to the
    // first rather than replacing it; accumulating with OR keeps every arm that
    // any declaration of the name satisfies.
    const analyzeMatchingDeclaration = (node: IdentityDeclaration): void => {
      // Raised by the resolution walks below whenever a referenced type name
      // resolves to an imported binding, i.e. the chain ran out of this file.
      // Scoped to this declaration so an import that no chain ever reaches — an
      // unrelated `Timestamp`, or a type argument the walk never descends into
      // — grants no amnesty.
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

      const findLocalDeclaration = (
        typeName: string,
      ): IdentityDeclaration | null => {
        type ScopeType = ReturnType<typeof context.getScope>;
        let scope: ScopeType | null = context.getScope();

        while (scope) {
          const variable = scope.variables.find(
            (variableNode) => variableNode.name === typeName,
          );
          if (variable) {
            const definition = variable.defs.find(
              (candidate) =>
                candidate.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
                candidate.node.type === AST_NODE_TYPES.TSInterfaceDeclaration,
            );
            if (definition) {
              return definition.node as IdentityDeclaration;
            }

            // The name is bound, but only to something this file cannot see
            // through: an import. Record that the chain crossed the module
            // boundary so the caller distinguishes "proved no id" from "could
            // not look". A name with no binding at all (a lib global such as
            // `Readonly` or `Map`) is left alone: those are known not to be
            // Identifiable-bearing declarations, and treating them as unknown
            // would silence the rule almost everywhere.
            if (
              variable.defs.some((candidate) =>
                IMPORT_BINDING_NODE_TYPES.has(candidate.node.type),
              )
            ) {
              leavesModule = true;
            }
          }
          scope = scope.upper as ScopeType | null;
        }

        return null;
      };

      // `Types.Team` from `import * as Types from '../Team'` names a type in
      // another module just as `Team` from a named import does, but it carries a
      // TSQualifiedName (in a type position) or a MemberExpression (in an
      // interface heritage clause) that the walks below never resolve. The
      // leftmost identifier is the namespace binding, so it answers the same
      // question: did the chain leave this file?
      // ESTree wraps `Types?.Team` in a ChainExpression, so the walk has to see
      // through that wrapper as well or the optional spelling loses the amnesty
      // the plain one gets.
      const noteImportedNamespace = (root: TSESTree.Node): void => {
        let leftmost: TSESTree.Node = root;

        while (
          leftmost.type === AST_NODE_TYPES.TSQualifiedName ||
          leftmost.type === AST_NODE_TYPES.MemberExpression ||
          leftmost.type === AST_NODE_TYPES.ChainExpression
        ) {
          if (leftmost.type === AST_NODE_TYPES.ChainExpression) {
            leftmost = leftmost.expression;
            continue;
          }

          leftmost =
            leftmost.type === AST_NODE_TYPES.TSQualifiedName
              ? leftmost.left
              : leftmost.object;
        }

        if (
          leftmost.type === AST_NODE_TYPES.Identifier &&
          isImportedBinding(leftmost.name)
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
      ): boolean => (node as { type?: string })?.type === 'TSParenthesizedType';

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

        // A resolved name lands on the declaration itself, so both declaration
        // kinds are walked here rather than at every call site.
        if (resolvedType.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          return findIdentifiable(resolvedType.typeAnnotation, checkedTypes);
        }

        if (resolvedType.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          return (resolvedType.extends ?? []).some((heritage) =>
            findIdentifiable(heritage, new Set(checkedTypes)),
          );
        }

        const referencedName =
          resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
          resolvedType.typeName.type === AST_NODE_TYPES.Identifier
            ? resolvedType.typeName.name
            : resolvedType.type === AST_NODE_TYPES.TSInterfaceHeritage &&
              resolvedType.expression.type === AST_NODE_TYPES.Identifier
            ? resolvedType.expression.name
            : null;

        if (referencedName !== null) {
          if (referencedName === 'Identifiable') {
            return true;
          }

          if (
            TRANSPARENT_TYPE_NAMES.has(referencedName) &&
            (
              resolvedType as {
                typeParameters?: { params?: TSESTree.TypeNode[] };
              }
            ).typeParameters?.params?.some((param) =>
              findIdentifiable(param, checkedTypes),
            )
          ) {
            return true;
          }

          if (checkedTypes.has(referencedName)) {
            return false;
          }

          checkedTypes.add(referencedName);

          return findIdentifiable(
            findLocalDeclaration(referencedName),
            checkedTypes,
          );
        }

        // A heritage clause that is not a bare name is a namespace-qualified
        // one (`Types.Team`, or its optional-chained spelling), which names a
        // type this file cannot see through.
        if (resolvedType.type === AST_NODE_TYPES.TSInterfaceHeritage) {
          noteImportedNamespace(resolvedType.expression);

          return false;
        }

        if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
          return resolvedType.types.some((part) =>
            findIdentifiable(part, new Set(checkedTypes)),
          );
        }

        return false;
      };

      // Whether the type declares `id: string` itself. The
      // notExtendingIdentifiable message offers this as an alternative to
      // Identifiable, and it delivers exactly what the rule exists to
      // guarantee — the document's ID field — so it satisfies the rule wherever
      // it appears, not only under a `Resolve<>` wrapper.
      const declaresIdField = (
        type: TSESTree.Node | null | undefined,
        visitedTypes = new Set<string>(),
      ): boolean => {
        const resolvedType = unwrapTransparentType(type);

        if (!resolvedType) {
          return false;
        }

        if (resolvedType.type === AST_NODE_TYPES.TSTypeLiteral) {
          return membersDeclareIdString(resolvedType.members);
        }

        if (resolvedType.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          return declaresIdField(resolvedType.typeAnnotation, visitedTypes);
        }

        if (resolvedType.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          return (
            membersDeclareIdString(resolvedType.body.body) ||
            (resolvedType.extends ?? []).some((heritage) =>
              declaresIdField(heritage, new Set(visitedTypes)),
            )
          );
        }

        if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
          return resolvedType.types.some((part) =>
            declaresIdField(part, new Set(visitedTypes)),
          );
        }

        const referencedName =
          resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
          resolvedType.typeName.type === AST_NODE_TYPES.Identifier
            ? resolvedType.typeName.name
            : resolvedType.type === AST_NODE_TYPES.TSInterfaceHeritage &&
              resolvedType.expression.type === AST_NODE_TYPES.Identifier
            ? resolvedType.expression.name
            : null;

        if (referencedName === null) {
          return false;
        }

        if (referencedName === 'Identifiable') {
          return true;
        }

        if (
          TRANSPARENT_TYPE_NAMES.has(referencedName) &&
          (
            resolvedType as {
              typeParameters?: { params?: TSESTree.TypeNode[] };
            }
          ).typeParameters?.params?.some((param) =>
            declaresIdField(param, visitedTypes),
          )
        ) {
          return true;
        }

        if (visitedTypes.has(referencedName)) {
          return false;
        }

        visitedTypes.add(referencedName);

        return declaresIdField(
          findLocalDeclaration(referencedName),
          visitedTypes,
        );
      };

      // Recursively check the declaration, its alias chain and its parameters
      const providesId = (
        type: TSESTree.Node | null | undefined,
        visitedTypes = new Set<string>(),
      ): boolean => {
        const resolvedType = unwrapTransparentType(type);

        if (!resolvedType) {
          return false;
        }

        if (findIdentifiable(resolvedType) || declaresIdField(resolvedType)) {
          return true;
        }

        if (resolvedType.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          return providesId(resolvedType.typeAnnotation, visitedTypes);
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

          return providesId(findLocalDeclaration(typeName), visitedTypes);
        }

        if (
          resolvedType.type === AST_NODE_TYPES.TSTypeReference &&
          resolvedType.typeName.type === AST_NODE_TYPES.TSQualifiedName
        ) {
          noteImportedNamespace(resolvedType.typeName);

          return false;
        }

        if (resolvedType.type === AST_NODE_TYPES.TSIntersectionType) {
          return resolvedType.types.some((part) =>
            providesId(part, new Set(visitedTypes)),
          );
        }

        return false;
      };

      matchingDeclarationNode = node;
      matchingDeclarationInlineExported =
        matchingDeclarationInlineExported ||
        node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        node.parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration;
      matchingDeclarationProvidesId =
        matchingDeclarationProvidesId || providesId(node);
      matchingDeclarationLeavesModule =
        matchingDeclarationLeavesModule || leavesModule;
    };

    return {
      Program() {
        // Reset flags for each file
        matchingDeclarationNode = null;
        matchingDeclarationInlineExported = false;
        matchingDeclarationProvidesId = false;
        matchingDeclarationLeavesModule = false;
        locallyExportedNames.clear();
      },
      'Program:exit'(node) {
        const hasExpectedType =
          matchingDeclarationNode !== null &&
          (matchingDeclarationInlineExported ||
            locallyExportedNames.has(folderName));

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
          !matchingDeclarationProvidesId &&
          !matchingDeclarationLeavesModule
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
        // from another module, not the local declaration in this file, so it
        // must never satisfy the gate.
        if (node.source != null) {
          return;
        }

        for (const specifier of node.specifiers) {
          locallyExportedNames.add(specifier.local.name);
        }
      },
      TSTypeAliasDeclaration(node) {
        if (node.id.name === folderName) {
          analyzeMatchingDeclaration(node);
        }
      },
      TSInterfaceDeclaration(node) {
        if (node.id.name === folderName) {
          analyzeMatchingDeclaration(node);
        }
      },
    };
  },
});
