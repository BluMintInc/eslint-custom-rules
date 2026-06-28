"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnusedUseState = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule = utils_1.ESLintUtils.RuleCreator((name) => `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`);
/**
 * Rule to detect and remove unused useState hooks in React components
 * This rule identifies cases where the state variable from useState is ignored (e.g., replaced with _)
 */
exports.noUnusedUseState = createRule({
    name: 'no-unused-usestate',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow unused useState hooks',
            recommended: 'error',
        },
        fixable: 'code',
        messages: {
            unusedUseState: 'State value "{{stateName}}" from useState is discarded. React still allocates state and re-renders for a value you never read, which misleads readers into thinking the component depends on that state. Remove the useState pair or switch to a ref/derived value when you only need the setter-style side effect.',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            // Look for variable declarations that destructure from useState
            VariableDeclarator(node) {
                // Check if it's an array pattern (destructuring)
                if (node.id.type === utils_1.TSESTree.AST_NODE_TYPES.ArrayPattern &&
                    node.init?.type === utils_1.TSESTree.AST_NODE_TYPES.CallExpression) {
                    const callExpression = node.init;
                    // Check if the call is to useState
                    if (callExpression.callee.type === utils_1.TSESTree.AST_NODE_TYPES.Identifier &&
                        callExpression.callee.name === 'useState') {
                        const arrayPattern = node.id;
                        // Check if the first element is ignored (named _ or unused)
                        if (arrayPattern.elements.length > 0 &&
                            arrayPattern.elements[0] &&
                            arrayPattern.elements[0].type ===
                                utils_1.TSESTree.AST_NODE_TYPES.Identifier &&
                            (arrayPattern.elements[0].name === '_' ||
                                arrayPattern.elements[0].name.startsWith('_'))) {
                            const stateIdentifier = arrayPattern.elements[0];
                            context.report({
                                node,
                                messageId: 'unusedUseState',
                                data: {
                                    stateName: stateIdentifier.name,
                                },
                                fix: (fixer) => {
                                    // Remove the entire useState declaration
                                    const sourceCode = context.sourceCode;
                                    const parentStatement = node.parent;
                                    if (parentStatement &&
                                        parentStatement.type ===
                                            utils_1.TSESTree.AST_NODE_TYPES.VariableDeclaration) {
                                        // If this is the only declarator, remove the entire statement and any extra whitespace
                                        if (parentStatement.declarations.length === 1) {
                                            // Get the next token after the statement to handle whitespace properly
                                            const nextToken = sourceCode.getTokenAfter(parentStatement, { includeComments: true });
                                            if (nextToken) {
                                                // Remove the statement and any whitespace up to the next token
                                                return fixer.removeRange([
                                                    parentStatement.range[0],
                                                    nextToken.range[0],
                                                ]);
                                            }
                                            return fixer.remove(parentStatement);
                                        }
                                        // Otherwise, just remove this declarator and any trailing comma
                                        const declaratorRange = node.range;
                                        // Check if there's a comma after this declarator
                                        const tokenAfter = sourceCode.getTokenAfter(node);
                                        if (tokenAfter && tokenAfter.value === ',') {
                                            return fixer.removeRange([
                                                declaratorRange[0],
                                                tokenAfter.range[1],
                                            ]);
                                        }
                                        // Check if there's a comma before this declarator
                                        const tokenBefore = sourceCode.getTokenBefore(node);
                                        if (tokenBefore && tokenBefore.value === ',') {
                                            return fixer.removeRange([
                                                tokenBefore.range[0],
                                                declaratorRange[1],
                                            ]);
                                        }
                                        return fixer.remove(node);
                                    }
                                    return null;
                                },
                            });
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-unused-usestate.js.map