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
      let hasFunction = false;
      let hasSymbol = false;
      let hasSpread = false;
      let hasNestedSpread = false;
      let hasNestedObject = false;

      function visit(node: TSESTree.Node, depth = 0): void {
        if (node.type === AST_NODE_TYPES.SpreadElement) {
          hasSpread = true;
          if (depth > 0) {
            hasNestedSpread = true;
          }
        } else if (node.type === AST_NODE_TYPES.FunctionExpression ||
                  node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
          hasFunction = true;
        } else if (node.type === AST_NODE_TYPES.Property &&
                  node.computed &&
                  node.key.type === AST_NODE_TYPES.Identifier &&
                  node.key.name === 'Symbol') {
          hasSymbol = true;
        }

        // Visit child nodes without traversing parent references
        if (node.type === AST_NODE_TYPES.ObjectExpression) {
          if (depth > 0) {
            hasNestedObject = true;
          }
          node.properties.forEach(prop => visit(prop, depth + 1));
        } else if (node.type === AST_NODE_TYPES.Property) {
          visit(node.value, depth);
        } else if (node.type === AST_NODE_TYPES.SpreadElement) {
          visit(node.argument, depth);
        }
      }

      visit(node);
      return hasSpread && hasNestedSpread && hasNestedObject && !hasFunction && !hasSymbol;
    }



    function generateCloneDeepFix(node: TSESTree.ObjectExpression): string {
      const sourceCode = context.getSourceCode();
      const parts: string[] = [];

      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.SpreadElement) {
          const spreadArg = sourceCode.getText(prop.argument);
          parts.push(`...${spreadArg}`);
        } else if (prop.type === AST_NODE_TYPES.Property) {
          const key = prop.computed
            ? `[${sourceCode.getText(prop.key)}]`
            : sourceCode.getText(prop.key);
          const value = sourceCode.getText(prop.value);
          parts.push(`${key}: ${value}`);
        }
      }

      return `cloneDeep({ ${parts.join(', ')} }, {} as const)`;
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
