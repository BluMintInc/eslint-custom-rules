"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classMethodsReadTopToBottom = void 0;
const createRule_1 = require("../utils/createRule");
const ClassGraphBuilder_1 = require("../utils/graph/ClassGraphBuilder");
function getMemberName(member) {
    if (member.type === 'MethodDefinition' ||
        member.type === 'PropertyDefinition') {
        return member.key.type === 'Identifier' ? member.key.name : null;
    }
    return null;
}
exports.classMethodsReadTopToBottom = (0, createRule_1.createRule)({
    name: 'class-methods-read-top-to-bottom',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Ensures classes read linearly from top to bottom.',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            classMethodsReadTopToBottom: 'Methods should be ordered for top-down readability.',
        },
        fixable: 'code', // To allow ESLint to autofix issues.
    },
    defaultOptions: [],
    create(context) {
        let className;
        return {
            ClassDeclaration(node) {
                className = node.id?.name || '';
            },
            'ClassBody:exit'(node) {
                const graphBuilder = new ClassGraphBuilder_1.ClassGraphBuilder(className, node);
                const sortedOrder = graphBuilder.memberNamesSorted;
                const actualOrder = node.body
                    .map((member) => member.type === 'MethodDefinition' ||
                    member.type === 'PropertyDefinition'
                    ? member.key.name
                    : null)
                    .filter(Boolean);
                for (let i = 0; i < actualOrder.length; i++) {
                    if (actualOrder[i] !== sortedOrder[i]) {
                        const sourceCode = context.getSourceCode();
                        const newClassBody = sortedOrder
                            .map((n) => {
                            // Fetch the actual AST node corresponding to the name
                            const memberNode = node.body.find((member) => getMemberName(member) === n);
                            if (!memberNode) {
                                return '';
                            }
                            const comments = sourceCode.getCommentsBefore(memberNode) || [];
                            const nodeRange = memberNode.range;
                            const newRange = comments.length > 0
                                ? [
                                    Math.min(nodeRange[0], Math.min(...comments.map((comment) => comment.range[0]))),
                                    Math.max(nodeRange[1], Math.max(...comments.map((comment) => comment.range[1]))),
                                ]
                                : nodeRange;
                            return sourceCode.getText({ ...memberNode, range: newRange });
                        })
                            .filter(Boolean)
                            .join('\n');
                        return context.report({
                            node,
                            messageId: 'classMethodsReadTopToBottom',
                            fix(fixer) {
                                return fixer.replaceTextRange([node.range[0] + 1, node.range[1] - 1], // Exclude the curly braces
                                newClassBody);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=class-methods-read-top-to-bottom.js.map