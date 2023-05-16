import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

const noFilterWithoutReturn: TSESLint.RuleModule<'unexpected', never[]> =
  createRule({
    create(context) {
        function isNode(value: unknown): value is TSESTree.Node {
            return typeof value === 'object' 
              && value !== null 
              && 'type' in value;
          }
          
          function hasReturnStatement(node: TSESTree.Node): boolean {
            if (node.type === 'ReturnStatement') {
              return true;
            } else if (node.type === 'IfStatement') {
              // Check both branches of the if statement
              const consequentHasReturn = hasReturnStatement(node.consequent);
              const alternateHasReturn = !!node.alternate && hasReturnStatement(node.alternate);
              return consequentHasReturn && alternateHasReturn;
            } else if (node.type === 'BlockStatement') {
              // Check all statements in the block
              for (const statement of node.body) {
                if (hasReturnStatement(statement)) {
                  return true;
                }
              }
            }
          
            for (const key in node) {
              if (key === 'parent') {
                continue; // Ignore the parent property
              }
              const value = node[key as keyof typeof node];
              if (isNode(value)) {
                if (hasReturnStatement(value)) {
                  return true;
                }
              }
            }
          
            return false;
          }
          
    
        return {
          'CallExpression[callee.property.name="filter"]'(node: TSESTree.CallExpression) {
            const callback = node.arguments[0];
            if (callback && callback.type === 'ArrowFunctionExpression') {
              const { body } = callback;
    
              if (body.type !== 'BlockStatement') {
                // If the body is not a block statement, it's a direct return
                return;
              }
    
              // Check if there's a ReturnStatement inside
              if (!hasReturnStatement(body)) {
                context.report({
                  node,
                  messageId: 'unexpected',
                });
              }
            }
          },
        
          }},

    name: 'no-filter-without-return',
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow Array.filter callbacks without an explicit return (if part of a block statement)',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
          'An array filter callback with a block statement must contain a return statement',
      },
    },
    defaultOptions: [],
  });

export {noFilterWithoutReturn}
