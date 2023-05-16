import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
const arrayMethods = ['map', 'filter', 'forEach', 'reduce', 'some', 'every'];

const arrayMethodsThisContext: TSESLint.RuleModule<'preferArrow' | 'unexpected', never[]> =
  createRule({
    create(context) {
        return {
          CallExpression(node: TSESTree.CallExpression) {
            // Array method called with a class method reference
            if (
              node.callee.type === 'MemberExpression' &&
              node.callee.property.type === 'Identifier' &&
              arrayMethods.includes(node.callee.property.name) &&
              node.arguments.length > 0 &&
              node.arguments[0].type === 'MemberExpression' &&
              node.arguments[0].object.type === 'ThisExpression'
            ) {
              context.report({
                node: node.arguments[0],
                messageId: 'unexpected'
              });
            }
            
            // Function expression bound to `this` in array method
            else if (
              node.callee.type === 'MemberExpression' &&
              node.callee.property.type === 'Identifier' &&
              arrayMethods.includes(node.callee.property.name) &&
              node.arguments.length > 0 &&
              node.arguments[0].type === 'CallExpression' &&
              node.arguments[0].callee.type === 'MemberExpression' &&
              node.arguments[0].callee.object.type === 'FunctionExpression' &&
              node.arguments[0].callee.property.type === 'Identifier' &&
              node.arguments[0].callee.property.name === 'bind' &&
              node.arguments[0].arguments.length > 0 &&
              node.arguments[0].arguments[0].type === 'ThisExpression'
            ) {
              context.report({
                node: node.arguments[0],
                messageId:'preferArrow'
              });
            }
          },
        };
      },

    name: 'array-methods-this-context',
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow async callbacks for Array.filter',
        recommended: 'error',
      },
      schema: [],
      messages: {
        unexpected:
        'Use an arrow function to preserve "this" context.',
        preferArrow: 'Use an arrow function instead of binding this.'
      },
    },
    defaultOptions: [],
  });

export {arrayMethodsThisContext}
