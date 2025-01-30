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
      description: 'Prevent misuse of logical OR in switch case statements',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMisusedSwitchCase:
        'Avoid using logical OR (||) in switch case statements. Instead of `case x || y:`, use cascading cases like `case x: case y:`.',
    },
  },
  defaultOptions: [],
  create(context) {
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
            });
          }
        }
      },
    };
  },
});
