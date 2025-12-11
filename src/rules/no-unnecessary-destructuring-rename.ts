import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'unnecessaryDestructuringRename';

type RenameCandidate = {
  propertyNode: TSESTree.Property;
  originalName: string;
  aliasIdentifier: TSESTree.Identifier;
  variable: TSESLint.Scope.Variable;
};

type ResolvedCandidate = RenameCandidate & {
  targetProperty: TSESTree.Property;
  reference: TSESLint.Scope.Reference;
};

function getRenamedPropertyInfo(
  property: TSESTree.Property,
): { originalName: string; aliasIdentifier: TSESTree.Identifier } | null {
  if (property.computed || property.key.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const originalName = property.key.name;

  if (property.value.type === AST_NODE_TYPES.Identifier) {
    if (property.value.name === originalName) {
      return null;
    }
    return { originalName, aliasIdentifier: property.value };
  }

  if (
    property.value.type === AST_NODE_TYPES.AssignmentPattern &&
    property.value.left.type === AST_NODE_TYPES.Identifier
  ) {
    if (property.value.left.name === originalName) {
      return null;
    }
    return { originalName, aliasIdentifier: property.value.left };
  }

  return null;
}

export const noUnnecessaryDestructuringRename = createRule<[], MessageIds>({
  name: 'no-unnecessary-destructuring-rename',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow destructuring renames that are only used to assign back to the original property name',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryDestructuringRename:
        'Renaming "{{originalName}}" to "{{aliasName}}" only to write it back as "{{originalName}}" adds indirection without value. Keep the original name in the destructuring or reference the property directly to reduce cognitive overhead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const candidates: RenameCandidate[] = [];

    const getDeclaredVariables = (
      node: TSESTree.Node,
    ): readonly TSESLint.Scope.Variable[] => {
      const sourceCodeWithDeclarations = sourceCode as unknown as {
        getDeclaredVariables?: (
          target: TSESTree.Node,
        ) => TSESLint.Scope.Variable[];
      };

      if (typeof sourceCodeWithDeclarations.getDeclaredVariables === 'function') {
        return sourceCodeWithDeclarations.getDeclaredVariables(node);
      }

      return context.getDeclaredVariables(node);
    };

    function collectDeclaredVariablesUpTree(
      node: TSESTree.Node | null,
    ): TSESLint.Scope.Variable[] {
      const variables: TSESLint.Scope.Variable[] = [];
      let currentNode: TSESTree.Node | null = node;

      while (currentNode) {
        for (const variable of getDeclaredVariables(currentNode)) {
          if (!variables.includes(variable)) {
            variables.push(variable);
          }
        }

        currentNode = currentNode.parent ?? null;
      }

      return variables;
    }

    function captureCandidates(pattern: TSESTree.ObjectPattern): void {
      const declaredVariables = collectDeclaredVariablesUpTree(pattern);

      for (const property of pattern.properties) {
        if (property.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        const renameInfo = getRenamedPropertyInfo(property);
        if (!renameInfo) {
          continue;
        }

        const variable = declaredVariables.find((declaredVar) =>
          declaredVar.identifiers.includes(renameInfo.aliasIdentifier),
        );
        if (!variable) {
          continue;
        }

        candidates.push({
          propertyNode: property,
          originalName: renameInfo.originalName,
          aliasIdentifier: renameInfo.aliasIdentifier,
          variable,
        });
      }
    }

    function findMatchingReference(
      reference: TSESLint.Scope.Reference,
      originalName: string,
    ): TSESTree.Property | null {
      const identifier = reference.identifier;
      const parent = identifier.parent;

      if (
        !parent ||
        parent.type !== AST_NODE_TYPES.Property ||
        parent.value !== identifier ||
        parent.computed ||
        parent.key.type !== AST_NODE_TYPES.Identifier ||
        parent.key.name !== originalName
      ) {
        return null;
      }

      const grandParent = parent.parent;
      if (!grandParent || grandParent.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }

      return parent;
    }

    function scopeHasNameInChain(
      scope: TSESLint.Scope.Scope | null,
      stopScope: TSESLint.Scope.Scope,
      name: string,
    ): boolean {
      let currentScope: TSESLint.Scope.Scope | null = scope;

      while (currentScope) {
        if (currentScope.set.has(name)) {
          return true;
        }

        if (currentScope === stopScope) {
          break;
        }

        currentScope = currentScope.upper;
      }

      return false;
    }

    function referencesNameWithoutLocalBinding(
      scope: TSESLint.Scope.Scope,
      name: string,
    ): boolean {
      const scopesToCheck: TSESLint.Scope.Scope[] = [scope];

      while (scopesToCheck.length > 0) {
        const currentScope = scopesToCheck.pop()!;

        if (!currentScope.set.has(name)) {
          const hasReference =
            currentScope.references.some(
              (reference) => reference.identifier.name === name,
            ) ||
            currentScope.through.some(
              (reference) => reference.identifier.name === name,
            );

          if (hasReference) {
            return true;
          }
        }

        for (const childScope of currentScope.childScopes) {
          if (!childScope.set.has(name)) {
            scopesToCheck.push(childScope);
          }
        }
      }

      return false;
    }

    function isSafeToInlineOriginal(
      reference: TSESLint.Scope.Reference,
      variable: TSESLint.Scope.Variable,
      originalName: string,
    ): boolean {
      const declarationScope = variable.scope;
      const referenceScope = reference.from ?? declarationScope;

      if (declarationScope.set.has(originalName)) {
        return false;
      }

      if (scopeHasNameInChain(referenceScope, declarationScope, originalName)) {
        return false;
      }

      return !referencesNameWithoutLocalBinding(declarationScope, originalName);
    }

    return {
      ObjectPattern(node) {
        captureCandidates(node);
      },

      'Program:exit'() {
        const resolvedCandidates: ResolvedCandidate[] = [];

        for (const candidate of candidates) {
          const { variable, originalName, aliasIdentifier, propertyNode } =
            candidate;

          const matchingReferences: Array<{
            reference: TSESLint.Scope.Reference;
            property: TSESTree.Property;
          }> = [];

          for (const reference of variable.references) {
            const property = findMatchingReference(reference, originalName);
            if (property) {
              matchingReferences.push({ reference, property });
            }
          }

          if (matchingReferences.length !== 1) {
            continue;
          }

          const [{ reference: matchedReference, property: targetProperty }] =
            matchingReferences;

          if (
            !isSafeToInlineOriginal(matchedReference, variable, originalName)
          ) {
            continue;
          }

          const hasOtherUsages = variable.references.some((ref) => {
            if (ref === matchedReference) {
              return false;
            }

            // Ignore the initializer write introduced by the destructuring itself.
            if (ref.init && ref.isWrite() && !ref.isRead()) {
              return false;
            }

            return (
              ref.isRead() ||
              ref.isWrite() ||
              // Type references indicate another use even if not a runtime read.
              (ref as unknown as { isTypeReference?: boolean })
                .isTypeReference === true
            );
          });

          if (hasOtherUsages) {
            continue;
          }

          resolvedCandidates.push({
            propertyNode,
            originalName,
            aliasIdentifier,
            variable,
            targetProperty,
            reference: matchedReference,
          });
        }

        const candidatesByPattern = new Map<
          TSESTree.ObjectPattern,
          ResolvedCandidate[]
        >();

        for (const candidate of resolvedCandidates) {
          const pattern = candidate.propertyNode
            .parent as TSESTree.ObjectPattern;
          const existing = candidatesByPattern.get(pattern);
          if (existing) {
            existing.push(candidate);
          } else {
            candidatesByPattern.set(pattern, [candidate]);
          }
        }

        for (const patternCandidates of candidatesByPattern.values()) {
          patternCandidates.forEach((candidate, index) => {
            const { propertyNode, originalName, aliasIdentifier } = candidate;
            const isFixCarrier = index === 0;

            context.report({
              node: propertyNode,
              messageId: 'unnecessaryDestructuringRename',
              data: {
                originalName,
                aliasName: aliasIdentifier.name,
              },
              fix: !isFixCarrier
                ? undefined
                : (fixer) => {
                    const fixes: TSESLint.RuleFix[] = [];

                    for (const groupCandidate of patternCandidates) {
                      const { propertyNode: groupedProperty, targetProperty: groupedTarget, originalName: groupedOriginal } =
                        groupCandidate;

                      const destructReplacement =
                        groupedProperty.value.type ===
                          AST_NODE_TYPES.AssignmentPattern &&
                        groupedProperty.value.left.type ===
                          AST_NODE_TYPES.Identifier
                          ? `${groupedOriginal} = ${sourceCode.getText(
                              groupedProperty.value.right,
                            )}`
                          : groupedOriginal;

                      fixes.push(
                        fixer.replaceText(groupedProperty, destructReplacement),
                      );

                      if (
                        groupedTarget.value.type === AST_NODE_TYPES.Identifier
                      ) {
                        fixes.push(
                          fixer.replaceText(
                            groupedTarget.value,
                            groupedOriginal,
                          ),
                        );
                      }
                    }

                    return fixes;
                  },
            });
          });
        }
      },
    };
  },
});
