"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferFragmentComponent = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.preferFragmentComponent = (0, createRule_1.createRule)({
    name: 'prefer-fragment-component',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using Fragment imported from react over shorthand fragments and React.Fragment',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferFragment: 'Use Fragment imported from react instead of {{type}}',
            addFragmentImport: 'Add Fragment import from react',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        let hasFragmentImport = false;
        let reactImportNode = null;
        let defaultReactImportNode = null;
        // Track nodes we've already reported to avoid duplicates
        const reportedNodes = new Set();
        /**
         * Checks if a node is a React.Fragment element
         */
        function isReactFragment(node) {
            return (node.name.type === utils_1.AST_NODE_TYPES.JSXMemberExpression &&
                node.name.object.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                node.name.object.name === 'React' &&
                node.name.property.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                node.name.property.name === 'Fragment');
        }
        /**
         * Finds if a node has a React.Fragment parent
         */
        function findReactFragmentParent(node) {
            let current = node;
            // Check parent chain until we find a JSXElement with React.Fragment
            while (current && current.parent) {
                current = current.parent;
                if (current.type === utils_1.AST_NODE_TYPES.JSXElement &&
                    current.openingElement &&
                    isReactFragment(current.openingElement)) {
                    return current;
                }
            }
            return null;
        }
        /**
         * Check if a node is inside a JSX fragment
         */
        function isInsideJSXFragment(node) {
            let current = node;
            // Check parent chain until we find a JSXFragment
            while (current && current.parent) {
                current = current.parent;
                if (current.type === utils_1.AST_NODE_TYPES.JSXFragment) {
                    return current;
                }
            }
            return null;
        }
        /**
         * Checks for Fragment import from react
         */
        function checkFragmentImport(node) {
            if (node.source.value === 'react') {
                // Keep track of all React imports
                if (!reactImportNode) {
                    reactImportNode = node;
                }
                // Keep track of default import for prioritization
                const hasDefaultImport = node.specifiers.some(spec => spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
                if (hasDefaultImport) {
                    defaultReactImportNode = node;
                }
                // Check if Fragment is already imported
                for (const specifier of node.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.name === 'Fragment') {
                        hasFragmentImport = true;
                        break;
                    }
                }
            }
        }
        /**
         * Adds Fragment import to an appropriate React import or creates a new one
         */
        function addFragmentImport(fixer) {
            // Use default import if available, otherwise use first React import
            const targetImportNode = defaultReactImportNode || reactImportNode;
            if (targetImportNode) {
                // Check if it's a namespace import
                const hasNamespaceImport = targetImportNode.specifiers.some(spec => spec.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier);
                if (hasNamespaceImport) {
                    // Add separate import for Fragment
                    return fixer.insertTextAfter(targetImportNode, "\nimport { Fragment } from 'react';");
                }
                // Add Fragment to existing React import
                const lastSpecifier = targetImportNode.specifiers[targetImportNode.specifiers.length - 1];
                const hasNamedImports = targetImportNode.specifiers.some(spec => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier);
                if (hasNamedImports) {
                    return fixer.insertTextAfter(lastSpecifier, ', Fragment');
                }
                else {
                    return fixer.insertTextAfter(lastSpecifier, ', { Fragment }');
                }
            }
            // No React import found, create a new one
            const importText = "import { Fragment } from 'react';\n";
            const indentation = sourceCode.text.match(/^[ \t]*/m)?.[0] || '';
            return fixer.insertTextBefore(sourceCode.ast.body[0], indentation + importText);
        }
        return {
            ImportDeclaration: checkFragmentImport,
            // Find JSX Fragment shorthand (<></>)
            JSXFragment(node) {
                // Skip if already reported
                if (reportedNodes.has(node)) {
                    return;
                }
                // Track that we've seen this node
                reportedNodes.add(node);
                // Special handling for nested fragments
                const reactFragmentParent = findReactFragmentParent(node);
                // Check if this fragment contains React.Fragment children
                const hasReactFragmentChild = node.children.some(child => child.type === utils_1.AST_NODE_TYPES.JSXElement &&
                    child.openingElement.name.type === utils_1.AST_NODE_TYPES.JSXMemberExpression &&
                    child.openingElement.name.object.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    child.openingElement.name.object.name === 'React' &&
                    child.openingElement.name.property.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    child.openingElement.name.property.name === 'Fragment');
                // For nested fragments, we have multiple test cases with different expected behaviors
                if (reactFragmentParent) {
                    // This is a fragment inside a React.Fragment
                    // Report on this JSX fragment
                    context.report({
                        node,
                        messageId: 'preferFragment',
                        data: { type: 'shorthand fragment (<>)' },
                        fix(fixer) {
                            const fixes = [];
                            // Add Fragment import if needed
                            if (!hasFragmentImport) {
                                fixes.push(addFragmentImport(fixer));
                                hasFragmentImport = true;
                            }
                            // Fix the outer React.Fragment
                            const outerOpeningElement = reactFragmentParent.openingElement;
                            const outerOpeningText = sourceCode.getText(outerOpeningElement);
                            const newOuterOpeningText = outerOpeningText.replace('React.Fragment', 'Fragment');
                            fixes.push(fixer.replaceText(outerOpeningElement, newOuterOpeningText));
                            if (reactFragmentParent.closingElement) {
                                const outerClosingText = sourceCode.getText(reactFragmentParent.closingElement);
                                const newOuterClosingText = outerClosingText.replace('React.Fragment', 'Fragment');
                                fixes.push(fixer.replaceText(reactFragmentParent.closingElement, newOuterClosingText));
                            }
                            // Fix the inner shorthand fragment
                            const innerOpeningText = sourceCode.getText(node.openingFragment);
                            const innerClosingText = sourceCode.getText(node.closingFragment);
                            const newInnerOpeningText = innerOpeningText.replace('<>', '<Fragment>');
                            const newInnerClosingText = innerClosingText.replace('</>', '</Fragment>');
                            fixes.push(fixer.replaceText(node.openingFragment, newInnerOpeningText));
                            fixes.push(fixer.replaceText(node.closingFragment, newInnerClosingText));
                            return fixes;
                        }
                    });
                    // Also report on the parent React.Fragment
                    context.report({
                        node: reactFragmentParent.openingElement.name,
                        messageId: 'preferFragment',
                        data: { type: 'React.Fragment' }
                    });
                    // Mark the parent as already handled
                    reportedNodes.add(reactFragmentParent);
                    reportedNodes.add(reactFragmentParent.openingElement);
                    reportedNodes.add(reactFragmentParent.openingElement.name);
                    return;
                }
                // Special case: JSX Fragment with React.Fragment child (don't convert outer fragment)
                else if (hasReactFragmentChild) {
                    // Just report the error but don't fix the outer fragment
                    context.report({
                        node,
                        messageId: 'preferFragment',
                        data: { type: 'shorthand fragment (<>)' },
                        // No fix here - we'll let the inner React.Fragment visitor handle it
                    });
                    return;
                }
                // Standard handling for standalone JSX fragments
                context.report({
                    node,
                    messageId: 'preferFragment',
                    data: { type: 'shorthand fragment (<>)' },
                    fix(fixer) {
                        const fixes = [];
                        // Add Fragment import if needed
                        if (!hasFragmentImport) {
                            fixes.push(addFragmentImport(fixer));
                            hasFragmentImport = true;
                        }
                        // Replace fragment tags
                        const openingText = sourceCode.getText(node.openingFragment);
                        const closingText = sourceCode.getText(node.closingFragment);
                        const newOpeningText = openingText.replace('<>', '<Fragment>');
                        const newClosingText = closingText.replace('</>', '</Fragment>');
                        fixes.push(fixer.replaceText(node.openingFragment, newOpeningText));
                        fixes.push(fixer.replaceText(node.closingFragment, newClosingText));
                        return fixes;
                    }
                });
            },
            // Find React.Fragment usage
            JSXOpeningElement(node) {
                // Only process React.Fragment elements
                if (!isReactFragment(node)) {
                    return;
                }
                // Skip if already reported
                if (reportedNodes.has(node) || reportedNodes.has(node.name)) {
                    return;
                }
                const jsxElement = node.parent;
                if (!jsxElement || jsxElement.type !== utils_1.AST_NODE_TYPES.JSXElement) {
                    return;
                }
                // Mark as reported
                reportedNodes.add(node);
                reportedNodes.add(node.name);
                // Check if this React.Fragment has a JSXFragment child
                const hasJSXFragmentChild = jsxElement.children.some(child => child.type === utils_1.AST_NODE_TYPES.JSXFragment);
                // Check if this React.Fragment is inside a JSXFragment
                const fragmentParent = isInsideJSXFragment(node);
                // Special case: React.Fragment inside a JSX Fragment
                if (fragmentParent) {
                    // Have to report on it even if we don't fix it here
                    context.report({
                        node: node.name,
                        messageId: 'preferFragment',
                        data: { type: 'React.Fragment' },
                        fix(fixer) {
                            const fixes = [];
                            // Add Fragment import if needed
                            if (!hasFragmentImport) {
                                fixes.push(addFragmentImport(fixer));
                                hasFragmentImport = true;
                            }
                            // Replace opening tag
                            const openingText = sourceCode.getText(node);
                            const newOpeningText = openingText.replace('React.Fragment', 'Fragment');
                            fixes.push(fixer.replaceText(node, newOpeningText));
                            // Replace closing tag if it exists
                            if (jsxElement.closingElement) {
                                const closingText = sourceCode.getText(jsxElement.closingElement);
                                const newClosingText = closingText.replace('React.Fragment', 'Fragment');
                                fixes.push(fixer.replaceText(jsxElement.closingElement, newClosingText));
                            }
                            return fixes;
                        }
                    });
                    return;
                }
                // If this React.Fragment contains a JSXFragment, skip it as it will be
                // handled by the JSXFragment visitor for proper nesting
                if (hasJSXFragmentChild) {
                    return;
                }
                context.report({
                    node: node.name,
                    messageId: 'preferFragment',
                    data: { type: 'React.Fragment' },
                    fix(fixer) {
                        const fixes = [];
                        // Add Fragment import if needed
                        if (!hasFragmentImport) {
                            fixes.push(addFragmentImport(fixer));
                            hasFragmentImport = true;
                        }
                        // Replace opening tag
                        const openingText = sourceCode.getText(node);
                        const newOpeningText = openingText.replace('React.Fragment', 'Fragment');
                        fixes.push(fixer.replaceText(node, newOpeningText));
                        // Replace closing tag if it exists
                        if (jsxElement.closingElement) {
                            const closingText = sourceCode.getText(jsxElement.closingElement);
                            const newClosingText = closingText.replace('React.Fragment', 'Fragment');
                            fixes.push(fixer.replaceText(jsxElement.closingElement, newClosingText));
                        }
                        return fixes;
                    }
                });
            },
            'Program:exit'() {
                // Find appropriate React import for adding Fragment
                if (!hasFragmentImport) {
                    // Get all React imports
                    const reactImports = [];
                    for (const node of sourceCode.ast.body) {
                        if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                            node.source.value === 'react') {
                            reactImports.push(node);
                        }
                    }
                    // Prioritize default import for adding Fragment
                    if (reactImports.length > 0) {
                        for (const importNode of reactImports) {
                            const hasDefaultImport = importNode.specifiers.some(spec => spec.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier);
                            if (hasDefaultImport) {
                                defaultReactImportNode = importNode;
                                reactImportNode = importNode;
                                break;
                            }
                        }
                        // If no default import found, use the first import
                        if (!defaultReactImportNode && reactImports.length > 0) {
                            reactImportNode = reactImports[0];
                        }
                    }
                }
            }
        };
    }
});
//# sourceMappingURL=prefer-fragment-component.js.map