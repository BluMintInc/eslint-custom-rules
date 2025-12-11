import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const noMisusedSwitchCase: TSESLint.RuleModule<
  'noMisusedSwitchCase',
  never[]
> = createRule({
  name: 'no-misused-switch-case',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent misuse of logical OR (||) in switch case statements, which can lead to confusing and error-prone code. Instead of using OR operators in case expressions, use multiple case statements in sequence to handle multiple values. This improves code readability and follows the standard switch-case pattern.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMisusedSwitchCase:
        'Case expression uses logical OR "{{expressionText}}", but "||" collapses to a single operand so only one branch is reachable. Move each operand into its own case (e.g., "{{cascadingCases}}") so every value is matched and the switch intent stays clear.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    const flattenLogicalOrOperands = (
      expression: TSESTree.Expression,
    ): string[] => {
      const operands: string[] = [];

      const visit = (node: TSESTree.Expression) => {
        if (node.type === 'LogicalExpression' && node.operator === '||') {
          visit(node.left);
          visit(node.right);
          return;
        }

        operands.push(sourceCode.getText(node));
      };

      visit(expression);

      return operands;
    };

    return {
      SwitchStatement(node: TSESTree.SwitchStatement) {
        for (const switchCase of node.cases) {
          if (
            switchCase.test?.type === 'LogicalExpression' &&
            switchCase.test.operator === '||'
          ) {
            const operands = flattenLogicalOrOperands(switchCase.test);

            context.report({
              node: switchCase,
              messageId: 'noMisusedSwitchCase',
              data: {
                expressionText: sourceCode.getText(switchCase.test),
                cascadingCases: operands
                  .map((operand) => `case ${operand}:`)
                  .join(' '),
              },
            });
          }
        }
      },
    };
  },
});
