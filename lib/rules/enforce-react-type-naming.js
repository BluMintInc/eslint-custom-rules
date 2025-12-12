"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceReactTypeNaming = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
// Types that should have lowercase variable names
const LOWERCASE_TYPES = ['ReactNode', 'JSX.Element'];
// Types that should have uppercase variable names
const UPPERCASE_TYPES = ['ComponentType', 'FC', 'FunctionComponent'];
const TARGET_TYPES = new Set([...LOWERCASE_TYPES, ...UPPERCASE_TYPES]);
exports.enforceReactTypeNaming = (0, createRule_1.createRule)({
    name: 'enforce-react-type-naming',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce naming conventions for React types',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            reactNodeShouldBeLowercase: 'Type "{{type}}" holds rendered output; start names with a lowercase letter (e.g., "{{suggestion}}") so it reads as a value rather than a component.',
            componentTypeShouldBeUppercase: 'Type "{{type}}" represents a component; start names with an uppercase letter (e.g., "{{suggestion}}") so JSX treats it as a component instead of a DOM tag.',
        },
    },
    defaultOptions: [],
    create(context) {
        /**
         * Checks if a string starts with an uppercase letter
         */
        function isUppercase(str) {
            return /^[A-Z]/.test(str);
        }
        /**
         * Converts a string to start with lowercase
         */
        function toLowercase(str) {
            if (!str)
                return str;
            return str.charAt(0).toLowerCase() + str.slice(1);
        }
        /**
         * Converts a string to start with uppercase
         */
        function toUppercase(str) {
            if (!str)
                return str;
            return str.charAt(0).toUpperCase() + str.slice(1);
        }
        /**
         * Builds a qualified name (e.g., JSX.Element) from a type reference
         */
        function getQualifiedName(typeName) {
            if (typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                return typeName.name;
            }
            if (typeName.type === utils_1.AST_NODE_TYPES.TSQualifiedName) {
                const left = typeName.left.type === utils_1.AST_NODE_TYPES.Identifier
                    ? typeName.left.name
                    : getQualifiedName(typeName.left);
                if (!left)
                    return null;
                return `${left}.${typeName.right.name}`;
            }
            return null;
        }
        /**
         * Extracts the React-related type name from a type annotation, unwrapping
         * unions/intersections, readonly/array wrappers, and generic wrappers.
         */
        function getTypeName(typeAnnotation) {
            if (!typeAnnotation)
                return null;
            const maybeParenthesized = typeAnnotation;
            if (maybeParenthesized.type === 'TSParenthesizedType') {
                return getTypeName(maybeParenthesized.typeAnnotation);
            }
            switch (typeAnnotation.type) {
                case utils_1.AST_NODE_TYPES.TSUnionType:
                case utils_1.AST_NODE_TYPES.TSIntersectionType: {
                    for (const inner of typeAnnotation.types) {
                        const name = getTypeName(inner);
                        if (name)
                            return name;
                    }
                    return null;
                }
                case utils_1.AST_NODE_TYPES.TSArrayType:
                    return getTypeName(typeAnnotation.elementType);
                case utils_1.AST_NODE_TYPES.TSTypeOperator:
                    return getTypeName(typeAnnotation.typeAnnotation);
                case utils_1.AST_NODE_TYPES.TSTypeReference: {
                    const qualified = getQualifiedName(typeAnnotation.typeName);
                    if (qualified && TARGET_TYPES.has(qualified)) {
                        return qualified;
                    }
                    const typeParams = typeAnnotation.typeParameters?.params ?? [];
                    for (const param of typeParams) {
                        const name = getTypeName(param);
                        if (name)
                            return name;
                    }
                    return null;
                }
                default:
                    return null;
            }
        }
        /**
         * Checks if a node is a destructured variable
         */
        function isDestructured(node) {
            return (node.parent?.type === utils_1.AST_NODE_TYPES.Property ||
                node.parent?.type === utils_1.AST_NODE_TYPES.ArrayPattern ||
                (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    (node.parent.id.type === utils_1.AST_NODE_TYPES.ObjectPattern ||
                        node.parent.id.type === utils_1.AST_NODE_TYPES.ArrayPattern)));
        }
        /**
         * Check variable declarations for React type naming conventions
         */
        function checkVariableDeclaration(node) {
            if (node.id.type !== utils_1.AST_NODE_TYPES.Identifier)
                return;
            // Skip destructured variables
            if (isDestructured(node.id))
                return;
            const variableName = node.id.name;
            // Get the type annotation
            const typeAnnotation = node.id.typeAnnotation?.typeAnnotation;
            const typeName = getTypeName(typeAnnotation);
            if (!typeName)
                return;
            // Check if it's a ReactNode or JSX.Element (should be lowercase)
            if (LOWERCASE_TYPES.includes(typeName) && isUppercase(variableName)) {
                const suggestion = toLowercase(variableName);
                context.report({
                    node: node.id,
                    messageId: 'reactNodeShouldBeLowercase',
                    data: {
                        type: typeName,
                        suggestion,
                    },
                    fix: (fixer) => fixer.replaceText(node.id, suggestion),
                });
            }
            // Check if it's a ComponentType or FC (should be uppercase)
            if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(variableName)) {
                const suggestion = toUppercase(variableName);
                context.report({
                    node: node.id,
                    messageId: 'componentTypeShouldBeUppercase',
                    data: {
                        type: typeName,
                        suggestion,
                    },
                    fix: (fixer) => fixer.replaceText(node.id, suggestion),
                });
            }
        }
        /**
         * Check function parameters for React type naming conventions
         */
        function checkParameter(node) {
            // Skip destructured parameters
            if (isDestructured(node))
                return;
            const paramName = node.name;
            // Get the type annotation
            const typeAnnotation = node.typeAnnotation?.typeAnnotation;
            const typeName = getTypeName(typeAnnotation);
            if (!typeName)
                return;
            // Check if it's a ReactNode or JSX.Element (should be lowercase)
            if (LOWERCASE_TYPES.includes(typeName) && isUppercase(paramName)) {
                const suggestion = toLowercase(paramName);
                context.report({
                    node,
                    messageId: 'reactNodeShouldBeLowercase',
                    data: {
                        type: typeName,
                        suggestion,
                    },
                    fix: (fixer) => fixer.replaceText(node, suggestion),
                });
            }
            // Check if it's a ComponentType or FC (should be uppercase)
            if (UPPERCASE_TYPES.includes(typeName) && !isUppercase(paramName)) {
                const suggestion = toUppercase(paramName);
                context.report({
                    node,
                    messageId: 'componentTypeShouldBeUppercase',
                    data: {
                        type: typeName,
                        suggestion,
                    },
                    fix: (fixer) => fixer.replaceText(node, suggestion),
                });
            }
        }
        return {
            VariableDeclarator: checkVariableDeclaration,
            Identifier(node) {
                // Check parameter names in function declarations
                if (node.parent &&
                    (node.parent.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                        node.parent.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                        node.parent.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) &&
                    node.parent.params.includes(node)) {
                    checkParameter(node);
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-react-type-naming.js.map