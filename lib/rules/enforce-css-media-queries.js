"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceCssMediaQueries = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
/**
 * This rule enforces the use of CSS media queries instead of JavaScript-based breakpoints
 * in React components for better performance and separation of concerns.
 */
exports.enforceCssMediaQueries = (0, createRule_1.createRule)({
    name: 'enforce-css-media-queries',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce CSS media queries over JS breakpoints',
            recommended: 'error',
        },
        messages: {
            enforceCssMediaQueries: 'Use CSS media queries instead of JavaScript breakpoints for responsive design. JavaScript breakpoint handling can cause unnecessary re-renders and impact performance.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            // Check for Material-UI's useMediaQuery and react-responsive imports
            ImportDeclaration(node) {
                // Check for @mui/material useMediaQuery
                if (node.source.value === '@mui/material' &&
                    node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'useMediaQuery')) {
                    context.report({
                        node,
                        messageId: 'enforceCssMediaQueries',
                    });
                }
                // Check for react-responsive imports
                if (node.source.value === 'react-responsive' ||
                    node.source.value.includes('react-responsive/')) {
                    context.report({
                        node,
                        messageId: 'enforceCssMediaQueries',
                    });
                }
                // Check for useMobile import from hooks/useMobile
                if (node.source.value.includes('hooks/useMobile') &&
                    node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                        specifier.imported.name === 'useMobile')) {
                    context.report({
                        node,
                        messageId: 'enforceCssMediaQueries',
                    });
                }
            },
            // Check for specific import specifiers
            ImportSpecifier(node) {
                if (node.parent &&
                    node.parent.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                    node.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (
                    // Check for useMediaQuery from @mui/material
                    (node.parent.source.value === '@mui/material' &&
                        node.imported.name === 'useMediaQuery') ||
                        // Check for useMobile from any source
                        node.imported.name === 'useMobile')) {
                    context.report({
                        node,
                        messageId: 'enforceCssMediaQueries',
                    });
                }
            },
            // Check for useMediaQuery and useMobile calls
            CallExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.callee.name === 'useMediaQuery' || node.callee.name === 'useMobile')) {
                    context.report({
                        node,
                        messageId: 'enforceCssMediaQueries',
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-css-media-queries.js.map