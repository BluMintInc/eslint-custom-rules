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
        'Case expression uses logical OR "{{expressionText}}", but "||" collapses to a single value so only one operand is ever compared. Move each operand into its own case (e.g., "case {{leftText}}: case {{rightText}}:") to make both values reachable and the switch intent readable.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      SwitchStatement(node: TSESTree.SwitchStatement) {
        for (const switchCase of node.cases) {
          if (
            switchCase.test?.type === 'LogicalExpression' &&
            switchCase.test.operator === '||'
          ) {
            context.report({
              node: switchCase,
              messageId: 'noMisusedSwitchCase',
              data: {
                expressionText: sourceCode.getText(switchCase.test),
                leftText: sourceCode.getText(switchCase.test.left),
                rightText: sourceCode.getText(switchCase.test.right),
              },
            });
          }
        }
      },
    };
  },
});
