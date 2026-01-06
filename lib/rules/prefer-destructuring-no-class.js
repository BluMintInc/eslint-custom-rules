"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferDestructuringNoClass = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = [
    {
        object: true,
        enforceForRenamedProperties: false,
    },
];
function isClassInstance(node, context) {
    // Check if node is a MemberExpression
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        const object = node.object;
        // If object is a NewExpression, it's a class instance
        if (object.type === utils_1.AST_NODE_TYPES.NewExpression) {
            return true;
        }
        // If object is an identifier, check if it refers to a class instance
        if (object.type === utils_1.AST_NODE_TYPES.Identifier) {
            const variable = object.name;
            const scope = context.getScope();
            const ref = scope.references.find((ref) => ref.identifier.name === variable);
            if (ref?.resolved?.defs[0]?.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                const init = ref.resolved.defs[0].node.init;
                return init?.type === utils_1.AST_NODE_TYPES.NewExpression;
            }
            // Check if the identifier refers to a class (not an instance)
            if (ref?.resolved?.defs[0]?.node.type === utils_1.AST_NODE_TYPES.ClassDeclaration) {
                return false;
            }
        }
        // Recursively check if parent object is a class instance
        if (object.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            return isClassInstance(object, context);
        }
    }
    return false;
}
function isStaticClassMember(node, context) {
    if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        const object = node.object;
        if (object.type === utils_1.AST_NODE_TYPES.Identifier) {
            const variable = object.name;
            const scope = context.getScope();
            const ref = scope.references.find((ref) => ref.identifier.name === variable);
            return (ref?.resolved?.defs[0]?.node.type === utils_1.AST_NODE_TYPES.ClassDeclaration);
        }
    }
    return false;
}
/**
 * Check if the property name matches the variable name in an assignment
 */
function isMatchingPropertyName(propertyNode, variableName) {
    if (propertyNode.type === utils_1.AST_NODE_TYPES.Identifier) {
        return propertyNode.name === variableName;
    }
    if (propertyNode.type === utils_1.AST_NODE_TYPES.Literal) {
        return propertyNode.value === variableName;
    }
    return false;
}
/**
 * Get the property text for destructuring
 */
function getPropertyText(property, computed, sourceCode) {
    if (computed) {
        return sourceCode.getText(property);
    }
    if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return property.name;
    }
    if (property.type === utils_1.AST_NODE_TYPES.Literal) {
        return String(property.value);
    }
    // For any other type, use the source text
    return sourceCode.getText(property);
}
exports.preferDestructuringNoClass = (0, createRule_1.createRule)({
    name: 'prefer-destructuring-no-class',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce destructuring when accessing object properties, except for class instances',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    object: {
                        type: 'boolean',
                        default: true,
                    },
                    enforceForRenamedProperties: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            preferDestructuring: 'Property "{{property}}" from "{{object}}" is assigned via dot access{{targetNote}}. Destructure the property so the dependency is declared once and stays aligned with the source object. Use destructuring{{renamingHint}} (e.g., {{example}}).',
        },
    },
    defaultOptions,
    create(context) {
        const options = {
            object: defaultOptions[0].object,
            enforceForRenamedProperties: defaultOptions[0].enforceForRenamedProperties,
            ...context.options[0],
        };
        const sourceCode = context.getSourceCode();
        /**
         * Check if we're inside a class method
         */
        function isInsideClassMethod(node) {
            let current = node;
            // Traverse up the AST to find a MethodDefinition
            while (current && current.parent) {
                current = current.parent;
                if (current.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                    return true;
                }
            }
            return false;
        }
        function isIdentifierTarget(node) {
            return node.type === utils_1.AST_NODE_TYPES.Identifier;
        }
        function isSkippedClassMemberAccess(memberExpression) {
            return (isClassInstance(memberExpression, context) ||
                isStaticClassMember(memberExpression, context));
        }
        function isThisMemberInClassMethod(memberExpression) {
            return (memberExpression.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                isInsideClassMethod(memberExpression));
        }
        function findEnclosingMethodDefinition(node) {
            let current = node;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
                    return current;
                }
                current = current.parent ?? undefined;
            }
            return null;
        }
        function isInsideConstructorBody(node) {
            let current = node;
            while (current) {
                if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                    current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    const enclosingMethod = findEnclosingMethodDefinition(current);
                    return (!!enclosingMethod &&
                        enclosingMethod.kind === 'constructor' &&
                        enclosingMethod.value === current);
                }
                current = current.parent ?? undefined;
            }
            return false;
        }
        function isPrivateIdentifierProperty(property) {
            return property.type === utils_1.AST_NODE_TYPES.PrivateIdentifier;
        }
        function canDestructureObjectProperty(memberExpression, identifier) {
            if (isPrivateIdentifierProperty(memberExpression.property)) {
                return false;
            }
            if (!options.object) {
                return false;
            }
            if (options.enforceForRenamedProperties) {
                return true;
            }
            return isMatchingPropertyName(memberExpression.property, identifier.name);
        }
        function getPatternKeyText(memberExpression, propertyText) {
            if (memberExpression.computed) {
                return `[${sourceCode.getText(memberExpression.property)}]`;
            }
            return propertyText;
        }
        function getDestructuringBindingText(memberExpression, propertyText, targetName) {
            if (isPrivateIdentifierProperty(memberExpression.property)) {
                return null;
            }
            const patternKeyText = getPatternKeyText(memberExpression, propertyText);
            if (memberExpression.computed ||
                (options.enforceForRenamedProperties &&
                    !isMatchingPropertyName(memberExpression.property, targetName))) {
                return `${patternKeyText}: ${targetName}`;
            }
            return patternKeyText;
        }
        /**
         * Check if destructuring should be used for this node
         */
        function shouldUseDestructuring(node, leftNode) {
            if (!isIdentifierTarget(leftNode)) {
                return false;
            }
            return (!isSkippedClassMemberAccess(node) &&
                !isThisMemberInClassMethod(node) &&
                canDestructureObjectProperty(node, leftNode));
        }
        /**
         * Extracts the property name from a MemberExpression when it can be safely compared.
         */
        function getMemberExpressionPropertyName(memberExpression) {
            if (isPrivateIdentifierProperty(memberExpression.property)) {
                return null;
            }
            if (!memberExpression.computed) {
                if (memberExpression.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    return memberExpression.property.name;
                }
                return null;
            }
            if (memberExpression.property.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof memberExpression.property.value === 'string') {
                return memberExpression.property.value;
            }
            return null;
        }
        /**
         * Look up a variable by name within a scope.
         */
        function findVariableInScope(scope, name) {
            return scope?.variables.find((variable) => variable.name === name);
        }
        /**
         * Check whether a variable definition originates from a parameter.
         */
        function isParameterDefinition(variable) {
            if (!variable || !Array.isArray(variable.defs)) {
                return false;
            }
            return variable.defs.some((definition) => definition.type === 'Parameter');
        }
        /**
         * Determine whether an identifier refers to a function or method parameter.
         */
        function isFunctionParameter(identifier) {
            let scope = context.getScope();
            while (scope) {
                const variable = findVariableInScope(scope, identifier.name);
                if (variable) {
                    return isParameterDefinition(variable);
                }
                scope = scope.upper;
            }
            return false;
        }
        function buildReportDetails(memberExpr, targetName, examplePrefix, exampleSuffix) {
            const objectText = sourceCode.getText(memberExpr.object);
            const propertyText = getPropertyText(memberExpr.property, memberExpr.computed, sourceCode);
            const usesRenaming = options.enforceForRenamedProperties &&
                !!targetName &&
                !isMatchingPropertyName(memberExpr.property, targetName);
            const aliasName = targetName ?? propertyText;
            const patternKeyText = getPatternKeyText(memberExpr, propertyText);
            const destructuringBinding = getDestructuringBindingText(memberExpr, propertyText, aliasName) ??
                patternKeyText;
            return {
                propertyText,
                objectText,
                destructuringBinding,
                data: {
                    property: propertyText,
                    object: objectText,
                    targetNote: usesRenaming && targetName ? ` to "${targetName}"` : '',
                    renamingHint: usesRenaming ? ' with renaming' : '',
                    example: usesRenaming
                        ? `${examplePrefix}{ ${destructuringBinding} } = ${objectText}${exampleSuffix}`
                        : `${examplePrefix}{ ${destructuringBinding} } = ${objectText}${exampleSuffix}`,
                },
            };
        }
        function generateVariableDeclaratorFix(fixer, node, propertyText, objectText, memberExpr) {
            const parentNode = node.parent;
            if (!parentNode ||
                parentNode.type !== utils_1.AST_NODE_TYPES.VariableDeclaration) {
                return null;
            }
            if (parentNode.declarations.length > 1) {
                return null;
            }
            const kind = parentNode.kind;
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return null;
            }
            const destructuringBinding = getDestructuringBindingText(memberExpr, propertyText, node.id.name);
            if (!destructuringBinding) {
                return null;
            }
            return fixer.replaceText(parentNode, `${kind} { ${destructuringBinding} } = ${objectText};`);
        }
        function generateAssignmentExpressionFix(fixer, node, propertyText, objectText, memberExpr) {
            if (node.left.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return null;
            }
            const destructuringBinding = getDestructuringBindingText(memberExpr, propertyText, node.left.name);
            if (!destructuringBinding) {
                return null;
            }
            return fixer.replaceText(node, `({ ${destructuringBinding} } = ${objectText})`);
        }
        /**
         * Report assignments that copy properties from parameter objects to class fields.
         * These are reported without a fixer to avoid changing function signatures.
         */
        function handleClassPropertyAssignment(node) {
            // Caller ensures node.right is a MemberExpression.
            if (!options.object ||
                node.left.type !== utils_1.AST_NODE_TYPES.MemberExpression ||
                node.left.object.type !== utils_1.AST_NODE_TYPES.ThisExpression) {
                return;
            }
            if (!isInsideConstructorBody(node)) {
                return;
            }
            const rightObject = node.right.object;
            if (rightObject.type !== utils_1.AST_NODE_TYPES.Identifier ||
                !isFunctionParameter(rightObject)) {
                return;
            }
            const leftPropertyName = getMemberExpressionPropertyName(node.left);
            const rightPropertyName = getMemberExpressionPropertyName(node.right);
            if (!leftPropertyName || !rightPropertyName) {
                return;
            }
            if (!options.enforceForRenamedProperties &&
                leftPropertyName !== rightPropertyName) {
                return;
            }
            if (isClassInstance(node.right, context) ||
                isStaticClassMember(node.right, context)) {
                return;
            }
            const { data } = buildReportDetails(node.right, leftPropertyName, '(', ')');
            // No fixer here because destructuring parameters changes the function signature and must stay manual.
            context.report({
                node,
                messageId: 'preferDestructuring',
                data,
            });
        }
        return {
            VariableDeclarator(node) {
                // Skip if variable is declared without assignment or if init is not a MemberExpression
                if (!node.init)
                    return;
                if (node.init.type !== utils_1.AST_NODE_TYPES.MemberExpression)
                    return;
                const memberInit = node.init;
                if (!shouldUseDestructuring(memberInit, node.id)) {
                    return;
                }
                const targetName = node.id.type === utils_1.AST_NODE_TYPES.Identifier ? node.id.name : null;
                const { propertyText, objectText, data } = buildReportDetails(memberInit, targetName, `${node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclaration
                    ? node.parent.kind
                    : 'const'} `, ';');
                context.report({
                    node,
                    messageId: 'preferDestructuring',
                    data,
                    fix(fixer) {
                        return generateVariableDeclaratorFix(fixer, node, propertyText, objectText, memberInit);
                    },
                });
            },
            AssignmentExpression(node) {
                if (node.operator !== '=' ||
                    node.right.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                    return;
                }
                const memberRight = node.right;
                if (shouldUseDestructuring(memberRight, node.left)) {
                    const targetName = node.left.type === utils_1.AST_NODE_TYPES.Identifier
                        ? node.left.name
                        : null;
                    const { propertyText, objectText, data } = buildReportDetails(memberRight, targetName, '(', ')');
                    context.report({
                        node,
                        messageId: 'preferDestructuring',
                        data,
                        fix(fixer) {
                            return generateAssignmentExpressionFix(fixer, node, propertyText, objectText, memberRight);
                        },
                    });
                    return;
                }
                handleClassPropertyAssignment(node);
            },
        };
    },
});
//# sourceMappingURL=prefer-destructuring-no-class.js.map