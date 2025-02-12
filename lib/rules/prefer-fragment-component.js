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
        function getReactImportNode() {
            const program = sourceCode.ast;
            for (const node of program.body) {
                if (node.type === utils_1.AST_NODE_TYPES.ImportDeclaration &&
                    node.source.value === 'react') {
                    return node;
                }
            }
            return null;
        }
        function checkFragmentImport(node) {
            if (node.source.value === 'react') {
                reactImportNode = node;
                for (const specifier of node.specifiers) {
                    if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        specifier.imported.name === 'Fragment') {
                        hasFragmentImport = true;
                        break;
                    }
                }
            }
        }
        function addFragmentImport(fixer) {
            if (reactImportNode) {
                // Add Fragment to existing react import
                const lastSpecifier = reactImportNode.specifiers[reactImportNode.specifiers.length - 1];
                return fixer.insertTextAfter(lastSpecifier, ', Fragment');
            }
            // Add new react import with Fragment
            return fixer.insertTextBefore(sourceCode.ast.body[0], 'import { Fragment } from \'react\';\n');
        }
        return {
            ImportDeclaration: checkFragmentImport,
            JSXFragment(node) {
                context.report({
                    node,
                    messageId: 'preferFragment',
                    data: { type: 'shorthand fragment (<>)' },
                    *fix(fixer) {
                        if (!hasFragmentImport) {
                            yield addFragmentImport(fixer);
                        }
                        yield fixer.replaceText(node.openingFragment, '<Fragment>');
                        yield fixer.replaceText(node.closingFragment, '</Fragment>');
                    },
                });
            },
            JSXIdentifier(node) {
                if (node.name === 'Fragment' &&
                    node.parent?.type === utils_1.AST_NODE_TYPES.JSXMemberExpression &&
                    node.parent.object.type === utils_1.AST_NODE_TYPES.JSXIdentifier &&
                    node.parent.object.name === 'React') {
                    const memberExpr = node.parent;
                    context.report({
                        node: memberExpr,
                        messageId: 'preferFragment',
                        data: { type: 'React.Fragment' },
                        *fix(fixer) {
                            if (!hasFragmentImport) {
                                yield addFragmentImport(fixer);
                            }
                            yield fixer.replaceText(memberExpr, 'Fragment');
                        },
                    });
                }
            },
            'Program:exit'() {
                // If we found any violations but no Fragment import, we need to add it
                if (!hasFragmentImport && !reactImportNode) {
                    reactImportNode = getReactImportNode();
                }
            },
        };
    },
});
//# sourceMappingURL=prefer-fragment-component.js.map