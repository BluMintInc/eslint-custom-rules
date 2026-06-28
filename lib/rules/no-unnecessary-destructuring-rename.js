"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnnecessaryDestructuringRename = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ASTHelpers_1 = require("../utils/ASTHelpers");
const BINDABLE_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_BINDINGS = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'let',
    'await',
    'static',
    'implements',
    'interface',
    'package',
    'private',
    'protected',
    'public',
]);
function isBindableIdentifier(name) {
    return BINDABLE_IDENTIFIER_PATTERN.test(name) && !RESERVED_BINDINGS.has(name);
}
function hasIdentifierKey(property) {
    return !property.computed && property.key.type === utils_1.AST_NODE_TYPES.Identifier;
}
function extractAliasFromIdentifierValue(value, originalName) {
    if (value.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    if (value.name === originalName) {
        return null;
    }
    return value;
}
function extractAliasFromAssignmentPattern(value, originalName) {
    if (value.type !== utils_1.AST_NODE_TYPES.AssignmentPattern) {
        return null;
    }
    if (value.left.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    if (value.left.name === originalName) {
        return null;
    }
    return value.left;
}
function getRenamedPropertyInfo(property) {
    if (!hasIdentifierKey(property)) {
        return null;
    }
    const originalName = property.key.name;
    const identifierAlias = extractAliasFromIdentifierValue(property.value, originalName);
    if (identifierAlias) {
        return { originalName, aliasIdentifier: identifierAlias };
    }
    const assignmentAlias = extractAliasFromAssignmentPattern(property.value, originalName);
    if (assignmentAlias) {
        return { originalName, aliasIdentifier: assignmentAlias };
    }
    return null;
}
exports.noUnnecessaryDestructuringRename = (0, createRule_1.createRule)({
    name: 'no-unnecessary-destructuring-rename',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow destructuring renames that are only used to assign back to the original property name',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            unnecessaryDestructuringRename: 'Renaming "{{originalName}}" to "{{aliasName}}" only to write it back as "{{originalName}}" adds indirection without value. Keep the original name in the destructuring or reference the property directly to reduce cognitive overhead.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const candidates = [];
        const getDeclaredVariables = (node) => {
            return ASTHelpers_1.ASTHelpers.getDeclaredVariables(context, node);
        };
        function collectDeclaredVariablesUpTree(node) {
            const variables = [];
            let currentNode = node;
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
        function captureCandidates(pattern) {
            const declaredVariables = collectDeclaredVariablesUpTree(pattern);
            for (const property of pattern.properties) {
                if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                    continue;
                }
                const renameInfo = getRenamedPropertyInfo(property);
                if (!renameInfo) {
                    continue;
                }
                if (!isBindableIdentifier(renameInfo.originalName)) {
                    continue;
                }
                const variable = declaredVariables.find((declaredVar) => declaredVar.identifiers.includes(renameInfo.aliasIdentifier));
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
        function findMatchingReference(reference, originalName) {
            const identifier = reference.identifier;
            const parent = identifier.parent;
            if (!parent ||
                parent.type !== utils_1.AST_NODE_TYPES.Property ||
                parent.value !== identifier ||
                parent.computed ||
                parent.key.type !== utils_1.AST_NODE_TYPES.Identifier ||
                parent.key.name !== originalName) {
                return null;
            }
            const grandParent = parent.parent;
            if (!grandParent ||
                grandParent.type !== utils_1.AST_NODE_TYPES.ObjectExpression) {
                return null;
            }
            return parent;
        }
        function scopeHasNameInChain(scope, stopScope, name) {
            let currentScope = scope;
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
        function referencesNameWithoutLocalBinding(scope, name) {
            const scopesToCheck = [scope];
            while (scopesToCheck.length > 0) {
                const currentScope = scopesToCheck.pop();
                if (!currentScope.set.has(name)) {
                    const hasReference = currentScope.references.some((reference) => reference.identifier.name === name) ||
                        currentScope.through.some((reference) => reference.identifier.name === name);
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
        function isSafeToInlineOriginal(reference, variable, originalName) {
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
        function getMatchingReferences(variable, originalName) {
            const matchingReferences = [];
            for (const reference of variable.references) {
                const property = findMatchingReference(reference, originalName);
                if (property) {
                    matchingReferences.push({ reference, property });
                }
            }
            return matchingReferences;
        }
        function hasOtherUsages(variable, matchedReference) {
            return variable.references.some((ref) => {
                if (ref === matchedReference) {
                    return false;
                }
                // Ignore the initializer write introduced by the destructuring itself.
                if (ref.init && ref.isWrite() && !ref.isRead()) {
                    return false;
                }
                return (ref.isRead() ||
                    ref.isWrite() ||
                    // Type references indicate another use even if not a runtime read.
                    ref.isTypeReference ===
                        true);
            });
        }
        function resolveValidCandidates() {
            const resolvedCandidates = [];
            for (const candidate of candidates) {
                const { variable, originalName, aliasIdentifier, propertyNode } = candidate;
                const matchingReferences = getMatchingReferences(variable, originalName);
                if (matchingReferences.length !== 1) {
                    continue;
                }
                const [{ reference: matchedReference, property: targetProperty }] = matchingReferences;
                if (!isSafeToInlineOriginal(matchedReference, variable, originalName)) {
                    continue;
                }
                if (hasOtherUsages(variable, matchedReference)) {
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
            return resolvedCandidates;
        }
        function removeScopeConflicts(resolvedCandidates) {
            const countsByScope = new Map();
            for (const candidate of resolvedCandidates) {
                const scope = candidate.variable.scope;
                const scopeCounts = countsByScope.get(scope) ?? new Map();
                scopeCounts.set(candidate.originalName, (scopeCounts.get(candidate.originalName) ?? 0) + 1);
                countsByScope.set(scope, scopeCounts);
            }
            return resolvedCandidates.filter((candidate) => {
                const scopeCounts = countsByScope.get(candidate.variable.scope);
                return (scopeCounts?.get(candidate.originalName) ?? 0) === 1;
            });
        }
        function groupCandidatesByPattern(resolvedCandidates) {
            const candidatesByPattern = new Map();
            for (const candidate of resolvedCandidates) {
                const pattern = candidate.propertyNode.parent;
                const existing = candidatesByPattern.get(pattern);
                if (existing) {
                    existing.push(candidate);
                }
                else {
                    candidatesByPattern.set(pattern, [candidate]);
                }
            }
            return candidatesByPattern;
        }
        function generateFixes(fixer, patternCandidates) {
            const fixes = [];
            for (const groupCandidate of patternCandidates) {
                const { propertyNode: groupedProperty, targetProperty: groupedTarget, originalName: groupedOriginal, } = groupCandidate;
                const destructReplacement = groupedProperty.value.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                    groupedProperty.value.left.type === utils_1.AST_NODE_TYPES.Identifier
                    ? `${groupedOriginal} = ${sourceCode.getText(groupedProperty.value.right)}`
                    : groupedOriginal;
                fixes.push(fixer.replaceText(groupedProperty, destructReplacement));
                // findMatchingReference constrains groupedTarget.value to the matched identifier,
                // so replacing it directly avoids extra defensive branching in the fixer.
                fixes.push(fixer.replaceText(groupedTarget.value, groupedOriginal));
            }
            return fixes;
        }
        function reportAndFixCandidates(candidatesByPattern) {
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
                            : (fixer) => generateFixes(fixer, patternCandidates),
                    });
                });
            }
        }
        return {
            ObjectPattern(node) {
                captureCandidates(node);
            },
            'Program:exit'() {
                const resolvedCandidates = resolveValidCandidates();
                const conflictFreeCandidates = removeScopeConflicts(resolvedCandidates);
                const candidatesByPattern = groupCandidatesByPattern(conflictFreeCandidates);
                reportAndFixCandidates(candidatesByPattern);
            },
        };
    },
});
//# sourceMappingURL=no-unnecessary-destructuring-rename.js.map