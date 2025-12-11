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
            enforceCssMediaQueries: 'Responsive breakpoint "{{source}}" uses JavaScript media detection. JavaScript breakpoints attach resize listeners inside the render path, causing avoidable re-renders and drifting from the single CSS breakpoint source of truth. Move this breakpoint into CSS (@media or container queries) and drive layout changes through class names or CSS-driven props instead of runtime hooks.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const reportUsage = (node, source) => context.report({
            node,
            messageId: 'enforceCssMediaQueries',
            data: { source },
        });
        return {
            // Only react-responsive is handled at the declaration level to avoid duplicates.
            ImportDeclaration(node) {
                if (node.source.value !== 'react-responsive' &&
                    !node.source.value.includes('react-responsive/')) {
                    return;
                }
                reportUsage(node, `react-responsive import "${String(node.source.value)}"`);
            },
            // Handle specific specifiers to avoid duplicate diagnostics.
            ImportSpecifier(node) {
                if (node.parent?.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                    node.imported.type === utils_1.AST_NODE_TYPES.Identifier) {
                    if (node.parent.source.value === '@mui/material' &&
                        node.imported.name === 'useMediaQuery') {
                        reportUsage(node, 'useMediaQuery import from @mui/material');
                        return;
                    }
                    if (node.imported.name === 'useMobile') {
                        reportUsage(node, `useMobile import from ${String(node.parent.source.value)}`);
                        return;
                    }
                }
            },
            // Check for useMediaQuery and useMobile calls
            CallExpression(node) {
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.callee.name === 'useMediaQuery' ||
                        node.callee.name === 'useMobile')) {
                    reportUsage(node, `${node.callee.name} call`);
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-css-media-queries.js.map