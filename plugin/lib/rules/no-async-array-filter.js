/**
 * @fileoverview Disallow async callbacks for Array.filter
 * @author Brodie McGuire
 */
'use strict';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem', // `problem`, `suggestion`, or `layout`
    docs: {
      description: 'Disallow async callbacks for Array.filter',
      recommended: true,
      url: null, // URL to the documentation page for this rule
    },
    fixable: 'code',
    schema: [],
    messages: {
      unexpected:
        'Async array filter is dangerous as a Promise object will always be truthy',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'filter' &&
          node.arguments.length > 0
        ) {
          const callback = node.arguments[0];
          if (
            (callback.type === 'FunctionExpression' ||
              callback.type === 'ArrowFunctionExpression') &&
            callback.async === true
          ) {
            context.report({
              node: callback,
              messageId: 'unexpected',
            });
          }
        }
      },
    };
  },
};
