import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferCloneDeep';

export const preferCloneDeep = createRule<[], MessageIds>({
  name: 'prefer-clone-deep',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer using cloneDeep over nested spread copying',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferCloneDeep:
        'Use cloneDeep from functions/src/util/cloneDeep.ts instead of nested spread operators for deep object copying',
    },
  },
  defaultOptions: [],
  create(context) {
    function hasNestedSpread(node: TSESTree.ObjectExpression): boolean {
      let spreadCount = 0;
      let hasFunction = false;
      let hasSymbol = false;

      function visit(node: TSESTree.Node): void {
        if (node.type === AST_NODE_TYPES.SpreadElement) {
          spreadCount++;
        } else if (node.type === AST_NODE_TYPES.FunctionExpression ||
                  node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
          hasFunction = true;
        } else if (node.type === AST_NODE_TYPES.Property &&
                  node.computed &&
                  node.key.type === AST_NODE_TYPES.Identifier &&
                  node.key.name === 'Symbol') {
          hasSymbol = true;
        }

        for (const key in node) {
          const value = (node as any)[key];
          if (value && typeof value === 'object') {
            visit(value);
          }
        }
      }

      visit(node);
      return spreadCount > 1 && !hasFunction && !hasSymbol;
    }

    function getSourceText(node: TSESTree.Node): string {
      return context.getSourceCode().getText(node);
    }

    function generateCloneDeepFix(node: TSESTree.ObjectExpression): string {
      const sourceText = getSourceText(node);
      return `cloneDeep(${sourceText.replace(/\.\.\./g, '')}, {} as const)`;
    }

    return {
      ObjectExpression(node) {
        if (hasNestedSpread(node)) {
          context.report({
            node,
            messageId: 'preferCloneDeep',
            fix(fixer) {
              return fixer.replaceText(node, generateCloneDeepFix(node));
            },
          });
        }
      },
    };
  },
});
